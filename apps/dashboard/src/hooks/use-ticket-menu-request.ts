// Runs `open` when a command asks for this menu of the open ticket (the command
// palette and the native menu go through the triage store).

import { useEffect, useRef } from "react";
import { useTriageStore, type TicketMenu } from "@kairo/client-core/stores/triage-store";

export function useTicketMenuRequest(menu: TicketMenu, open: () => void) {
  const latest = useRef(open);
  useEffect(() => {
    latest.current = open;
  });
  useEffect(
    () =>
      useTriageStore.subscribe((state, previous) => {
        const request = state.ticketMenuRequest;
        if (!request || request === previous.ticketMenuRequest || request.menu !== menu) return;
        state.clearTicketMenuRequest();
        latest.current();
      }),
    [menu],
  );
}

/** Runs `apply` when the native menu asks to set the priority or the status of the open ticket. */
export function useTicketChangeRequest(kind: "priority" | "status", apply: (value: string) => void) {
  const latest = useRef(apply);
  useEffect(() => {
    latest.current = apply;
  });
  useEffect(
    () =>
      useTriageStore.subscribe((state, previous) => {
        const request = state.ticketChangeRequest;
        if (!request || request === previous.ticketChangeRequest || request.kind !== kind) return;
        state.clearTicketChangeRequest();
        latest.current(request.value);
      }),
    [kind],
  );
}
