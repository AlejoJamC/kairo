import { ProviderConfigurationError } from "@kairo/intelligence";

// A configuration fault (unknown model, missing key) fails every message of a
// batch identically. Swallowing it per message lets the step end as a success,
// so Inngest neither shows nor retries it. Each message still records its own
// failure; once the batch has settled, the step rethrows the fault so the run
// fails visibly and Inngest retries it — a retry after the configuration is
// fixed processes the batch normally.
export interface ConfigurationFaultTracker {
  record(err: unknown): void;
  throwIfRecorded(): void;
}

export function createConfigurationFaultTracker(): ConfigurationFaultTracker {
  let fault: ProviderConfigurationError | null = null;
  return {
    record(err) {
      if (fault === null && err instanceof ProviderConfigurationError) fault = err;
    },
    throwIfRecorded() {
      if (fault !== null) throw fault;
    },
  };
}
