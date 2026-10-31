import { getFlag, localSupabaseConfig } from "@kairo/feature-flags";
import { CompleteProfileClient } from "./_components/complete-profile-client";

export default function CompletePage() {
  const showDetectionStep = getFlag("enable_detection_ui");
  return <CompleteProfileClient showDetectionStep={showDetectionStep} localReplay={Boolean(localSupabaseConfig(process.env))} />;
}
