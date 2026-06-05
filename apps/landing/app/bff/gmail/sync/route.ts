import { createClient, getUserFromRequest } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { google } from "googleapis";
import { env } from "@/env";
import { inngest } from "@/lib/inngest";
import { getFlag } from "@kairo/feature-flags";
import { upsertConversationByThread } from "@/lib/ingestion/conversations";
import { findOrCreateTicketForThread } from "@/lib/ingestion/tickets-by-thread";
import { linkMessageToTicket } from "@/lib/ingestion/ticket-messages";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    // 1. Get authenticated user — Bearer token (dashboard) or cookie fallback
    const {
      data: { user },
      error: authError,
    } = await getUserFromRequest(request, supabase);

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // 2. Resolve accountId from membership
    const { data: memberRow } = await supabase
      .from("account_members")
      .select("account_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("joined_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const accountId = memberRow?.account_id;
    if (!accountId) {
      return NextResponse.json({ error: "No active account found" }, { status: 403 });
    }

    // 3. Get stored Gmail credentials from oauth_credentials (ADR-022 Phase 5 canonical).
    const { data: oauthCred, error: credError } = await supabase
      .from("oauth_credentials")
      .select("access_token_enc, refresh_token_enc, expires_at, external_account_id")
      .eq("account_id", accountId)
      .eq("provider", "gmail")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (credError || !oauthCred) {
      return NextResponse.json(
        { error: "Gmail account not connected" },
        { status: 400 }
      );
    }

    // 4. Get fresh provider tokens from the Supabase session cookie.
    //    provider_token is always fresh when the user is actively logged in via Google.
    const {
      data: { session },
    } = await supabase.auth.getSession();

    // Resolve tokens: prefer live session token over stored credentials.
    const accessToken  = session?.provider_token ?? oauthCred.access_token_enc;
    const refreshToken = session?.provider_refresh_token ?? oauthCred.refresh_token_enc;

    if (!accessToken) {
      return NextResponse.json(
        { error: "Gmail account not connected" },
        { status: 400 }
      );
    }

    // Heal oauth_credentials with fresh session tokens (ADR-022 Phase 5).
    if (session?.provider_token) {
      const healedAt = new Date(Date.now() + 3600 * 1000).toISOString();

      await supabase
        .from("oauth_credentials")
        .update({
          access_token_enc: session.provider_token,
          ...(session.provider_refresh_token && {
            refresh_token_enc: session.provider_refresh_token,
          }),
          expires_at: healedAt,
        })
        .eq("account_id", accountId)
        .eq("provider", "gmail")
        .eq("external_account_id", oauthCred.external_account_id);
    }

    // 5. Set up Gmail API client
    const oauth2Client = new google.auth.OAuth2(
      env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET
    );

    oauth2Client.setCredentials({
      access_token: accessToken,
      ...(refreshToken ? { refresh_token: refreshToken } : {}),
      expiry_date: session?.provider_token
        ? Date.now() + 3600 * 1000
        : oauthCred.expires_at
          ? new Date(oauthCred.expires_at).getTime()
          : undefined,
    });

    // Persist refreshed tokens back to oauth_credentials automatically
    oauth2Client.on("tokens", async (tokens) => {
      if (tokens.access_token) {
        await supabase
          .from("oauth_credentials")
          .update({
            access_token_enc: tokens.access_token,
            expires_at: tokens.expiry_date
              ? new Date(tokens.expiry_date).toISOString()
              : new Date(Date.now() + 3600 * 1000).toISOString(),
          })
          .eq("account_id", accountId)
          .eq("provider", "gmail")
          .eq("external_account_id", oauthCred.external_account_id);
      }
    });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    // 6. Resolve channel_integration_id for this account (KAI-165: required for thread-aware ingestion).
    const { data: channelRow } = await supabase
      .from("channel_integrations")
      .select("id")
      .eq("account_id", accountId)
      .eq("provider", "gmail")
      .limit(1)
      .maybeSingle();
    const channelIntegrationId: string | null = channelRow?.id ?? null;

    if (!channelIntegrationId) {
      console.warn(`[gmail-sync] No channel_integration found for account ${accountId} — messages will not be linked to conversations`);
    }

    // 7. Fetch list of message IDs (up to 100 most recent inbox emails)
    const listResponse = await gmail.users.messages.list({
      userId: "me",
      maxResults: 100,
      q: "in:inbox",
    });

    const messages = listResponse.data.messages || [];

    if (messages.length === 0) {
      return NextResponse.json({
        success: true,
        summary: {
          processed: 0,
          created: 0,
          skipped: 0,
          total: 0,
          message: "No emails found in inbox",
        },
      });
    }

    // 8. Process each message
    let processed = 0;
    let created = 0;
    let skipped = 0;

    for (const message of messages) {
      try {
        // Deduplication: check if message already imported by gmail_message_id
        if (channelIntegrationId) {
          const { count } = await supabase
            .from("messages")
            .select("id", { count: "exact", head: true })
            .eq("account_id", accountId)
            .eq("channel_integration_id", channelIntegrationId)
            .eq("external_id", message.id!);

          if (count && count > 0) {
            skipped++;
            continue;
          }
        } else {
          // Legacy dedup path (no channel_integration yet)
          const { count } = await supabase
            .from("tickets")
            .select("id", { count: "exact", head: true })
            .eq("account_id", accountId)
            .eq("gmail_message_id", message.id!);

          if (count && count > 0) {
            skipped++;
            continue;
          }
        }

        // Fetch full message details
        const msgResponse = await gmail.users.messages.get({
          userId: "me",
          id: message.id!,
          format: "full",
        });

        const msg = msgResponse.data;
        const headers = msg.payload?.headers || [];

        const getHeader = (name: string) =>
          headers.find(
            (h) => h.name?.toLowerCase() === name.toLowerCase()
          )?.value || "";

        const subject = getHeader("Subject") || "(No Subject)";
        const from = getHeader("From");
        const to = getHeader("To");
        const date = getHeader("Date");
        const receivedAt = date
          ? new Date(date).toISOString()
          : new Date().toISOString();

        const fromMatch = from.match(/^(.+?)\s*<(.+?)>$/) || [null, null, from];
        const fromName  = fromMatch[1]?.trim() || null;
        const fromEmail = fromMatch[2]?.trim() || from;

        let bodyPlain = "";
        let bodyHtml  = "";

        const extractBody = (parts: any[]): void => {
          for (const part of parts) {
            if (part.mimeType === "text/plain" && part.body?.data) {
              bodyPlain += Buffer.from(part.body.data, "base64").toString("utf-8");
            } else if (part.mimeType === "text/html" && part.body?.data) {
              bodyHtml += Buffer.from(part.body.data, "base64").toString("utf-8");
            } else if (part.parts) {
              extractBody(part.parts);
            }
          }
        };

        if (msg.payload?.parts) {
          extractBody(msg.payload.parts);
        } else if (msg.payload?.body?.data) {
          const decoded = Buffer.from(msg.payload.body.data, "base64").toString("utf-8");
          if (msg.payload.mimeType === "text/plain") {
            bodyPlain = decoded;
          } else {
            bodyHtml = decoded;
          }
        }

        const threadId = msg.threadId || null;
        let insertedTicketId: string | null = null;

        if (channelIntegrationId && threadId) {
          // KAI-165: Thread-aware path — upsert conversation, find-or-create ticket, link message.
          try {
            const { conversation_id } =
              await upsertConversationByThread(supabase, {
                accountId,
                channelIntegrationId,
                externalThreadId: threadId,
                customerExternalId: fromEmail,
                customerDisplayName: fromName,
              });

            const { ticket_id, was_created } = await findOrCreateTicketForThread(supabase, {
              accountId,
              conversationId: conversation_id,
              originatingUserId: user.id,
              originMessage: {
                subject,
                from_email: fromEmail,
                from_name: fromName,
                to_email: to || null,
                body_plain: bodyPlain || null,
                body_html: bodyHtml || null,
                snippet: msg.snippet || null,
                gmail_message_id: message.id!,
                gmail_thread_id: threadId,
                received_at: receivedAt,
              },
            });

            insertedTicketId = was_created ? ticket_id : null;
            if (was_created) created++;

            // Upsert message row
            const { data: msgRow } = await supabase
              .from("messages")
              .upsert(
                {
                  account_id: accountId,
                  conversation_id,
                  channel_integration_id: channelIntegrationId,
                  external_id: message.id!,
                  thread_external_id: threadId,
                  direction: "inbound",
                  received_at: receivedAt,
                  sender_external_id: fromEmail,
                  sender_display_name: fromName,
                  snippet: msg.snippet || null,
                  body_plain: bodyPlain || null,
                  body_html: bodyHtml || null,
                  classification_status: "classified",
                  processing_tier: 1,
                },
                { onConflict: "channel_integration_id,external_id" }
              )
              .select("id")
              .single();

            if (msgRow?.id) {
              await linkMessageToTicket(supabase, {
                ticket_id,
                message_id: msgRow.id,
                is_origin: was_created,
              });
            }
          } catch (threadErr: unknown) {
            console.error(`[gmail-sync] Thread-aware path failed for ${message.id}:`, threadErr);
            // Fallback to legacy path
            const { data: fallbackTicket, error: insertError } = await supabase
              .from("tickets")
              .insert({
                account_id:          accountId,
                originating_user_id: user.id,
                gmail_message_id:    message.id!,
                gmail_thread_id:     threadId,
                subject,
                from_email:  fromEmail,
                from_name:   fromName,
                to_email:    to || null,
                received_at: receivedAt,
                body_plain:  bodyPlain || null,
                body_html:   bodyHtml || null,
                snippet:     msg.snippet || null,
                status:      "open",
              })
              .select("id")
              .single();

            if (!insertError && fallbackTicket) {
              insertedTicketId = fallbackTicket.id;
              created++;
            }
          }
        } else {
          // Legacy path: no channel_integration_id or no threadId
          const { data: insertedTicket, error: insertError } = await supabase
            .from("tickets")
            .insert({
              account_id:          accountId,
              originating_user_id: user.id,
              gmail_message_id:    message.id!,
              gmail_thread_id:     threadId,
              subject,
              from_email:  fromEmail,
              from_name:   fromName,
              to_email:    to || null,
              received_at: receivedAt,
              body_plain:  bodyPlain || null,
              body_html:   bodyHtml || null,
              snippet:     msg.snippet || null,
              status:      "open",
              ticket_type: null,
              priority:    null,
              category:    null,
              sentiment:   null,
            })
            .select("id")
            .single();

          if (insertError) {
            console.error("Insert error for message", message.id, insertError);
          } else {
            insertedTicketId = insertedTicket?.id ?? null;
            created++;
          }
        }

        // KAI-225 — Emit contact-extraction trigger (fire-and-forget, non-blocking).
        if (insertedTicketId && getFlag("enable_contact_extraction")) {
          inngest.send({
            name: "tickets/ticket.created",
            data: { ticketId: insertedTicketId, accountId },
          }).catch((err: unknown) => {
            console.error(`[gmail-sync] tickets/ticket.created send failed for ticket ${insertedTicketId}:`, err);
          });
        }

        processed++;
      } catch (msgError) {
        console.error(`Error processing message ${message.id}:`, msgError);
      }
    }

    return NextResponse.json({
      success: true,
      summary: { processed, created, skipped, total: messages.length },
    });
  } catch (error) {
    console.error("Gmail sync error:", error);
    return NextResponse.json(
      { error: "Failed to sync Gmail. Please try again." },
      { status: 500 }
    );
  }
}
