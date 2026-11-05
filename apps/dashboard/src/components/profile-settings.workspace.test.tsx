import * as React from "react";
import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render-with-providers";

const getCurrentAccount = vi.fn();
const session = {
  profile: { id: "u1", company_name: "Acme" },
  accountId: "acc-1",
  userRole: "owner",
  refreshProfile: vi.fn(),
  user: { id: "u1" },
  accountRevision: 0,
};

vi.mock("@kairo/client-core/auth", () => ({ useAuth: () => session }));
vi.mock("@kairo/client-core/queries", () => ({ updateProfileName: vi.fn() }));
vi.mock("@kairo/client-core/hooks/use-account-members", () => ({ useAccountMembers: () => ({ members: [], loading: false }) }));
vi.mock("@kairo/client-core/endpoints", () => ({
  getCurrentAccount: () => getCurrentAccount(),
  updateAccountBusinessContext: vi.fn(),
  getOperationalSlaConfig: vi.fn(),
  saveOperationalSlaConfig: vi.fn(),
  listChannels: vi.fn(),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

import { ProfileSettings } from "./profile-settings";

const account = (industry: string | null) => ({ ok: true, json: async () => ({ id: "acc-1", industry, business_context: null }) });

beforeEach(() => {
  getCurrentAccount.mockReset();
  session.accountRevision = 0;
});

describe("ProfileSettings workspace", () => {
  it("reads the account again when the session rewrote it, without leaving the view", async () => {
    getCurrentAccount.mockResolvedValueOnce(account(null)).mockResolvedValue(account("other"));
    const { rerender } = renderWithProviders(<ProfileSettings onViewChange={() => {}} />);
    await waitFor(() => expect(getCurrentAccount).toHaveBeenCalledTimes(1));
    const select = (await screen.findByLabelText("dashboard:settings.workspace.industryLabel")) as HTMLSelectElement;
    expect(select.value).toBe("");

    session.accountRevision = 1;
    rerender(<ProfileSettings onViewChange={() => {}} />);

    await waitFor(() => expect(getCurrentAccount).toHaveBeenCalledTimes(2));
    await waitFor(() => expect((screen.getByLabelText("dashboard:settings.workspace.industryLabel") as HTMLSelectElement).value).toBe("other"));
  });
});
