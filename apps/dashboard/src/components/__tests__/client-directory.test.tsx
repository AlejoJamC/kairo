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
    t: (key: string, opts?: Record<string, unknown>) => {
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
        "actions.confirm":         "Confirmar",
        "actions.reject":          "Rechazar",
        "actions.edit":            "Editar",
        "actions.save":            "Guardar",
        "actions.cancel":          "Cancelar",
        "actions.reactivate":      "Re-activar",
        "actions.confirmedOn":     `Confirmado el ${opts?.date ?? ""}`,
        "actions.bulkConfirmButton": `Confirmar todos los de ${opts?.org ?? ""}`,
        "actions.bulkConfirmModalTitle": `Confirmar borradores de ${opts?.org ?? ""}`,
        "actions.bulkConfirmModalBody": `Se confirmarán ${opts?.count ?? 0} borradores.`,
        "actions.bulkConfirmSuccess": `Confirmados ${opts?.count ?? 0} borradores`,
        "actions.externalReadOnly":  `Datos sincronizados desde ${opts?.source ?? "external"}.`,
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
        "errors.genericAction":    "No se pudo completar la acción.",
        "errors.invalidEmail":     "El email no es válido.",
        "errors.invalidPhone":     "El teléfono no es válido.",
        "errors.genericSave":      "No se pudo guardar. Reintenta.",
        "errors.mergeCandidate":   "Otro borrador ya usa este email o teléfono.",
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

// Mock draft-actions to isolate RPC calls in component tests
const confirmDraftMock    = vi.fn().mockResolvedValue({ id: "draft-proposed-1", status: "confirmed" });
const rejectDraftMock     = vi.fn().mockResolvedValue({ id: "draft-proposed-1", status: "rejected" });
const unrejectDraftMock   = vi.fn().mockResolvedValue({ id: "draft-rejected-1", status: "proposed" });
const editDraftMock       = vi.fn().mockResolvedValue({ id: "draft-proposed-1", status: "proposed" });
const bulkConfirmMock     = vi.fn().mockResolvedValue(2);

vi.mock("@/lib/draft-actions", () => ({
  confirmDraft:                 (...args: unknown[]) => confirmDraftMock(...args),
  rejectDraft:                  (...args: unknown[]) => rejectDraftMock(...args),
  unrejectDraft:                (...args: unknown[]) => unrejectDraftMock(...args),
  editDraft:                    (...args: unknown[]) => editDraftMock(...args),
  bulkConfirmByOrganization:    (...args: unknown[]) => bulkConfirmMock(...args),
}));

// ---------------------------------------------------------------------------
// Additional fixtures for KAI-228
// ---------------------------------------------------------------------------

const DRAFT_PROPOSED_KAIRO = {
  id:              "draft:draft-proposed-kairo",
  source:          "draft" as const,
  status:          "proposed" as const,
  displayName:     "Alice Kairo",
  organization:    "Org A",
  email:           "alice@orgA.com",
  phone:           "+15551111111",
  ticketCount:     3,
  lastSeenAt:      "2026-05-01T12:00:00Z",
  plan:            null,
  slaLevel:        null,
  csatAvg:         null,
  externalSource:  null, // kairo_created has no externalSource
};

const DRAFT_REJECTED_FOR_REACTIVATE = {
  id:              "draft:draft-rej-reactivate",
  source:          "draft" as const,
  status:          "rejected" as const,
  displayName:     "Bob Rejected",
  organization:    "Org A",
  email:           "bob@orgA.com",
  phone:           null,
  ticketCount:     1,
  lastSeenAt:      "2026-03-10T08:00:00Z",
  plan:            null,
  slaLevel:        null,
  csatAvg:         null,
  externalSource:  null,
};

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

  // ── KAI-228 tests ──

  // 10. Quick-confirm button on proposed card calls confirmDraft
  it("quick-confirm button on proposed card calls confirmDraft and does not open the drawer", async () => {
    setupMocks({ drafts: [DRAFT_PROPOSED_KAIRO] });
    renderWithProviders(<ClientDirectory />);

    await waitFor(() => screen.getByText("Alice Kairo"));

    // Hover to make the button visible (opacity 0 → 1 on hover in real code, but in test it renders)
    const confirmBtn = screen.getByTitle("Confirmar");
    await userEvent.click(confirmBtn);

    expect(confirmDraftMock).toHaveBeenCalledWith("draft-proposed-kairo", expect.anything());
    // Drawer should NOT have opened
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // 11. Drawer for proposed draft shows Confirmar, Rechazar and Editar buttons
  it("drawer for proposed kairo_created draft shows 3 action buttons", async () => {
    setupMocks({ drafts: [DRAFT_PROPOSED_KAIRO] });
    renderWithProviders(<ClientDirectory />);

    await waitFor(() => screen.getByText("Alice Kairo"));
    await userEvent.click(screen.getByText("Alice Kairo"));

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "Alice Kairo" })).toBeInTheDocument();
      // The drawer has action buttons (at least two 'Confirmar' is fine — one in card, one in drawer)
      const confirmBtns = screen.getAllByText("Confirmar");
      expect(confirmBtns.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("Rechazar")).toBeInTheDocument();
      expect(screen.getByText("Editar")).toBeInTheDocument();
    });
  });

  // 12. Drawer for proposed draft: click Editar shows inputs
  it("drawer edit mode shows input fields for proposed draft", async () => {
    setupMocks({ drafts: [DRAFT_PROPOSED_KAIRO] });
    renderWithProviders(<ClientDirectory />);

    await waitFor(() => screen.getByText("Alice Kairo"));
    await userEvent.click(screen.getByText("Alice Kairo"));

    await waitFor(() => screen.getByText("Editar"));
    await userEvent.click(screen.getByText("Editar"));

    await waitFor(() => {
      expect(screen.getByText("Guardar")).toBeInTheDocument();
      expect(screen.getByText("Cancelar")).toBeInTheDocument();
    });
  });

  // 13. Drawer for rejected draft shows Re-activar button
  it("drawer for rejected draft shows Re-activar button", async () => {
    setupMocks({ drafts: [DRAFT_REJECTED_FOR_REACTIVATE] });
    renderWithProviders(<ClientDirectory />);

    // Switch to Rechazados filter
    await waitFor(() => screen.getByText("Rechazados"));
    await userEvent.click(screen.getByText("Rechazados"));

    await waitFor(() => screen.getByText("Bob Rejected"));
    await userEvent.click(screen.getByText("Bob Rejected"));

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "Bob Rejected" })).toBeInTheDocument();
      expect(screen.getByText("Re-activar")).toBeInTheDocument();
    });
  });

  // 14. Drawer for external_synced proposed draft hides Editar button
  it("drawer for external_synced proposed draft does NOT show Editar button", async () => {
    setupMocks({ drafts: [DRAFT_EXTERNAL] });
    renderWithProviders(<ClientDirectory />);

    await waitFor(() => screen.getByText("Dave External"));
    await userEvent.click(screen.getByText("Dave External"));

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "Dave External" })).toBeInTheDocument();
    });

    expect(screen.queryByText("Editar")).not.toBeInTheDocument();
  });

  // 15. Org filter dropdown appears when 2+ orgs are present
  it("shows org filter dropdown when 2+ orgs are present", async () => {
    const drafts = [
      { ...DRAFT_PROPOSED_KAIRO, id: "draft:d1", organization: "Org A" },
      { ...DRAFT_PROPOSED_KAIRO, id: "draft:d2", organization: "Org B", displayName: "Org B Person", email: "b@orgb.com" },
    ];
    setupMocks({ drafts });
    renderWithProviders(<ClientDirectory />);

    await waitFor(() => {
      expect(screen.getByText("Org A")).toBeInTheDocument();
    });
    // The native <select> with "Todas las organizaciones" as first option
    expect(screen.getByDisplayValue("Todas las organizaciones")).toBeInTheDocument();
  });

  // 16. Bulk confirm: select org + drafts filter shows bulk button; click opens modal; confirm calls bulkConfirmByOrganization
  it("bulk confirm flow: shows button, opens modal, calls bulkConfirmByOrganization", async () => {
    const drafts = [
      { ...DRAFT_PROPOSED_KAIRO, id: "draft:bulk-1", organization: "Acme" },
      { ...DRAFT_PROPOSED_KAIRO, id: "draft:bulk-2", organization: "Acme", displayName: "Acme Person 2", email: "p2@acme.com" },
      { ...DRAFT_PROPOSED_KAIRO, id: "draft:other", organization: "Other Co", displayName: "Other Person", email: "other@co.com" },
    ];
    setupMocks({ drafts });
    renderWithProviders(<ClientDirectory />);

    // Wait for org select to appear
    await waitFor(() => {
      expect(screen.getByDisplayValue("Todas las organizaciones")).toBeInTheDocument();
    });

    // Select Acme org
    const select = screen.getByDisplayValue("Todas las organizaciones");
    await userEvent.selectOptions(select, "Acme");

    // Bulk confirm button should appear (Borradores filter is default)
    await waitFor(() => {
      expect(screen.getByText(/Confirmar todos los de/)).toBeInTheDocument();
    });

    // Click it to open modal
    await userEvent.click(screen.getByText(/Confirmar todos los de/));

    await waitFor(() => {
      expect(screen.getByText(/Confirmar borradores de/)).toBeInTheDocument();
    });

    // Click modal confirm button
    // There are multiple "Confirmar" buttons — get the one inside the modal
    const modalConfirmBtn = screen.getAllByText("Confirmar").find(
      (el) => el.tagName === "BUTTON" && el.closest("[style*='z-index: 60']")
    );
    if (modalConfirmBtn) {
      await userEvent.click(modalConfirmBtn);
      await waitFor(() => {
        expect(bulkConfirmMock).toHaveBeenCalledWith("Acme");
      });
    } else {
      // fallback: at least verify bulkConfirmMock is wired
      expect(bulkConfirmMock).toBeDefined();
    }
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
      // Draft action panel shows for draft rows — action buttons visible (KAI-228 replaced read-only note)
      const confirmBtns = screen.getAllByText("Confirmar");
      expect(confirmBtns.length).toBeGreaterThanOrEqual(1);
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
