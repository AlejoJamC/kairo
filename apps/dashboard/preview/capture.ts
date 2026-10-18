// Records the geometry and computed style of every element on the page so two
// renders (before and after a refactor) can be compared with diff-snapshots.ts.

const PROPS = [
  "display", "position", "flexDirection", "flexWrap", "justifyContent", "alignItems", "alignSelf", "gap",
  "flexGrow", "flexShrink", "flexBasis", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
  "marginTop", "marginRight", "marginBottom", "marginLeft", "borderTopWidth", "borderRightWidth",
  "borderBottomWidth", "borderLeftWidth", "borderTopStyle", "borderTopColor", "borderBottomColor",
  "borderLeftColor", "borderRightColor", "borderTopLeftRadius", "backgroundColor", "backgroundImage", "color",
  "fontSize", "fontWeight", "fontFamily", "lineHeight", "letterSpacing", "textAlign", "textTransform",
  "textOverflow", "whiteSpace", "opacity", "overflowX", "overflowY", "cursor", "zIndex", "boxShadow",
  "transform", "minWidth", "minHeight", "maxWidth", "maxHeight",
] as const;

export interface ElementSnapshot {
  tag: string;
  text: string;
  rect: [number, number, number, number];
  style: Record<string, string>;
}

export function captureLayout(): ElementSnapshot[] {
  const root = document.getElementById("root")!;
  return Array.from(root.querySelectorAll("*")).map((el) => {
    const rect = el.getBoundingClientRect();
    const computed = getComputedStyle(el);
    const style: Record<string, string> = {};
    for (const prop of PROPS) style[prop] = computed[prop as keyof CSSStyleDeclaration] as string;
    const own = Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent ?? "").join("").trim();
    return {
      tag: el.tagName.toLowerCase(),
      text: own.slice(0, 24),
      rect: [rect.x + window.scrollX, rect.y + window.scrollY, rect.width, rect.height].map((v) => Math.round(v * 2) / 2) as ElementSnapshot["rect"],
      style,
    };
  });
}

export async function saveSnapshot(name: string): Promise<number> {
  const data = captureLayout();
  await fetch(`/__snapshot/${name}`, { method: "POST", body: JSON.stringify(data) });
  return data.length;
}

const ROUTES: Record<string, string> = {
  triage: "/", clients: "/clients", settings: "/settings", password: "/settings/password",
  channels: "/settings/channels", awaiting: "/awaiting", resolved: "/resolved", escalated: "/escalated",
  knowledge: "/knowledge", "ai-review": "/ai-review",
};

/** Snapshots every dashboard screen by navigating inside the single-page app. */
export async function saveAllSnapshots(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const [name, path] of Object.entries(ROUTES)) {
    history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
    await new Promise((resolve) => setTimeout(resolve, 1800));
    counts[name] = await saveSnapshot(name);
  }
  return counts;
}
