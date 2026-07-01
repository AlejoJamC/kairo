import { describe, it, expect, afterEach } from "bun:test";
import { getFlag, getNumericFlag } from "../src/flags.js";

const ENV_KEY = "FEATURE_FLAG_ENABLE_DETECTION_UI";
const ENV_KEY_CONTACT = "FEATURE_FLAG_ENABLE_CONTACT_EXTRACTION";
const ENV_KEY_ACKNOWLEDGEMENT = "FEATURE_FLAG_ENABLE_TICKET_ACKNOWLEDGEMENT";
const ENV_KEY_SLA_ESCALATION = "FEATURE_FLAG_ENABLE_OPERATIONAL_SLA_ESCALATION";

afterEach(() => {
  delete process.env[ENV_KEY];
  delete process.env[ENV_KEY_CONTACT];
  delete process.env[ENV_KEY_ACKNOWLEDGEMENT];
  delete process.env[ENV_KEY_SLA_ESCALATION];
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

describe("getFlag('enable_operational_sla_escalation')", () => {
  it("returns false by default when env var is unset", () => {
    delete process.env[ENV_KEY_SLA_ESCALATION];
    expect(getFlag("enable_operational_sla_escalation")).toBe(false);
  });

  it("returns true when env var is 'true'", () => {
    process.env[ENV_KEY_SLA_ESCALATION] = "true";
    expect(getFlag("enable_operational_sla_escalation")).toBe(true);
  });

  it("returns false when env var is 'false'", () => {
    process.env[ENV_KEY_SLA_ESCALATION] = "false";
    expect(getFlag("enable_operational_sla_escalation")).toBe(false);
  });
});

describe("getNumericFlag('operational_sla_escalation_check_interval_minutes')", () => {
  const ENV_KEY_INTERVAL = "FEATURE_FLAG_OPERATIONAL_SLA_ESCALATION_CHECK_INTERVAL_MINUTES";

  afterEach(() => {
    delete process.env[ENV_KEY_INTERVAL];
  });

  it("returns the default (5) when env var is unset", () => {
    delete process.env[ENV_KEY_INTERVAL];
    expect(getNumericFlag("operational_sla_escalation_check_interval_minutes")).toBe(5);
  });

  it("returns the override when env var is a positive integer", () => {
    process.env[ENV_KEY_INTERVAL] = "10";
    expect(getNumericFlag("operational_sla_escalation_check_interval_minutes")).toBe(10);
  });

  it("falls back to the default on an invalid value", () => {
    process.env[ENV_KEY_INTERVAL] = "not-a-number";
    expect(getNumericFlag("operational_sla_escalation_check_interval_minutes")).toBe(5);
  });
});

describe("getNumericFlag('gmail_poll_cron_interval_minutes')", () => {
  const ENV_KEY_INTERVAL = "FEATURE_FLAG_GMAIL_POLL_CRON_INTERVAL_MINUTES";

  afterEach(() => {
    delete process.env[ENV_KEY_INTERVAL];
  });

  it("returns the default (5) when env var is unset", () => {
    delete process.env[ENV_KEY_INTERVAL];
    expect(getNumericFlag("gmail_poll_cron_interval_minutes")).toBe(5);
  });

  it("returns the override when env var is a positive integer", () => {
    process.env[ENV_KEY_INTERVAL] = "2";
    expect(getNumericFlag("gmail_poll_cron_interval_minutes")).toBe(2);
  });

  it("falls back to the default on a non-integer value", () => {
    process.env[ENV_KEY_INTERVAL] = "2.5";
    expect(getNumericFlag("gmail_poll_cron_interval_minutes")).toBe(5);
  });

  it("falls back to the default on a zero or negative value", () => {
    process.env[ENV_KEY_INTERVAL] = "0";
    expect(getNumericFlag("gmail_poll_cron_interval_minutes")).toBe(5);
    process.env[ENV_KEY_INTERVAL] = "-3";
    expect(getNumericFlag("gmail_poll_cron_interval_minutes")).toBe(5);
  });

  it("falls back to the default on a non-numeric value", () => {
    process.env[ENV_KEY_INTERVAL] = "soon";
    expect(getNumericFlag("gmail_poll_cron_interval_minutes")).toBe(5);
  });

  it("falls back to the default on an empty string", () => {
    process.env[ENV_KEY_INTERVAL] = "";
    expect(getNumericFlag("gmail_poll_cron_interval_minutes")).toBe(5);
  });
});
