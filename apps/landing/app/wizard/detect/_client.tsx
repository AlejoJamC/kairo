"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getDashboardUrl } from "@/lib/api-config";
import { DetectionStep } from "../complete/_components/detection-step";

async function goToDashboard() {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const dashboardUrl = getDashboardUrl();
  if (session?.access_token && session?.refresh_token) {
    const hash = `#access_token=${encodeURIComponent(session.access_token)}&refresh_token=${encodeURIComponent(session.refresh_token)}`;
    window.location.href = `${dashboardUrl}${hash}`;
  } else {
    window.location.href = dashboardUrl;
  }
}

export function DetectPageClient() {
  const [mailbox, setMailbox] = useState<string | undefined>();

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => setMailbox(data.user?.email ?? undefined));
  }, []);

  return <DetectionStep onContinue={goToDashboard} mailbox={mailbox} />;
}
