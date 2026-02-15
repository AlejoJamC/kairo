import type { TelemetryData } from "@/types";
import { Info } from "lucide-react";

interface TelemetryOverviewProps {
  data: TelemetryData;
}

export function TelemetryOverview({ data }: TelemetryOverviewProps) {
  return (
    <div className="rounded-lg border bg-white">
      <div className="flex items-center gap-2 border-b px-4 py-2.5">
        <h3 className="text-sm font-medium text-zinc-900">
          Telemetry Overview
        </h3>
      </div>
      <div className="flex items-center gap-6 px-4 py-3">
        <Info className="h-4 w-4 shrink-0 text-blue-500" />
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
          <span className="text-zinc-600">
            Recent Runs:{" "}
            <span className="font-medium text-orange-600">
              {data.failures} Failures
            </span>
          </span>
          <span className="text-zinc-600">
            Last Error:{" "}
            <span className="font-semibold text-zinc-900">
              {data.lastError}
            </span>
          </span>
          <span className="text-zinc-600">
            Last Run:{" "}
            <span className="font-medium text-zinc-900">
              {data.lastRunStatus} {data.lastRunTime}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
