import "@testing-library/jest-dom/vitest";
import { initClientCore } from "@kairo/client-core/config";
import { createWebPlatform } from "@kairo/client-core/web";

initClientCore({
  apiBaseUrl: "",
  bffBaseUrl: "",
  landingUrl: "",
  supabaseUrl: "http://localhost:54321",
  supabaseAnonKey: "test-anon-key",
  platform: createWebPlatform(),
});

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;
