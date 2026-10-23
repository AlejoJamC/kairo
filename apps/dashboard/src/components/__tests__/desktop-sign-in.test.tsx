import * as React from "react";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render-with-providers";
import { DesktopSignIn } from "@/components/desktop-sign-in";

const signInWithPassword = vi.fn();
const startGoogleSignIn = vi.fn(async () => "https://kairo.example/bff/auth/google?desktop=1&port=4010");
const copyText = vi.fn(async () => {});
const openLanding = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key.replace("auth:desktop.", "") }),
}));
const setWindowSize = vi.fn();
vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} });
vi.mock("@kairo/client-core/config", () => ({ getPlatform: () => ({ host: { setWindowSize }, storage: { getItem: () => null } }) }));
vi.mock("@kairo/client-core/auth", () => ({ useAuth: () => ({ signInWithPassword }) }));
vi.mock("@kairo/client-core/endpoints", () => ({
  startGoogleSignIn: () => startGoogleSignIn(),
  copyText: (text: string) => copyText(text),
  openLanding: (path: string) => openLanding(path),
}));
vi.mock("@/components/language-switcher", () => ({ LanguageSwitcher: () => <span>language</span> }));

describe("DesktopSignIn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signInWithPassword.mockResolvedValue(null);
  });

  it("opens the system browser for Google and shows the waiting card instead of the form", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DesktopSignIn />);
    await user.click(screen.getByRole("button", { name: /google/ }));
    expect(startGoogleSignIn).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status").textContent).toContain("waitTitle");
    expect(screen.queryByRole("button", { name: "submit" })).toBeNull();
  });

  it("copies the sign-in link and goes back to the form on cancel", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DesktopSignIn />);
    await user.click(screen.getByRole("button", { name: /google/ }));
    await user.click(screen.getByRole("button", { name: "copyLink" }));
    expect(copyText).toHaveBeenCalledWith("https://kairo.example/bff/auth/google?desktop=1&port=4010");
    await waitFor(() => expect(screen.getByRole("button", { name: "linkCopied" })).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "cancel" }));
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByLabelText("emailLabel")).toBeTruthy();
  });

  it("gives the large window back when it goes away", () => {
    const { unmount } = renderWithProviders(<DesktopSignIn />);
    unmount();
    expect(setWindowSize).toHaveBeenLastCalledWith(1500, 860, 1468, 700);
  });

  it("keeps the sign-in button disabled until the email and the password are filled", () => {
    renderWithProviders(<DesktopSignIn />);
    const submit = screen.getByRole("button", { name: "submit" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("opens the landing pages in the browser for sign-up and password reset, never inside the app", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DesktopSignIn />);
    await user.click(screen.getByRole("button", { name: "forgot" }));
    expect(openLanding).toHaveBeenLastCalledWith("/set-password");
    await user.click(screen.getByRole("button", { name: "noteLink" }));
    expect(openLanding).toHaveBeenLastCalledWith("/");
  });
});
