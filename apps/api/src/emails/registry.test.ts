import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import {
  buildTicketId,
  renderAcknowledgement,
  renderAgentReply,
  renderResolved,
  renderCsatSurvey,
  renderEscalated,
} from "./registry.js";
import type {
  AcknowledgementVars,
  AgentReplyVars,
  ResolvedVars,
  CsatSurveyVars,
  EscalatedVars,
} from "./types.js";

const base = {
  customer_name: "Ada Lovelace",
  ticket_id: "KAI-T-453",
  ticket_subject: "No puedo acceder a mi cuenta",
  help_center_url: "https://help.kairo.test",
  status_url: "https://status.kairo.test",
  privacy_url: "https://kairo.test/privacy",
  unsubscribe_url: "https://kairo.test/unsubscribe",
};

const ackVars: AcknowledgementVars = {
  ...base,
  ticket_url: "https://kairo.test/tickets/453",
  ticket_category: "account_access",
  ticket_created_at: "10 de junio de 2026, 14:32",
};

const agentReplyVars: AgentReplyVars = {
  ...base,
  ticket_url: "https://kairo.test/tickets/453",
  agent_name: "Bea",
  agent_role: "Soporte N2",
  agent_initials: "BC",
  agent_message: "<p>Ya restablecimos tu acceso.</p>",
  sent_at: "10 de junio de 2026, 15:00",
  original_message: "<p>No puedo entrar a mi cuenta</p>",
};

const resolvedVars: ResolvedVars = {
  ...base,
  ticket_url: "https://kairo.test/tickets/453",
  agent_name: "Bea",
  agent_initials: "BC",
  resolution_summary: "<p>Resuelto: restablecimos tu contraseña.</p>",
  resolved_at: "10 de junio de 2026, 15:10",
  time_to_resolve: "4h 12m",
  message_count: 3,
  csat_url: "https://kairo.test/csat/453",
  reopen_url: "https://kairo.test/tickets/453/reopen",
};

const csatVars: CsatSurveyVars = {
  ...base,
  agent_name: "Bea",
  csat_url: "https://kairo.test/csat/453",
};

const escalatedVars: EscalatedVars = {
  ...base,
  ticket_url: "https://kairo.test/tickets/453",
  specialist_name: "Carla",
  specialist_role: "Especialista de Producto",
  specialist_initials: "CR",
  priority_sla: "2 horas",
};

describe("buildTicketId", () => {
  it("formats KAI-T-<ticket_number>", () => {
    expect(buildTicketId(453)).toBe("KAI-T-453");
  });
});

describe("renderAcknowledgement", () => {
  it("renders the full contract with no residual placeholders", () => {
    const html = renderAcknowledgement(ackVars);
    expect(html).not.toMatch(/\{\{[a-z_]+\}\}/);
    expect(html).toContain(ackVars.customer_name);
    expect(html).toContain(ackVars.ticket_id);
    expect(html).toContain(ackVars.ticket_category);
    expect(html).toContain(ackVars.ticket_created_at);
  });
});

describe("renderAgentReply", () => {
  it("renders the full contract with no residual placeholders", () => {
    const html = renderAgentReply(agentReplyVars);
    expect(html).not.toMatch(/\{\{[a-z_]+\}\}/);
    expect(html).toContain(agentReplyVars.agent_name);
    expect(html).toContain(agentReplyVars.sent_at);
  });

  it("sanitizes agent_message and original_message", () => {
    const html = renderAgentReply({
      ...agentReplyVars,
      agent_message: '<p onclick="alert(1)">hola<script>alert(1)</script></p>',
      original_message: '<img src=x onerror="alert(1)">texto',
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("onclick=");
    expect(html).not.toContain("onerror=");
    expect(html).toContain("hola");
    expect(html).toContain("texto");
  });
});

describe("renderResolved", () => {
  it("renders the full contract with no residual placeholders, render-ready CSAT/reopen URLs", () => {
    const html = renderResolved(resolvedVars);
    expect(html).not.toMatch(/\{\{[a-z_]+\}\}/);
    expect(html).toContain(`${resolvedVars.csat_url}?score=bad`);
    expect(html).toContain(`${resolvedVars.csat_url}?score=ok`);
    expect(html).toContain(`${resolvedVars.csat_url}?score=good`);
    expect(html).toContain(resolvedVars.reopen_url);
    expect(html).toContain(resolvedVars.time_to_resolve);
    expect(html).toContain(String(resolvedVars.message_count));
  });

  it("sanitizes resolution_summary", () => {
    const html = renderResolved({
      ...resolvedVars,
      resolution_summary: '<p onclick="alert(1)">listo<script>alert(1)</script></p>',
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("onclick=");
    expect(html).toContain("listo");
  });
});

describe("renderCsatSurvey", () => {
  it("renders render-ready with ?score=1..5", () => {
    const html = renderCsatSurvey(csatVars);
    expect(html).not.toMatch(/\{\{[a-z_]+\}\}/);
    for (const score of [1, 2, 3, 4, 5]) {
      expect(html).toContain(`${csatVars.csat_url}?score=${score}`);
    }
  });
});

describe("renderEscalated", () => {
  it("renders render-ready with full specialist contract", () => {
    const html = renderEscalated(escalatedVars);
    expect(html).not.toMatch(/\{\{[a-z_]+\}\}/);
    expect(html).toContain(escalatedVars.specialist_name);
    expect(html).toContain(escalatedVars.specialist_role);
    expect(html).toContain(escalatedVars.specialist_initials);
    expect(html).toContain(escalatedVars.priority_sla);
  });
});

describe("missing variables", () => {
  let warnSpy: ReturnType<typeof mock>;

  beforeEach(() => {
    warnSpy = mock(() => {});
    console.warn = warnSpy;
  });

  afterEach(() => {
    mock.restore();
  });

  it("resolves an empty value to '' and logs a warning instead of leaking a placeholder", () => {
    const html = renderCsatSurvey({ ...csatVars, agent_name: "" });
    expect(html).not.toMatch(/\{\{agent_name\}\}/);
    expect(warnSpy).toHaveBeenCalled();
    const warnedKeys = warnSpy.mock.calls.map((call) => String(call[0]));
    expect(warnedKeys.some((msg) => msg.includes("agent_name"))).toBe(true);
  });
});
