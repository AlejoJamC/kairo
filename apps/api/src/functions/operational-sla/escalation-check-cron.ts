// ---------------------------------------------------------------------------
// KAI-168 — Operational SLA (by ticket priority) escalation cron.
//
// Deliberately independent Inngest function — separate domain from the
// tenant/plan-tier contractual SLA. Runs on a schedule (default every 5
// minutes, configurable via FEATURE_FLAG_OPERATIONAL_SLA_ESCALATION_CHECK_INTERVAL_MINUTES)
// and, for every open ticket without a first response that has crossed its
// priority's configured escalation threshold, notifies the assigned agent
// (or a supervisor/admin/owner fallback when unassigned) via an in-app
// notification. `ticket_priority_sla_events` guarantees at-most-once
// notification per ticket (idempotency across cron ticks).
//
// Gated OFF by default via `enable_operational_sla_escalation`.
// ---------------------------------------------------------------------------

import { inngest } from "../../lib/inngest.js";
import { supabase } from "../../lib/supabase.js";
import { getFlag, getNumericFlag } from "@kairo/feature-flags";
import { emitTicketEvent } from "../../lib/ticket-events.js";
import {
  computeOperationalSlaTiming,
  buildConfigByPriority,
  type TicketPriority,
} from "../../lib/operational-sla.js";

const intervalMinutes = Math.max(
  1,
  Math.floor(getNumericFlag("operational_sla_escalation_check_interval_minutes"))
);
const CRON_EXPRESSION = `*/${intervalMinutes} * * * *`;

const OPEN_STATUSES = ["open", "in_progress", "awaiting_customer", "reopened"];

interface OpenTicketRow {
  id: string;
  account_id: string;
  priority: string | null;
  received_at: string | null;
  created_at: string;
  first_response_at: string | null;
  assigned_to: string | null;
}

async function resolveRecipientUserId(accountId: string, assignedTo: string | null): Promise<string | null> {
  if (assignedTo) return assignedTo;

  const { data } = await supabase
    .from("account_members")
    .select("user_id")
    .eq("account_id", accountId)
    .eq("status", "active")
    .in("role", ["supervisor", "admin", "owner"])
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return data?.user_id ?? null;
}

export const operationalSlaEscalationCron = inngest.createFunction(
  {
    id: "operational-sla-escalation-cron",
    retries: 0,
    triggers: [{ cron: CRON_EXPRESSION }],
  },
  async ({ step, logger }) => {
    if (!getFlag("enable_operational_sla_escalation")) {
      logger.info("[operational-sla-escalation-cron] flag disabled — skipping tick");
      return { escalated: 0 };
    }

    const openTickets = (await step.run("list-open-tickets", async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select("id, account_id, priority, received_at, created_at, first_response_at, assigned_to")
        .in("status", OPEN_STATUSES)
        .is("first_response_at", null)
        .not("priority", "is", null);

      if (error) {
        throw new Error(`[operational-sla-escalation-cron] failed to list tickets: ${error.message}`);
      }
      return (data ?? []) as OpenTicketRow[];
    })) as OpenTicketRow[];

    if (openTickets.length === 0) {
      return { escalated: 0 };
    }

    const now = new Date().toISOString();
    let escalatedCount = 0;

    // Group by account to fetch each account's SLA config once.
    const ticketsByAccount = new Map<string, OpenTicketRow[]>();
    for (const ticket of openTickets) {
      const list = ticketsByAccount.get(ticket.account_id) ?? [];
      list.push(ticket);
      ticketsByAccount.set(ticket.account_id, list);
    }

    for (const [accountId, ticketsForAccount] of ticketsByAccount) {
      const configByPriority = await step.run(`load-config-${accountId}`, async () => {
        const { data } = await supabase
          .from("ticket_priority_sla_config")
          .select("priority, max_response_seconds, min_response_seconds, risk_alert_seconds, escalation_seconds")
          .eq("account_id", accountId);
        return buildConfigByPriority(data ?? []);
      });

      for (const ticket of ticketsForAccount) {
        const priority = ticket.priority as TicketPriority;
        const startAt = ticket.received_at ?? ticket.created_at;
        const timing = computeOperationalSlaTiming({
          startAt,
          config: configByPriority[priority],
          now,
        });

        if (new Date(now).getTime() < new Date(timing.escalationAt).getTime()) continue;

        const escalated = await step.run(`escalate-${ticket.id}`, async () => {
          // Idempotency guard — unique(ticket_id, event_type) rejects duplicates.
          const { error: insertErr } = await supabase.from("ticket_priority_sla_events").insert({
            ticket_id: ticket.id,
            account_id: accountId,
            event_type: "escalated",
          });
          if (insertErr) return false; // already escalated on a prior tick

          const recipientUserId = await resolveRecipientUserId(accountId, ticket.assigned_to);
          if (recipientUserId) {
            await supabase.from("notifications").insert({
              account_id: accountId,
              recipient_user_id: recipientUserId,
              kind: "sla_escalation",
              ticket_id: ticket.id,
              title: `ANS ${priority} vencido`,
              body: `El ticket lleva más del tiempo de escalamiento configurado sin primera respuesta.`,
            });
          }

          await emitTicketEvent({
            ticketId: ticket.id,
            authorId: null,
            eventType: "escalated",
            metadata: { trigger: "priority_sla_escalation", priority },
          });

          return true;
        });

        if (escalated) escalatedCount++;
      }
    }

    logger.info(`[operational-sla-escalation-cron] escalated ${escalatedCount} ticket(s)`);
    return { escalated: escalatedCount };
  }
);
