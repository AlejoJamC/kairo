import { describe, it, expect, afterEach } from "bun:test";
import { FLAGS, getFlag } from "../src/flags.js";

const ENV_KEY = "FEATURE_FLAG_ENABLE_DETECTION_UI";

afterEach(() => {
  delete process.env[ENV_KEY];
});

describe("getFlag('enable_detection_ui')", () => {
  it("returns false by default when env var is unset", () => {
    delete process.env[ENV_KEY];
    expect(getFlag("enable_detection_ui")).toBe(false);
  });

  it("returns true when env var is 'true'", () => {
    process.env[ENV_KEY] = "true";
    expect(getFlag("enable_detection_ui")).toBe(true);
  });

  it("returns false when env var is 'false'", () => {
    process.env[ENV_KEY] = "false";
    expect(getFlag("enable_detection_ui")).toBe(false);
  });

  it("falls back to default (false) on invalid env value", () => {
    process.env[ENV_KEY] = "yes"; // not 'true' or 'false'
    expect(getFlag("enable_detection_ui")).toBe(false);
  });
});

describe("FLAGS (existing dashboard flags — regression)", () => {
  it("dashboard.rightPanel.clientTab is true", () => {
    expect(FLAGS.dashboard.rightPanel.clientTab).toBe(true);
  });

  it("dashboard.rightPanel.similarTab is true", () => {
    expect(FLAGS.dashboard.rightPanel.similarTab).toBe(true);
  });

  it("dashboard.rightPanel.articlesTab is true", () => {
    expect(FLAGS.dashboard.rightPanel.articlesTab).toBe(true);
  });

  it("dashboard.rightPanel.escalateTab is false", () => {
    expect(FLAGS.dashboard.rightPanel.escalateTab).toBe(false);
  });
});
