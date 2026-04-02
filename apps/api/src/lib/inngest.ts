import { EventSchemas, Inngest } from "inngest";

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
};

export const inngest = new Inngest({
  id: "kairo-api",
  schemas: new EventSchemas().fromRecord<KairoEvents>(),
});
