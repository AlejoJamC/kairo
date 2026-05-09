import { Inngest } from "inngest";

export type KairoEvents = {
  "pipeline/tier1.triggered": {
    data: {
      userId: string;
      gmailAccessToken: string;
    };
  };
  "pipeline/tier2.triggered": {
    data: {
      userId: string;
      processedMessageIds: string[];
    };
  };
  "pipeline/tier3.triggered": {
    data: {
      userId: string;
    };
  };
  "tickets/batch-classify.triggered": {
    data: {
      userId: string;
      ticketIds: string[];
      forceReclassify: boolean;
      jobId: string;
    };
  };
  "pipeline/incremental-sync.triggered": {
    data: {
      userId: string;
      gmailAccessToken: string;
    };
  };
};

// In inngest v4, EventSchemas was removed. Event types are enforced via
// KairoEvents below and used at createFunction call sites via generics.
export const inngest = new Inngest({ id: "kairo-api" });
