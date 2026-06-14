import { describe, it, expect, afterEach } from "bun:test";
import { FLAGS, getFlag } from "../src/flags.js";

const ENV_KEY = "FEATURE_FLAG_ENABLE_DETECTION_UI";
const ENV_KEY_CONTACT = "FEATURE_FLAG_ENABLE_CONTACT_EXTRACTION";
const ENV_KEY_ACKNOWLEDGEMENT = "FEATURE_FLAG_ENABLE_TICKET_ACKNOWLEDGEMENT";

afterEach(() => {
  delete process.env[ENV_KEY];
  delete process.env[ENV_KEY_CONTACT];
  delete process.env[ENV_KEY_ACKNOWLEDGEMENT];
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

describe("getFlag('enable_contact_extraction')", () => {
  it("returns false by default when env var is unset", () => {
    delete process.env[ENV_KEY_CONTACT];
    expect(getFlag("enable_contact_extraction")).toBe(false);
  });

  it("returns true when env var is 'true'", () => {
    process.env[ENV_KEY_CONTACT] = "true";
    expect(getFlag("enable_contact_extraction")).toBe(true);
  });

  it("returns false when env var is 'false'", () => {
    process.env[ENV_KEY_CONTACT] = "false";
    expect(getFlag("enable_contact_extraction")).toBe(false);
  });
});

describe("getFlag('enable_ticket_acknowledgement')", () => {
  it("returns false by default when env var is unset", () => {
    delete process.env[ENV_KEY_ACKNOWLEDGEMENT];
    expect(getFlag("enable_ticket_acknowledgement")).toBe(false);
  });

  it("returns true when env var is 'true'", () => {
    process.env[ENV_KEY_ACKNOWLEDGEMENT] = "true";
    expect(getFlag("enable_ticket_acknowledgement")).toBe(true);
  });

  it("returns false when env var is 'false'", () => {
    process.env[ENV_KEY_ACKNOWLEDGEMENT] = "false";
    expect(getFlag("enable_ticket_acknowledgement")).toBe(false);
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
