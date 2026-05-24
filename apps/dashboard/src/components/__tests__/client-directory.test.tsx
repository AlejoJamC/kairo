import * as React from "react";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render-with-providers";
import { ClientDirectory } from "@/components/client-directory";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "filters.statusAll":       "Todos",
        "filters.statusDrafts":    "Borradores",
        "filters.statusConfirmed": "Confirmados",
        "filters.statusRejected":  "Rechazados",
        "badges.draft":            "Borrador",
        "badges.confirmed":        "Confirmado",
        "badges.rejected":         "Rechazado",
        "empty.noDrafts":          "Aún no hay clientes detectados.",
        "empty.noConfirmed":       "Sin confirmados",
        "empty.noRejected":        "Sin rechazados",
        "empty.noClients":         "No se encontraron clientes",
        "empty.noResults":         "Ningún cliente coincide con tu búsqueda",
        "search.placeholder":      "Buscar...",
        "loading":                 "Cargando...",
        "errorMessage":            "Error al cargar los borradores.",
        "retry":                   "Reintentar",
        "actions.confirmDelete":   "¿Eliminar?",
        "detail.plan":             "Plan",
        "detail.tickets":          "Tickets",
        "detail.csat":             "CSAT",
        "detail.lastSeen":         "Último contacto",
        "detail.email":            "Correo",
        "detail.phone":            "Teléfono",
        "detail.organization":     "Organización",
        "detail.legalId":          "ID Legal",
        "detail.authorizedEmails": "Correos Autorizados",
        "detail.contactPersons":   "Personas de Contacto",
        "detail.draftReadOnlyNote": "Este es un borrador detectado automáticamente.",
      };
      return translations[key] ?? key;
    },
    i18n: { language: "es" },
  }),
}));

// Mock auth context
vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
    accountId: "acct-1",
    profile: null,
    userRole: "agent",
    isAdmin: false,
    loading: false,
    signOut: vi.fn(),
    refreshProfile: vi.fn(),
  }),
}));

// Mock apiCall for clients
const apiCallMock = vi.fn();
vi.mock("@/lib/api-client", () => ({
  apiCall: (...args: unknown[]) => apiCallMock(...args),
}));

// Mock useDraftContacts hook
const retryDraftsMock = vi.fn();
const useDraftContactsMock = vi.fn();
vi.mock("@/hooks/use-draft-contacts", () => ({
  useDraftContacts: (...args: unknown[]) => useDraftContactsMock(...args),
}));

// Mock ClientFormModal so it doesn't break renders
vi.mock("@/components/client-form-modal", () => ({
  ClientFormModal: () => null,
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DRAFT_PROPOSED = {
  id:              "draft:draft-proposed-1",
  source:          "draft" as const,
  status:          "proposed" as const,
  displayName:     "Alice Proposed",
  organization:    "Org A",
  email:           "alice@orgA.com",
  phone:           "+15551111111",
  ticketCount:     3,
  lastSeenAt:      "2026-05-01T12:00:00Z",
  plan:            null,
  slaLevel:        null,
  csatAvg:         null,
  externalSource:  null,
};

const DRAFT_CONFIRMED = {
  id:              "draft:draft-confirmed-1",
  source:          "draft" as const,
  status:          "confirmed" as const,
  displayName:     "Bob Confirmed",
  organization:    null,
  email:           "bob@example.com",
  phone:           null,
  ticketCount:     2,
  lastSeenAt:      "2026-04-20T08:00:00Z",
  plan:            null,
  slaLevel:        null,
  csatAvg:         null,
  externalSource:  null,
};

const DRAFT_REJECTED = {
  id:              "draft:draft-rejected-1",
  source:          "draft" as const,
  status:          "rejected" as const,
  displayName:     "Carol Rejected",
  organization:    null,
  email:           "carol@example.com",
  phone:           null,
  ticketCount:     1,
  lastSeenAt:      "2026-03-10T08:00:00Z",
  plan:            null,
  slaLevel:        null,
  csatAvg:         null,
  externalSource:  null,
};

const DRAFT_EXTERNAL = {
  id:              "draft:draft-external-1",
  source:          "draft" as const,
  status:          "proposed" as const,
  displayName:     "Dave External",
  organization:    "Hubspot Org",
  email:           "dave@hubspot.com",
  phone:           null,
  ticketCount:     4,
  lastSeenAt:      "2026-05-10T08:00:00Z",
  plan:            null,
  slaLevel:        null,
  csatAvg:         null,
  externalSource:  "Hubspot",
};

// Mock API clients response
const MOCK_API_CLIENTS_RESPONSE = {
  clients: [{
    id:               "client-1",
    internal_id:      "CLI-001",
    legal_id:         null,
    name:             "Enterprise Corp",
    telephone:        "+15559999999",
    authorized_emails: ["billing@enterprise.com"],
    contact_persons:  [],
    plan_type:        "Enterprise",
    sla_level:        "Critical",
    ticketCount:      10,
    csatAvg:          4.9,
    lastContactAt:    "2026-05-15T00:00:00Z",
  }],
};

function setupMocks({
  drafts = [DRAFT_PROPOSED, DRAFT_CONFIRMED, DRAFT_REJECTED],
  error = null,
  loading = false,
}: {
  drafts?: typeof DRAFT_PROPOSED[];
  error?: string | null;
  loading?: boolean;
} = {}) {
  useDraftContactsMock.mockReturnValue({ drafts, error, loading, retry: retryDraftsMock });
  apiCallMock.mockResolvedValue({
    ok: true,
    json: async () => MOCK_API_CLIENTS_RESPONSE,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ClientDirectory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 1. All rows visible with filter "Todos"
  it("renders all rows (drafts + clients) when filter is Todos", async () => {
    setupMocks({ drafts: [DRAFT_PROPOSED, DRAFT_CONFIRMED, DRAFT_REJECTED] });

    renderWithProviders(<ClientDirectory />);

    // Click "Todos" filter
    await waitFor(() => screen.getByText("Todos"));
    await userEvent.click(screen.getByText("Todos"));

    await waitFor(() => {
      expect(screen.getByText("Alice Proposed")).toBeInTheDocument();
      expect(screen.getByText("Bob Confirmed")).toBeInTheDocument();
      expect(screen.getByText("Carol Rejected")).toBeInTheDocument();
      expect(screen.getByText("Enterprise Corp")).toBeInTheDocument();
    });
  });

  // 2. Filter "Borradores" shows only proposed drafts
  it("shows only proposed drafts when filter is Borradores", async () => {
    setupMocks({ drafts: [DRAFT_PROPOSED, DRAFT_CONFIRMED, DRAFT_REJECTED] });

    renderWithProviders(<ClientDirectory />);

    // "Borradores" is the default filter — just wait
    await waitFor(() => {
      expect(screen.getByText("Alice Proposed")).toBeInTheDocument();
    });

    expect(screen.queryByText("Bob Confirmed")).not.toBeInTheDocument();
    expect(screen.queryByText("Carol Rejected")).not.toBeInTheDocument();
    expect(screen.queryByText("Enterprise Corp")).not.toBeInTheDocument();
  });

  // 3. Filter "Confirmados" shows confirmed drafts + clients
  it("shows confirmed drafts and clients when filter is Confirmados", async () => {
    setupMocks({ drafts: [DRAFT_PROPOSED, DRAFT_CONFIRMED, DRAFT_REJECTED] });

    renderWithProviders(<ClientDirectory />);

    await waitFor(() => screen.getByText("Confirmados"));
    await userEvent.click(screen.getByText("Confirmados"));

    await waitFor(() => {
      expect(screen.getByText("Bob Confirmed")).toBeInTheDocument();
      expect(screen.getByText("Enterprise Corp")).toBeInTheDocument();
    });

    expect(screen.queryByText("Alice Proposed")).not.toBeInTheDocument();
    expect(screen.queryByText("Carol Rejected")).not.toBeInTheDocument();
  });

  // 4. Filter "Rechazados" shows only rejected drafts
  it("shows only rejected drafts when filter is Rechazados", async () => {
    setupMocks({ drafts: [DRAFT_PROPOSED, DRAFT_CONFIRMED, DRAFT_REJECTED] });

    renderWithProviders(<ClientDirectory />);

    await waitFor(() => screen.getByText("Rechazados"));
    await userEvent.click(screen.getByText("Rechazados"));

    await waitFor(() => {
      expect(screen.getByText("Carol Rejected")).toBeInTheDocument();
    });

    expect(screen.queryByText("Alice Proposed")).not.toBeInTheDocument();
    expect(screen.queryByText("Bob Confirmed")).not.toBeInTheDocument();
    expect(screen.queryByText("Enterprise Corp")).not.toBeInTheDocument();
  });

  // 5. Search by email filters to 1 row
  it("filters to a single row when searching by email", async () => {
    setupMocks({ drafts: [DRAFT_PROPOSED, DRAFT_CONFIRMED, DRAFT_REJECTED] });

    renderWithProviders(<ClientDirectory />);

    // Switch to Todos so all are visible
    await waitFor(() => screen.getByText("Todos"));
    await userEvent.click(screen.getByText("Todos"));

    await waitFor(() => {
      expect(screen.getByText("Alice Proposed")).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText("Buscar...");
    await userEvent.type(searchInput, "alice@orgA.com");

    await waitFor(() => {
      expect(screen.getByText("Alice Proposed")).toBeInTheDocument();
      expect(screen.queryByText("Bob Confirmed")).not.toBeInTheDocument();
      expect(screen.queryByText("Carol Rejected")).not.toBeInTheDocument();
      expect(screen.queryByText("Enterprise Corp")).not.toBeInTheDocument();
    });
  });

  // 6. Correct badge per status
  it("shows correct status badge for each row", async () => {
    setupMocks({ drafts: [DRAFT_PROPOSED, DRAFT_CONFIRMED, DRAFT_REJECTED] });

    renderWithProviders(<ClientDirectory />);

    // Switch to Todos
    await waitFor(() => screen.getByText("Todos"));
    await userEvent.click(screen.getByText("Todos"));

    await waitFor(() => {
      expect(screen.getByText("Borrador")).toBeInTheDocument();
      // Multiple "Confirmado" badges: draft-confirmed + client
      const confirmeds = screen.getAllByText("Confirmado");
      expect(confirmeds.length).toBeGreaterThanOrEqual(2);
      expect(screen.getByText("Rechazado")).toBeInTheDocument();
    });
  });

  // 7. externalSource badge appears for drafts with origin=external_synced
  it("shows externalSource badge for drafts with external_source", async () => {
    setupMocks({ drafts: [DRAFT_EXTERNAL] });

    renderWithProviders(<ClientDirectory />);

    // Default filter is "Borradores" which shows proposed drafts
    await waitFor(() => {
      expect(screen.getByText("Dave External")).toBeInTheDocument();
      expect(screen.getByText("Hubspot")).toBeInTheDocument();
    });
  });

  // 8. Error state appears after MAX_CONSECUTIVE_FAILS
  it("shows error banner when drafts hook returns an error", async () => {
    useDraftContactsMock.mockReturnValue({
      drafts: [],
      error: "fetch_error",
      loading: false,
      retry: retryDraftsMock,
    });
    apiCallMock.mockResolvedValue({
      ok: true,
      json: async () => MOCK_API_CLIENTS_RESPONSE,
    });

    renderWithProviders(<ClientDirectory />);

    await waitFor(() => {
      expect(screen.getByText("Error al cargar los borradores.")).toBeInTheDocument();
      expect(screen.getByText("Reintentar")).toBeInTheDocument();
    });
  });

  // 8b. Retry button calls the retry function
  it("calls retry when the Reintentar button is clicked", async () => {
    useDraftContactsMock.mockReturnValue({
      drafts: [],
      error: "fetch_error",
      loading: false,
      retry: retryDraftsMock,
    });
    apiCallMock.mockResolvedValue({
      ok: true,
      json: async () => MOCK_API_CLIENTS_RESPONSE,
    });

    renderWithProviders(<ClientDirectory />);

    await waitFor(() => screen.getByText("Reintentar"));
    await userEvent.click(screen.getByText("Reintentar"));

    expect(retryDraftsMock).toHaveBeenCalledTimes(1);
  });

  // 9. Detail drawer opens on row click (read-only, both sources)
  it("opens the detail drawer when a row is clicked, for both drafts and clients", async () => {
    setupMocks({ drafts: [DRAFT_PROPOSED] });

    renderWithProviders(<ClientDirectory />);

    // Open drawer for a draft row
    await waitFor(() => screen.getByText("Alice Proposed"));
    await userEvent.click(screen.getByText("Alice Proposed"));

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "Alice Proposed" })).toBeInTheDocument();
      // Draft-specific note appears for draft rows
      expect(screen.getByText(/borrador detectado autom/i)).toBeInTheDocument();
    });

    // Close drawer
    await userEvent.click(screen.getByLabelText("Close"));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    // Open drawer for a client row (switch to Confirmados)
    await userEvent.click(screen.getByText("Confirmados"));
    await waitFor(() => screen.getByText("Enterprise Corp"));
    await userEvent.click(screen.getByText("Enterprise Corp"));

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "Enterprise Corp" })).toBeInTheDocument();
      // CRM internal id shows for client rows
      expect(screen.getByText("CLI-001")).toBeInTheDocument();
      // Draft note does NOT show for client rows
      expect(screen.queryByText(/borrador detectado autom/i)).not.toBeInTheDocument();
    });
  });
});
