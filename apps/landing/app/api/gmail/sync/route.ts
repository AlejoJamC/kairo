import { createClient, getUserFromRequest } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { google } from "googleapis";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    // 1. Get authenticated user — Bearer token (webapp) or cookie fallback
    const {
      data: { user },
      error: authError,
    } = await getUserFromRequest(request, supabase);

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // 2. Get fresh provider tokens from the Supabase session cookie.
    //    When the user logs in via Google, Supabase stores a live provider_token
    //    here. It's always fresh and preferred over anything stored in gmail_accounts.
    const {
      data: { session },
    } = await supabase.auth.getSession();

    // 3. Get stored Gmail tokens
    const { data: gmailAccount, error: gmailError } = await supabase
      .from("gmail_accounts")
      .select("access_token, refresh_token, expires_at, email")
      .eq("user_id", user.id)
      .single();

    if (gmailError || !gmailAccount) {
      return NextResponse.json(
        { error: "Gmail account not connected" },
        { status: 400 }
      );
    }

    // Resolve tokens: prefer the session's live provider_token (always current when
    // the user is actively logged in via Google) over the stored tokens which may be
    // stale or missing a refresh_token from an older connect flow.
    const accessToken = session?.provider_token || gmailAccount.access_token;
    const refreshToken =
      session?.provider_refresh_token || gmailAccount.refresh_token;

    if (!accessToken) {
      return NextResponse.json(
        { error: "Gmail account not connected" },
        { status: 400 }
      );
    }

    // Heal gmail_accounts with fresh session tokens so future syncs work even
    // without a session cookie (e.g. from a server-side cron).
    if (session?.provider_token) {
      await supabase
        .from("gmail_accounts")
        .update({
          access_token: session.provider_token,
          ...(session.provider_refresh_token && {
            refresh_token: session.provider_refresh_token,
          }),
          expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
        })
        .eq("user_id", user.id);
    }

    // 4. Set up Gmail API client
    const oauth2Client = new google.auth.OAuth2(
      process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );

    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
      expiry_date: session?.provider_token
        ? Date.now() + 3600 * 1000
        : gmailAccount.expires_at
          ? new Date(gmailAccount.expires_at).getTime()
          : undefined,
    });

    // Persist refreshed tokens back to DB automatically
    oauth2Client.on("tokens", async (tokens) => {
      if (tokens.access_token) {
        await supabase
          .from("gmail_accounts")
          .update({
            access_token: tokens.access_token,
            expires_at: tokens.expiry_date
              ? new Date(tokens.expiry_date).toISOString()
              : new Date(Date.now() + 3600 * 1000).toISOString(),
          })
          .eq("user_id", user.id);
      }
    });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    // 5. Fetch list of message IDs (up to 100 most recent inbox emails)
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

    // 6. Process each message
    let processed = 0;
    let created = 0;
    let skipped = 0;

    for (const message of messages) {
      try {
        // Check if message already imported (deduplication)
        const { count } = await supabase
          .from("tickets")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("gmail_message_id", message.id!);

        if (count && count > 0) {
          skipped++;
          continue;
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

        // Extract sender name and email
        const fromMatch = from.match(/^(.+?)\s*<(.+?)>$/) || [
          null,
          null,
          from,
        ];
        const fromName = fromMatch[1]?.trim() || null;
        const fromEmail = fromMatch[2]?.trim() || from;

        // Extract email body from MIME parts
        let bodyPlain = "";
        let bodyHtml = "";

        const extractBody = (parts: any[]): void => {
          for (const part of parts) {
            if (part.mimeType === "text/plain" && part.body?.data) {
              bodyPlain += Buffer.from(part.body.data, "base64").toString(
                "utf-8"
              );
            } else if (part.mimeType === "text/html" && part.body?.data) {
              bodyHtml += Buffer.from(part.body.data, "base64").toString(
                "utf-8"
              );
            } else if (part.parts) {
              extractBody(part.parts);
            }
          }
        };

        if (msg.payload?.parts) {
          extractBody(msg.payload.parts);
        } else if (msg.payload?.body?.data) {
          const decoded = Buffer.from(msg.payload.body.data, "base64").toString(
            "utf-8"
          );
          if (msg.payload.mimeType === "text/plain") {
            bodyPlain = decoded;
          } else {
            bodyHtml = decoded;
          }
        }

        // Insert ticket into database
        const { error: insertError } = await supabase.from("tickets").insert({
          user_id: user.id,
          gmail_message_id: message.id!,
          gmail_thread_id: msg.threadId || null,
          subject,
          from_email: fromEmail,
          from_name: fromName,
          to_email: to || null,
          received_at: receivedAt,
          body_plain: bodyPlain || null,
          body_html: bodyHtml || null,
          snippet: msg.snippet || null,
          status: "open",
          ticket_type: null,
          priority: null,
          category: null,
          sentiment: null,
        });

        if (insertError) {
          console.error("Insert error for message", message.id, insertError);
          // Continue processing other messages
        } else {
          created++;
        }

        processed++;
      } catch (msgError) {
        console.error(`Error processing message ${message.id}:`, msgError);
        // Continue with next message
      }
    }

    return NextResponse.json({
      success: true,
      summary: {
        processed,
        created,
        skipped,
        total: messages.length,
      },
    });
  } catch (error) {
    console.error("Gmail sync error:", error);
    return NextResponse.json(
      { error: "Failed to sync Gmail. Please try again." },
      { status: 500 }
    );
  }
}
