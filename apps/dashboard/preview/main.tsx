import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { UiProvider } from "@kairo/ui";
import { initClientCore } from "@kairo/client-core/config";
import { createWebPlatform } from "@kairo/client-core/web";
import "@kairo/tokens/tokens.css";
import "../src/index.css";
import "../src/i18n/config";
import App from "../src/App";
import { clients, messages, notifications, sidebarCounts } from "./fixtures";
import { saveAllSnapshots, saveSnapshot } from "./capture";

Object.assign(window, { __snapshot: saveSnapshot, __snapshotAll: saveAllSnapshots });

// Answers the dashboard's HTTP calls with fixtures so every screen renders.
const account = { id: "acct-1", industry: "technology", business_context: "We build software." };
const routes: Array<[RegExp, unknown]> = [
  [/\/api\/v1\/sidebar\/counts/, sidebarCounts],
  [/\/api\/v1\/notifications/, { data: notifications }],
  [/\/api\/v1\/notes\/counts/, { data: {} }],
  [/\/api\/v1\/tickets\/[^/]+\/messages/, { data: messages }],
  [/\/api\/v1\/tickets\/[^/]+\/similar/, { data: [] }],
  [/\/api\/v1\/tickets\/[^/]+\/related-history/, { data: [] }],
  [/\/api\/v1\/workflow\/tickets\/[^/]+$/, { decisions: [] }],
  [/\/api\/v1\/tickets\/[^/]+\/client-profile/, { clientId: "c-1", name: "Dana Reyes", email: "dana@acme.com", phone: "+1 555 0100", clientType: "enterprise", activePlan: "Enterprise", planScore: 90, clientSince: "2025-01-10T00:00:00Z", isNewClient: false, isRecurrent: true, totalTickets: 14, ticketsLast30Days: 3, recentTickets: [{ id: "t-90", ticket_number: 90, subject: "Previous export question", status: "resolved", created_at: "2026-09-01T10:00:00Z" }], slaBreachedCount: 1 }],
  [/\/api\/v1\/templates/, { data: [] }],
  [/\/bff\/account\/current/, account],
  [/\/bff\/clients/, { clients }],
];
// Superset of the list keys the endpoints answer with.
const EMPTY = { data: [], cases: [], items: [], decisions: [], articles: [], suggestions: [], reasons: [] };
const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith("/__snapshot/")) return realFetch(input, init);
  if (url.includes("/bff/account/current") && init?.method === "PATCH" && typeof init.body === "string") {
    const body = JSON.parse(init.body) as { business_context: string };
    account.business_context = body.business_context.trim();
    return new Response(JSON.stringify({ business_context: account.business_context }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
  const hit = routes.find(([pattern]) => pattern.test(url));
  if (!hit && !/^https?:\/\/(?!localhost)/.test(url) && !url.includes("/api/") && !url.includes("/bff/")) return realFetch(input, init);
  return new Response(JSON.stringify(hit?.[1] ?? EMPTY), { status: 200, headers: { "Content-Type": "application/json" } });
};

initClientCore({
  apiBaseUrl: "",
  bffBaseUrl: "",
  landingUrl: "http://localhost:3000",
  supabaseUrl: "http://localhost",
  supabaseAnonKey: "preview",
  platform: createWebPlatform(),
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <UiProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </UiProvider>
  </StrictMode>,
);
