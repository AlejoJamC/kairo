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
