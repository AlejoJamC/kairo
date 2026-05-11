// Top chrome — 56 px header bar: logo/toggle | search | HeaderActions
// FIG 2.4 · Notificaciones popover
// FIG 2.5 · Cuenta popover

import { useRef, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Search,
  Bell,
  PanelLeft,
  Sparkles,
  User,
  Settings,
  Zap,
  BookOpen,
  LogOut,
  Check,
  ChevronDown,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import type { AppView } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// Token shortcuts (keeps inline styles terse)
// ─────────────────────────────────────────────────────────────────────────────
const T = {
  bg:           "var(--k-bg)",
  surface:      "var(--k-surface)",
  surface2:     "var(--k-surface-2)",
  border:       "var(--k-border)",
  borderSubtle: "var(--k-border-subtle)",
  textPrimary:  "var(--k-text-primary)",
  textSecondary:"var(--k-text-secondary)",
  textTertiary: "var(--k-text-tertiary)",
  accent:       "var(--k-accent)",
  accentSubtle: "var(--k-accent-subtle)",
  mono:         "var(--k-font-mono)",
  display:      "var(--k-font-display)",
  shadow:       "0 4px 24px rgba(9,9,11,.12), 0 1px 4px rgba(9,9,11,.07)",
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Notifications data + helpers
// ─────────────────────────────────────────────────────────────────────────────
interface NotifItem {
  id: string;
  kind: "mention" | "escalation" | "assigned" | "ai" | "reply" | "report" | "system";
  unread: boolean;
  who: string;
  actor: string;
  actorBg: string;
  actorColor?: string;
  title: string;
  target: string | null;
  preview: string;
  time: string;
}

const INITIAL_NOTIFS: NotifItem[] = [
  { id:"n7", kind:"mention",    unread:true,  who:"Diego Tovar",   actor:"DT", actorBg:"linear-gradient(135deg,#A7F3D0,#10B981)",
    title:"te mencionó en", target:"KAI-T-1246", preview:"@valentina ¿podemos escalar esto a infra? El 503 sigue.", time:"2m" },
  { id:"n6", kind:"escalation", unread:true,  who:"Sistema",       actor:"!",  actorBg:"#FEE2E2", actorColor:"#B91C1C",
    title:"Escalación automática", target:"KAI-T-1246", preview:"P1 sin respuesta > 5 min · cliente Scale ($890 MRR).", time:"4m" },
  { id:"n5", kind:"assigned",   unread:true,  who:"Lucía Mendoza", actor:"LM", actorBg:"linear-gradient(135deg,#FDE68A,#F59E0B)",
    title:"te asignó", target:"KAI-T-1244", preview:"Lead Scale · 50 agentes. Pasa a tu cola de ventas.", time:"12m" },
  { id:"n4", kind:"ai",         unread:false, who:"Triage IA",     actor:"✦",  actorBg:"var(--k-accent-subtle)", actorColor:"var(--k-accent)",
    title:"Clasificó 12 tickets nuevos", target:null, preview:"9 soporte · 2 leads · 1 spam. Revisar bandeja.", time:"32m" },
  { id:"n3", kind:"reply",      unread:false, who:"Marta Pérez",   actor:"MP", actorBg:"linear-gradient(135deg,#FCA5A5,#F472B6)",
    title:"respondió en", target:"KAI-T-1247", preview:"Perfecto, esperamos el crédito. Gracias por la rapidez.", time:"1h" },
  { id:"n2", kind:"report",     unread:false, who:"Insights",      actor:"◴",  actorBg:"var(--k-surface-2)", actorColor:"var(--k-text-secondary)",
    title:"Reporte semanal listo", target:null, preview:"CSAT 4.7 · FRT 3m 12s · 184 resueltos.", time:"3h" },
  { id:"n1", kind:"system",     unread:false, who:"Integraciones", actor:"S",  actorBg:"#09090B", actorColor:"white",
    title:"Slack sincronizado", target:null, preview:"Canal #soporte-latam conectado al cockpit.", time:"ayer" },
];

const NOTIF_DOT_COLOR: Record<NotifItem["kind"], string> = {
  escalation: "#EF4444",
  mention:    "var(--k-accent)",
  assigned:   "#F59E0B",
  ai:         "var(--k-accent)",
  reply:      "#10B981",
  report:     "var(--k-text-tertiary)",
  system:     "var(--k-text-tertiary)",
};

function NotifDot({ kind }: { kind: NotifItem["kind"] }) {
  return (
    <span style={{
      width: 6, height: 6, borderRadius: 999,
      background: NOTIF_DOT_COLOR[kind],
      flexShrink: 0, display: "inline-block",
    }}/>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Notifications Popover
// ─────────────────────────────────────────────────────────────────────────────
interface NotifPopoverProps {
  items: NotifItem[];
  onMarkAll: () => void;
}

function NotificationsPopover({ items, onMarkAll }: NotifPopoverProps) {
  const { t } = useTranslation(["dashboard"]);
  const [tab, setTab] = useState<"todas" | "no-leidas" | "menciones">("todas");

  const filtered =
    tab === "no-leidas" ? items.filter((n) => n.unread) :
    tab === "menciones" ? items.filter((n) => n.kind === "mention") :
    items;

  const unread = items.filter((n) => n.unread).length;

  const TABS: [string, string][] = [
    ["todas",      t("dashboard:topChrome.notifications.tabAll")],
    ["no-leidas",  t("dashboard:topChrome.notifications.tabUnread")],
    ["menciones",  t("dashboard:topChrome.notifications.tabMentions")],
  ];

  return (
    <div style={{
      position: "absolute", top: "calc(100% + 8px)", right: 0, width: 380,
      background: T.bg, border: `1px solid ${T.border}`, borderRadius: 10,
      boxShadow: T.shadow, overflow: "hidden", zIndex: 100,
    }}>
      {/* Header */}
      <div style={{ padding: "12px 14px 8px", borderBottom: `1px solid ${T.borderSubtle}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em", color: T.textPrimary }}>
              {t("dashboard:topChrome.notifications.title")}
            </span>
            <span style={{ fontSize: 11, fontFamily: T.mono, color: T.textTertiary }}>
              {t("dashboard:topChrome.notifications.unreadCount", { count: unread })}
            </span>
          </div>
          <button
            onClick={onMarkAll}
            style={{
              fontSize: 11, padding: "4px 8px", borderRadius: 4,
              color: T.textSecondary, fontFamily: T.mono,
              border: `1px solid ${T.border}`, background: T.bg, cursor: "pointer",
            }}
          >
            {t("dashboard:topChrome.notifications.markRead")}
          </button>
        </div>
        {/* Tabs */}
        <div style={{ display: "flex", gap: 4 }}>
          {TABS.map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id as typeof tab)}
              style={{
                fontSize: 11, padding: "4px 8px", borderRadius: 4,
                background: tab === id ? T.surface2 : "transparent",
                color: tab === id ? T.textPrimary : T.textTertiary,
                fontFamily: T.mono, border: "none", cursor: "pointer",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div style={{ maxHeight: 420, overflowY: "auto" }}>
        {filtered.length === 0 && (
          <div style={{ padding: "40px 20px", textAlign: "center", fontSize: 12, color: T.textTertiary, fontFamily: T.mono }}>
            {t("dashboard:topChrome.notifications.empty")}
          </div>
        )}
        {filtered.map((n) => (
          <NotifRow key={n.id} n={n} />
        ))}
      </div>

      {/* Footer */}
      <div style={{
        padding: "8px 14px", borderTop: `1px solid ${T.borderSubtle}`,
        background: T.surface, display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <span style={{ fontSize: 11, fontFamily: T.mono, color: T.textTertiary, display: "flex", alignItems: "center", gap: 5 }}>
          <span className="animate-pulse" style={{ width: 5, height: 5, borderRadius: 999, background: "#10B981", display: "inline-block" }}/>
          {t("dashboard:topChrome.notifications.liveStream")}
        </span>
        <button style={{ fontSize: 12, color: T.accent, fontWeight: 500, background: "none", border: "none", cursor: "pointer" }}>
          {t("dashboard:topChrome.notifications.viewAll")}
        </button>
      </div>
    </div>
  );
}

function NotifRow({ n }: { n: NotifItem }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: "11px 14px", borderBottom: `1px solid ${T.borderSubtle}`,
        background: hovered ? T.surface2 : n.unread ? "#FAFBFF" : T.bg,
        display: "flex", gap: 10, cursor: "pointer", position: "relative",
      }}
    >
      {n.unread && (
        <span style={{
          position: "absolute", left: 5, top: 16,
          width: 4, height: 4, borderRadius: 999, background: T.accent,
        }}/>
      )}
      {/* Actor avatar */}
      <div style={{
        width: 28, height: 28, borderRadius: 999, background: n.actorBg,
        color: n.actorColor ?? "white", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 11, fontWeight: 600,
      }}>
        {n.actor}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
          <NotifDot kind={n.kind}/>
          <span style={{ fontSize: 12, color: T.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
            <strong style={{ fontWeight: 500 }}>{n.who}</strong>
            <span style={{ color: T.textSecondary }}> {n.title}</span>
            {n.target && (
              <span style={{ fontFamily: T.mono, color: T.accent, marginLeft: 4 }}>{n.target}</span>
            )}
          </span>
          <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textTertiary, flexShrink: 0 }}>{n.time}</span>
        </div>
        <div style={{
          fontSize: 12, color: T.textSecondary, lineHeight: 1.45,
          overflow: "hidden", display: "-webkit-box",
          WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
        } as React.CSSProperties}>
          {n.preview}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Profile / Account Popover
// ─────────────────────────────────────────────────────────────────────────────
type UserStatus = "online" | "busy" | "away" | "offline";

// Dots are semantic colors — not translated
const STATUS_DOTS: Record<UserStatus, string> = {
  online:  "#10B981",
  busy:    "#EF4444",
  away:    "#F59E0B",
  offline: "#A1A1AA",
};

type Theme = "light" | "auto" | "dark";
const THEME_IDS: Theme[] = ["light", "auto", "dark"];

interface ProfilePopoverProps {
  initials: string;
  displayName: string;
  email: string;
  status: UserStatus;
  setStatus: (s: UserStatus) => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  onNavigate: (view: AppView) => void;
  onSignOut: () => void;
}

function ProfilePopover({
  initials, displayName, email,
  status, setStatus, theme, setTheme,
  onNavigate, onSignOut,
}: ProfilePopoverProps) {
  const { t } = useTranslation(["dashboard"]);

  const STATUS_OPTIONS: { id: UserStatus; label: string; dot: string }[] = [
    { id: "online",  label: t("dashboard:topChrome.account.statusOnline"),  dot: STATUS_DOTS.online },
    { id: "busy",    label: t("dashboard:topChrome.account.statusBusy"),    dot: STATUS_DOTS.busy },
    { id: "away",    label: t("dashboard:topChrome.account.statusAway"),    dot: STATUS_DOTS.away },
    { id: "offline", label: t("dashboard:topChrome.account.statusOffline"), dot: STATUS_DOTS.offline },
  ];

  const THEME_OPTIONS: [Theme, string][] = [
    ["light", t("dashboard:topChrome.account.themeLight")],
    ["auto",  t("dashboard:topChrome.account.themeAuto")],
    ["dark",  t("dashboard:topChrome.account.themeDark")],
  ];

  const cur = STATUS_OPTIONS.find((s) => s.id === status) ?? STATUS_OPTIONS[0];

  const MENU_ITEMS: { icon: React.ReactNode; label: string; kbd: string | null; action: () => void }[] = [
    { icon: <User size={14} color={T.textTertiary}/>,     label: t("dashboard:topChrome.account.menuProfile"),   kbd: null,  action: () => {} },
    { icon: <Settings size={14} color={T.textTertiary}/>, label: t("dashboard:topChrome.account.menuSettings"),  kbd: "⌘,",  action: () => onNavigate("settings") },
    { icon: <Zap size={14} color={T.textTertiary}/>,      label: t("dashboard:topChrome.account.menuShortcuts"), kbd: "⌘?",  action: () => {} },
    { icon: <BookOpen size={14} color={T.textTertiary}/>, label: t("dashboard:topChrome.account.menuDocs"),      kbd: null,  action: () => {} },
  ];

  return (
    <div style={{
      position: "absolute", top: "calc(100% + 8px)", right: 0, width: 300,
      background: T.bg, border: `1px solid ${T.border}`, borderRadius: 10,
      boxShadow: T.shadow, overflow: "hidden", zIndex: 100,
    }}>
      {/* User card */}
      <div style={{ padding: 14, borderBottom: `1px solid ${T.borderSubtle}` }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div style={{ position: "relative", flexShrink: 0 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 999,
              background: "linear-gradient(135deg, var(--k-accent) 0%, #6E8BFF 100%)",
              color: "white", fontSize: 13, fontWeight: 600,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {initials}
            </div>
            <div style={{
              position: "absolute", bottom: -1, right: -1,
              width: 12, height: 12, borderRadius: 999,
              background: cur.dot, border: `2px solid ${T.bg}`,
            }}/>
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: T.textPrimary }}>{displayName}</div>
            <div style={{ fontSize: 12, color: T.textTertiary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {email}
            </div>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 4, marginTop: 4,
              padding: "1px 6px", borderRadius: 4, background: T.accentSubtle,
            }}>
              <Sparkles size={9} color={T.accent}/>
              <span style={{ fontSize: 10, fontFamily: T.mono, color: T.accent, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {t("dashboard:topChrome.account.roleBadge")}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Status selector */}
      <div style={{ padding: "10px 8px", borderBottom: `1px solid ${T.borderSubtle}` }}>
        <div style={{ padding: "0 6px 6px", fontSize: 10, fontFamily: T.mono, color: T.textTertiary, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {t("dashboard:topChrome.account.statusSection")}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
          {STATUS_OPTIONS.map((s) => (
            <StatusOptionButton key={s.id} s={s} active={status === s.id} onClick={() => setStatus(s.id)}/>
          ))}
        </div>
      </div>

      {/* Workspace */}
      <div style={{ padding: 10, borderBottom: `1px solid ${T.borderSubtle}` }}>
        <div style={{ padding: "0 4px 6px", fontSize: 10, fontFamily: T.mono, color: T.textTertiary, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {t("dashboard:topChrome.account.workspaceSection")}
        </div>
        <div style={{
          display: "flex", alignItems: "center", gap: 8, padding: 8, borderRadius: 6,
          border: `1px solid ${T.border}`, background: T.bg,
        }}>
          <div style={{
            width: 22, height: 22, borderRadius: 5, background: "#09090B", color: "white",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 10, fontWeight: 600, flexShrink: 0,
          }}>K</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: T.textPrimary }}>{t("dashboard:topChrome.account.workspaceName")}</div>
            <div style={{ fontSize: 10, color: T.textTertiary, fontFamily: T.mono }}>{t("dashboard:topChrome.account.workspacePlan")}</div>
          </div>
          <button style={{
            fontSize: 10, fontFamily: T.mono, color: T.textTertiary,
            padding: "2px 6px", border: `1px solid ${T.border}`,
            borderRadius: 4, background: "transparent", cursor: "pointer",
          }}>
            {t("dashboard:topChrome.account.workspaceChange")}
          </button>
        </div>
      </div>

      {/* Menu items */}
      <div style={{ padding: 6 }}>
        {MENU_ITEMS.map((item) => (
          <MenuButton key={item.label} icon={item.icon} label={item.label} kbd={item.kbd} action={item.action}/>
        ))}
      </div>

      {/* Theme toggle */}
      <div style={{ padding: "6px 10px 10px", borderTop: `1px solid ${T.borderSubtle}` }}>
        <div style={{ padding: "4px 0 6px", fontSize: 10, fontFamily: T.mono, color: T.textTertiary, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {t("dashboard:topChrome.account.appearanceSection")}
        </div>
        <div style={{
          display: "flex", gap: 2, padding: 2,
          background: T.surface, borderRadius: 6, border: `1px solid ${T.border}`,
        }}>
          {THEME_OPTIONS.map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTheme(id)}
              style={{
                flex: 1, padding: "5px 0", fontSize: 11, borderRadius: 4,
                background: theme === id ? T.bg : "transparent",
                color: theme === id ? T.textPrimary : T.textTertiary,
                fontFamily: T.mono, fontWeight: theme === id ? 500 : 400,
                boxShadow: theme === id ? "0 1px 3px rgba(9,9,11,.08)" : "none",
                border: "none", cursor: "pointer",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Sign out */}
      <div style={{ padding: 6, borderTop: `1px solid ${T.borderSubtle}` }}>
        <SignOutButton onSignOut={onSignOut} initials={initials}/>
      </div>
    </div>
  );
}

// Small helpers to isolate hover state ───────────────────────────────────────

function StatusOptionButton({
  s, active, onClick,
}: { s: (typeof STATUS_OPTIONS)[number]; active: boolean; onClick: () => void }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 5,
        background: active || hov ? T.surface2 : "transparent",
        fontSize: 12, color: T.textSecondary, textAlign: "left",
        border: "none", cursor: "pointer",
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: 999, background: s.dot, flexShrink: 0 }}/>
      <span style={{ flex: 1 }}>{s.label}</span>
      {active && <Check size={11} color={T.textPrimary}/>}
    </button>
  );
}

function MenuButton({
  icon, label, kbd, action,
}: { icon: React.ReactNode; label: string; kbd: string | null; action: () => void }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={action}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 10,
        padding: "7px 10px", borderRadius: 5,
        color: T.textSecondary, fontSize: 13, textAlign: "left",
        background: hov ? T.surface2 : "transparent",
        border: "none", cursor: "pointer",
      }}
    >
      {icon}
      <span style={{ flex: 1 }}>{label}</span>
      {kbd && (
        <kbd style={{
          fontFamily: T.mono, fontSize: 10, padding: "1px 5px",
          background: T.surface, border: `1px solid ${T.border}`,
          borderRadius: 3, color: T.textTertiary,
        }}>
          {kbd}
        </kbd>
      )}
    </button>
  );
}

function SignOutButton({ onSignOut, initials }: { onSignOut: () => void; initials: string }) {
  const { t } = useTranslation(["dashboard"]);
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onSignOut}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 10,
        padding: "7px 10px", borderRadius: 5,
        color: "#B91C1C", fontSize: 13, textAlign: "left",
        background: hov ? "#FEF2F2" : "transparent",
        border: "none", cursor: "pointer",
      }}
    >
      <LogOut size={14} color="#B91C1C"/>
      <span style={{ flex: 1 }}>{t("dashboard:topChrome.account.signOut")}</span>
      <span style={{ fontFamily: T.mono, fontSize: 10, color: "#B91C1C", opacity: 0.6 }}>{initials}</span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HeaderActions — orchestrates both popovers
// ─────────────────────────────────────────────────────────────────────────────
interface HeaderActionsProps {
  initials: string;
  displayName: string;
  email: string;
  onViewChange: (view: AppView) => void;
  onSignOut: () => void;
}

function HeaderActions({ initials, displayName, email, onViewChange, onSignOut }: HeaderActionsProps) {
  const [open, setOpen] = useState<"notif" | "profile" | null>(null);
  const [notifs, setNotifs] = useState<NotifItem[]>(INITIAL_NOTIFS);
  const [status, setStatus] = useState<UserStatus>("online");
  const [theme, setTheme] = useState<Theme>("light");
  const ref = useRef<HTMLDivElement>(null);

  const unread = notifs.filter((n) => n.unread).length;
  const curStatusDot = STATUS_DOTS[status];

  // Click-outside + Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ display: "flex", alignItems: "center", gap: 6, position: "relative" }}>
      {/* Bell */}
      <div style={{ position: "relative" }}>
        <button
          aria-label="Notificaciones"
          onClick={() => setOpen((o) => (o === "notif" ? null : "notif"))}
          style={{
            padding: 6, borderRadius: 6, border: "none", cursor: "pointer",
            position: "relative",
            color: open === "notif" ? T.textPrimary : T.textSecondary,
            background: open === "notif" ? T.surface2 : "transparent",
            display: "flex", alignItems: "center",
          }}
        >
          <Bell size={18}/>
          {unread > 0 && (
            <span style={{
              position: "absolute", top: 2, right: 2,
              minWidth: 14, height: 14, padding: "0 3px",
              borderRadius: 999, background: "#EF4444", color: "white",
              fontSize: 9, fontFamily: T.mono, fontWeight: 600,
              display: "flex", alignItems: "center", justifyContent: "center",
              border: `2px solid ${T.bg}`, boxSizing: "content-box",
            }}>
              {unread}
            </span>
          )}
        </button>
        {open === "notif" && (
          <NotificationsPopover
            items={notifs}
            onMarkAll={() => setNotifs((ns) => ns.map((n) => ({ ...n, unread: false })))}
          />
        )}
      </div>

      {/* Avatar + chevron */}
      <div style={{ position: "relative", paddingLeft: 8, marginLeft: 2, borderLeft: `1px solid ${T.border}` }}>
        <button
          aria-label="Cuenta"
          onClick={() => setOpen((o) => (o === "profile" ? null : "profile"))}
          style={{
            display: "flex", alignItems: "center", gap: 6, padding: 2, borderRadius: 999,
            background: open === "profile" ? T.surface2 : "transparent",
            border: open === "profile" ? `1px solid ${T.border}` : "1px solid transparent",
            cursor: "pointer",
          }}
        >
          <div style={{ position: "relative" }}>
            <div style={{
              width: 28, height: 28, borderRadius: 999,
              background: "linear-gradient(135deg, var(--k-accent) 0%, #6E8BFF 100%)",
              color: "white", fontSize: 11, fontWeight: 600,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {initials}
            </div>
            <div style={{
              position: "absolute", bottom: -1, right: -1,
              width: 9, height: 9, borderRadius: 999,
              background: curStatusDot, border: `2px solid ${T.bg}`,
            }}/>
          </div>
          <ChevronDown size={12} color={T.textTertiary}/>
        </button>
        {open === "profile" && (
          <ProfilePopover
            initials={initials}
            displayName={displayName}
            email={email}
            status={status}
            setStatus={setStatus}
            theme={theme}
            setTheme={setTheme}
            onNavigate={(view) => { setOpen(null); onViewChange(view); }}
            onSignOut={() => { setOpen(null); onSignOut(); }}
          />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TopChrome — public export
// ─────────────────────────────────────────────────────────────────────────────
interface TopChromeProps {
  collapsed: boolean;
  onToggle: () => void;
  onViewChange: (view: AppView) => void;
}

export function TopChrome({ collapsed, onToggle, onViewChange }: TopChromeProps) {
  const { t } = useTranslation(["dashboard"]);
  const { profile, signOut } = useAuth();

  const initials = profile?.name
    ? profile.name.split(" ").map((p: string) => p[0] ?? "").join("").toUpperCase().slice(0, 2)
    : (profile?.email?.[0] ?? "U").toUpperCase();

  const displayName = profile?.name ?? profile?.email ?? "Usuario";
  const email = profile?.email ?? "";

  return (
    <header style={{
      height: 56, flexShrink: 0,
      display: "flex", alignItems: "center",
      padding: "0 16px", gap: 16,
      background: T.bg, borderBottom: `1px solid ${T.border}`,
    }}>
      {/* Logo + sidebar toggle */}
      <div style={{
        width: collapsed ? 40 : 208,
        display: "flex", alignItems: "center",
        justifyContent: collapsed ? "center" : "space-between",
        flexShrink: 0, transition: "width 0.18s ease",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 6, background: "#2B5BFF",
            display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"/>
            </svg>
          </div>
          {!collapsed && (
            <span style={{
              fontSize: 15, fontWeight: 600, color: T.textPrimary,
              fontFamily: T.display, letterSpacing: "-0.01em",
            }}>
              Kairo
            </span>
          )}
        </div>
        <button
          onClick={onToggle}
          aria-label="Toggle sidebar"
          style={{
            padding: 6, color: T.textTertiary,
            background: "none", border: "none", cursor: "pointer",
            borderRadius: 6, display: "flex", alignItems: "center",
          }}
        >
          <PanelLeft size={16}/>
        </button>
      </div>

      {/* Search */}
      <div style={{
        flex: 1, maxWidth: 480, height: 34,
        border: `1px solid ${T.border}`, borderRadius: 8,
        display: "flex", alignItems: "center", padding: "0 10px", gap: 8,
        background: T.surface, color: T.textTertiary, fontSize: 13,
      }}>
        <Search size={14}/>
        <span style={{ flex: 1 }}>{t("dashboard:topChrome.searchPlaceholder")}</span>
        <kbd style={{
          fontFamily: T.mono, fontSize: 11, padding: "1px 6px",
          background: T.bg, border: `1px solid ${T.border}`,
          borderRadius: 4, color: T.textTertiary,
        }}>
          ⌘K
        </kbd>
      </div>

      {/* Right actions */}
      <div style={{ marginLeft: "auto" }}>
        <HeaderActions
          initials={initials}
          displayName={displayName}
          email={email}
          onViewChange={onViewChange}
          onSignOut={signOut}
        />
      </div>
    </header>
  );
}
