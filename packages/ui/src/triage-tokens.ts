/**
 * Kairo Triage Design Tokens
 *
 * Single source of truth for all triage color systems.
 * Import from @kairo/ui — never hardcode these in app components.
 *
 * TWO DISTINCT SYSTEMS (must not conflict visually):
 *
 * 1. PRIORITY — business severity (P1–P4), drives header bg + card border shade
 * 2. EMOTION  — customer tone semaphore (aggressive→frustrated→neutral→positive)
 * 3. TICKET TYPE — classification badge (support / prospect / internal / spam / other)
 *
 * WCAG AA: all text/bg combinations maintain ≥ 4.5:1 contrast ratio.
 * Dark mode variants are defined as a v0.2 placeholder (see KAI v0.2).
 */

// ---------------------------------------------------------------------------
// Priority tokens — P1 (critical) → P4 (low)
// Used by: center panel header bg, ticket card border accent, priority badge
// ---------------------------------------------------------------------------

export type PriorityLevel = "P1" | "P2" | "P3" | "P4";

export interface PriorityTokens {
  /** Left border on ticket card */
  cardBorder: string;
  /** Header background in center panel */
  headerBg: string;
  /** Text color on header background (WCAG AA) */
  headerText: string;
  /** Small badge background */
  badgeBg: string;
  /** Small badge text */
  badgeText: string;
  /** Small badge ring */
  badgeBorder: string;
  /** Human label */
  label: string;
}

/**
 * Priority semaphore: P1 (red/critical) → P2 (orange/high) → P3 (blue/normal) → P4 (gray/low)
 * NEVER reorder — severity decreases top to bottom.
 */
export const PRIORITY_TOKENS: Record<PriorityLevel, PriorityTokens> = {
  P1: {
    cardBorder:  "border-l-red-500",
    headerBg:    "bg-red-50",
    headerText:  "text-red-900",
    badgeBg:     "bg-red-50",
    badgeText:   "text-red-700",
    badgeBorder: "border-red-200",
    label:       "Critical",
  },
  P2: {
    cardBorder:  "border-l-orange-400",
    headerBg:    "bg-orange-50",
    headerText:  "text-orange-900",
    badgeBg:     "bg-amber-50",
    badgeText:   "text-amber-700",
    badgeBorder: "border-amber-200",
    label:       "High",
  },
  P3: {
    cardBorder:  "border-l-blue-400",
    headerBg:    "bg-blue-50",
    headerText:  "text-blue-900",
    badgeBg:     "bg-blue-50",
    badgeText:   "text-blue-700",
    badgeBorder: "border-blue-200",
    label:       "Normal",
  },
  P4: {
    cardBorder:  "border-l-zinc-300",
    headerBg:    "bg-zinc-50",
    headerText:  "text-zinc-700",
    badgeBg:     "bg-gray-100",
    badgeText:   "text-gray-600",
    badgeBorder: "border-gray-300",
    label:       "Low",
  },
};

export function getPriorityTokens(priority: string | null | undefined): PriorityTokens | null {
  if (!priority) return null;
  return PRIORITY_TOKENS[priority as PriorityLevel] ?? null;
}

// ---------------------------------------------------------------------------
// Emotion tokens — semaphore order (most → least critical)
// Used by: ticket card left border, emoji indicator
//
// 🤬 aggressive → RED    (on fire — highest severity)
// 😩 frustrated → ORANGE (visibly distressed)
// 😐 neutral    → BLUE   (standard — no urgency signal)
// 😊 positive   → GREEN  (happy customer — lowest severity)
//
// null / unknown → FALLBACK (zinc border, no emoji) — MUST NOT throw or break
// ---------------------------------------------------------------------------

export type EmotionTone = "aggressive" | "frustrated" | "neutral" | "positive";

export interface EmotionTokens {
  /** Left border on ticket card */
  cardBorder: string;
  /** Subtle card background tint */
  cardBg: string;
  /** Header background in center panel */
  headerBg: string;
  /** Text color on header background (WCAG AA) */
  headerText: string;
  /** Emoji indicator */
  emoji: string;
  /** Aria label for emoji */
  ariaLabel: string;
}

/**
 * Emotion semaphore: aggressive(🤬red) → frustrated(😩orange) → neutral(😐blue) → positive(😊green)
 * NEVER reorder — severity decreases top to bottom.
 */
export const EMOTION_TOKENS: Record<EmotionTone, EmotionTokens> = {
  aggressive: { cardBorder: "border-l-red-500",    cardBg: "bg-red-50",      headerBg: "bg-red-50",    headerText: "text-red-900",    emoji: "🤬", ariaLabel: "Aggressive" },
  frustrated:  { cardBorder: "border-l-orange-500", cardBg: "bg-orange-50",   headerBg: "bg-amber-50",  headerText: "text-amber-900",  emoji: "😩", ariaLabel: "Frustrated" },
  neutral:     { cardBorder: "border-l-blue-400",   cardBg: "bg-transparent", headerBg: "bg-zinc-50",   headerText: "text-zinc-900",   emoji: "😐", ariaLabel: "Neutral" },
  positive:    { cardBorder: "border-l-green-500",  cardBg: "bg-transparent", headerBg: "bg-green-50",  headerText: "text-green-900",  emoji: "😊", ariaLabel: "Positive" },
};

export const EMOTION_FALLBACK: EmotionTokens = {
  cardBorder: "border-l-zinc-200",
  cardBg:     "bg-transparent",
  headerBg:   "bg-white",
  headerText: "text-zinc-900",
  emoji:      "",
  ariaLabel:  "",
};

export function getEmotionTokens(emotion: string | null | undefined): EmotionTokens {
  if (!emotion) return EMOTION_FALLBACK;
  return EMOTION_TOKENS[emotion.toLowerCase() as EmotionTone] ?? EMOTION_FALLBACK;
}

// ---------------------------------------------------------------------------
// Ticket type tokens — classification badge
// Used by: ticket list filter chips, ticket card type badge
// ---------------------------------------------------------------------------

export type TicketType = "support" | "prospect" | "internal" | "spam" | "other";

export interface TicketTypeTokens {
  badgeBg:     string;
  badgeText:   string;
  badgeBorder: string;
}

export const TICKET_TYPE_TOKENS: Record<TicketType, TicketTypeTokens> = {
  support:  { badgeBg: "bg-blue-50",  badgeText: "text-blue-700",  badgeBorder: "border-blue-200" },
  prospect: { badgeBg: "bg-green-50", badgeText: "text-green-700", badgeBorder: "border-green-200" },
  internal: { badgeBg: "bg-purple-50",badgeText: "text-purple-700",badgeBorder: "border-purple-200" },
  spam:     { badgeBg: "bg-zinc-100", badgeText: "text-zinc-600",  badgeBorder: "border-zinc-300" },
  other:    { badgeBg: "bg-zinc-100", badgeText: "text-zinc-600",  badgeBorder: "border-zinc-300" },
};

export const TICKET_TYPE_FALLBACK: TicketTypeTokens = {
  badgeBg:     "bg-zinc-100",
  badgeText:   "text-zinc-600",
  badgeBorder: "border-zinc-300",
};

export function getTicketTypeTokens(type: string | null | undefined): TicketTypeTokens {
  if (!type) return TICKET_TYPE_FALLBACK;
  return TICKET_TYPE_TOKENS[type.toLowerCase() as TicketType] ?? TICKET_TYPE_FALLBACK;
}
