import { appendFileSync } from "fs";
import { join } from "path";

const LOG_PATH = join(process.cwd(), "pipeline-debug.log");

const fmt = () => new Date().toISOString();

export function pipelineLogRun(label: string): void {
  const line = `\n${"=".repeat(80)}\n${label} — ${fmt()}\n${"=".repeat(80)}\n`;
  try {
    appendFileSync(LOG_PATH, line);
  } catch {
    // non-fatal — debug log write failure should not crash the pipeline
  }
}

export function pipelineLog(tag: string, message: string): void {
  const line = `[${fmt()}][${tag}] ${message}\n`;
  try {
    appendFileSync(LOG_PATH, line);
  } catch {
    // non-fatal
  }
}
