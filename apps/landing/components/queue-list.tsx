"use client";

import type { ReactNode } from "react";
import { Box } from "@kairo/ui";

/** The list that holds compact ticket rows: named by its own label, rows 2px apart. */
export function QueueList({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box tag="ul" aria-label={label} margin={0} padding={0} listStyle="none" display="flex" flexDirection="column" gap={2}>
      {children}
    </Box>
  );
}
