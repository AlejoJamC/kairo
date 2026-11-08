import type { HandoffTokens, PlatformPorts } from "./platform";

/**
 * Removes every stored Supabase session from localStorage. A handoff brings a fresh session, and a
 * stale one left behind would be refreshed with a token the server has already seen: the refresh is
 * rejected, the client signs out, and the new session is wiped with it.
 */
export function discardStoredSessions(storage: Pick<Storage, "length" | "key" | "removeItem">): void {
  const stale: string[] = [];
  for (let index = 0; index < storage.length; index++) {
    const name = storage.key(index);
    if (name && /^sb-.+-auth-token(-code-verifier)?$/.test(name)) stale.push(name);
  }
  for (const name of stale) storage.removeItem(name);
}

function readHandoffTokens(): HandoffTokens | null {
  const hash = window.location.hash.substring(1);
  if (!hash) return null;

  const params = new URLSearchParams(hash);
  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");
  if (!access_token || !refresh_token) return null;

  history.replaceState(null, "", window.location.pathname);
  try {
    discardStoredSessions(window.localStorage);
  } catch {
    /* storage unavailable */
  }
  return { access_token, refresh_token };
}

/** Browser implementation of the platform ports. */
export function createWebPlatform(): PlatformPorts {
  // Read and clear the URL hash once, before any React effect runs, so the
  // tokens survive StrictMode's double mount.
  const handoff = readHandoffTokens();

  return {
    kind: "web",
    host: null,
    // localStorage can be missing or throw (private mode, torn-down test
    // environments); reads then return null and writes are dropped.
    storage: {
      getItem: (key) => {
        try {
          return window.localStorage.getItem(key);
        } catch {
          return null;
        }
      },
      setItem: (key, value) => {
        try {
          window.localStorage.setItem(key, value);
        } catch {
          /* storage unavailable */
        }
      },
      removeItem: (key) => {
        try {
          window.localStorage.removeItem(key);
        } catch {
          /* storage unavailable */
        }
      },
    },
    navigation: {
      navigate: (url) => {
        window.location.href = url;
      },
    },
    clipboard: {
      writeText: (text) => navigator.clipboard.writeText(text),
    },
    appFocus: {
      subscribe: (listener) => {
        const onFocus = () => listener(true);
        const onVisibility = () => listener(!document.hidden);
        window.addEventListener("focus", onFocus);
        document.addEventListener("visibilitychange", onVisibility);
        return () => {
          window.removeEventListener("focus", onFocus);
          document.removeEventListener("visibilitychange", onVisibility);
        };
      },
    },
    authHandoff: { takeHandoffTokens: async () => handoff },
  };
}
