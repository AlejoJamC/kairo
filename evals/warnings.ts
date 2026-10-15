type SdkWarningLogger = Exclude<typeof globalThis.AI_SDK_LOG_WARNINGS, false | undefined>;

/** Retain SDK diagnostics privately instead of letting process.emitWarning bypass the runner. */
export function captureSdkWarnings() {
  const previous = globalThis.AI_SDK_LOG_WARNINGS;
  const events: Parameters<SdkWarningLogger>[0][] = [];
  globalThis.AI_SDK_LOG_WARNINGS = options => { events.push(structuredClone(options)); };
  return { events, count: () => events.reduce((sum, event) => sum + event.warnings.length, 0),
    restore: () => { globalThis.AI_SDK_LOG_WARNINGS = previous; } };
}
