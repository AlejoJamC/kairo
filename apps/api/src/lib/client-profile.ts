export function planScoreFromTier(tier: string | null | undefined): number {
  const t = (tier ?? "").toLowerCase();
  if (t === "enterprise") return 1.0;
  if (t === "pro")        return 0.67;
  if (t === "starter")    return 0.33;
  return 0.0;
}

export function computeClientFlags(ticketsLast30: number, ticketsLast90: number) {
  return {
    isRecurrent: ticketsLast30 > 3,
    isNewClient: ticketsLast90 === 0,
  };
}
