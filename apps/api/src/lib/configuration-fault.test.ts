import { describe, expect, it } from "bun:test";
import { ProviderConfigurationError, ProviderError } from "@kairo/intelligence";
import { createConfigurationFaultTracker } from "./configuration-fault.js";

describe("createConfigurationFaultTracker", () => {
  it("rethrows a recorded configuration fault once the batch has settled", () => {
    const tracker = createConfigurationFaultTracker();
    const fault = new ProviderConfigurationError("Configured model is unavailable for the requested Gateway capability");
    tracker.record(fault);
    expect(() => tracker.throwIfRecorded()).toThrow(fault);
  });

  it("keeps the first fault when several messages fail the same way", () => {
    const tracker = createConfigurationFaultTracker();
    const first = new ProviderConfigurationError("first");
    tracker.record(first);
    tracker.record(new ProviderConfigurationError("second"));
    expect(() => tracker.throwIfRecorded()).toThrow("first");
  });

  it("ignores failures of a single message so the batch still completes", () => {
    const tracker = createConfigurationFaultTracker();
    tracker.record(new ProviderError("Gateway output did not match the requested schema", false));
    tracker.record(new Error("unexpected"));
    expect(() => tracker.throwIfRecorded()).not.toThrow();
  });
});
