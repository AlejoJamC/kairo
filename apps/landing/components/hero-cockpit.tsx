import {
  Inbox,
  Activity,
  Clock,
  Check,
  Users,
  BookOpen,
  BarChart2,
  Filter,
  Sparkles,
} from "lucide-react";

const SIDEBAR = [
  { label: "Triage", count: 23, active: true, Icon: Inbox },
  { label: "En Progreso", count: 7, Icon: Activity },
  { label: "Pendiente", count: 12, Icon: Clock },
  { label: "Resueltos", count: 184, Icon: Check },
  { label: "Clientes", Icon: Users },
  { label: "KB", Icon: BookOpen },
  { label: "Insights", Icon: BarChart2 },
];

const QUEUE = [
  { p: "p1", s: "urgent", sub: "Cobro duplicado en factura", from: "Marta Pérez", plan: "pro", t: "2m", sel: true },
  { p: "p1", s: "urgent", sub: "API devuelve 503 desde hace 20m", from: "Diego Tovar", plan: "scale", t: "4m" },
  { p: "p2", s: "neutral", sub: "¿Cómo cambio dominio de envío?", from: "Luisa Romero", plan: "pro", t: "11m" },
  { p: "p2", s: "casual", sub: "Interesados en Scale para 50 agentes", from: "Andrés Núñez", plan: "free", t: "23m", lead: true },
  { p: "p3", s: "casual", sub: "Sugerencia: filtros guardados", from: "Camila Ortega", plan: "pro", t: "1h" },
];

const RIGHT_STATS = [
  ["Plan", "Pro"],
  ["MRR", "$199"],
  ["Tickets", "34"],
  ["CSAT", "4.8"],
];

const SIMILAR = [
  ["KAI-T-0892", "0.94"],
  ["KAI-T-0814", "0.91"],
  ["KAI-T-0701", "0.87"],
];

const sentimentColor = (s: string) =>
  s === "urgent" ? "#EF4444" : s === "neutral" ? "#F59E0B" : "#10B981";

const planColor = (p: string) =>
  p === "free" ? "#A1A1AA" : p === "scale" ? "#F59E0B" : "#2B5BFF";

const pBg = (p: string) =>
  p === "p1" ? "#FEF2F2" : p === "p2" ? "#FFFBEB" : "#ECFDF5";
const pColor = (p: string) =>
  p === "p1" ? "#B91C1C" : p === "p2" ? "#B45309" : "#047857";

export function HeroCockpit() {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 14,
        overflow: "hidden",
        boxShadow: "0 30px 80px -20px rgba(9,9,11,0.18), 0 8px 24px -8px rgba(9,9,11,0.08)",
        background: "white",
        position: "relative",
      }}
    >
      {/* Title bar */}
      <div
        style={{
          height: 38,
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          padding: "0 14px",
          gap: 8,
          background: "var(--surface)",
        }}
      >
        <div style={{ display: "flex", gap: 6 }}>
          {["#FCA5A5", "#FCD34D", "#86EFAC"].map((c) => (
            <span key={c} style={{ width: 10, height: 10, borderRadius: 999, background: c }} />
          ))}
        </div>
        <span
          style={{
            marginLeft: 16,
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--text-tertiary)",
          }}
        >
          kairo.app/triage
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "180px 280px 1fr 240px", height: 460 }}>
        {/* Sidebar */}
        <div
          style={{
            borderRight: "1px solid var(--border-subtle)",
            padding: 10,
            background: "var(--surface)",
          }}
        >
          {SIDEBAR.map((item) => (
            <div
              key={item.label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 8px",
                borderRadius: 5,
                background: item.active ? "white" : "transparent",
                border: item.active ? "1px solid var(--border)" : "1px solid transparent",
                color: item.active ? "var(--text-primary)" : "var(--text-secondary)",
                marginBottom: 1,
              }}
            >
              <item.Icon size={13} strokeWidth={1.6} />
              <span style={{ flex: 1, fontSize: 12 }}>{item.label}</span>
              {item.count != null && (
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    color: "var(--text-tertiary)",
                  }}
                >
                  {item.count}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Queue */}
        <div style={{ borderRight: "1px solid var(--border-subtle)", overflow: "hidden" }}>
          <div
            style={{
              padding: "10px 12px",
              borderBottom: "1px solid var(--border-subtle)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--text-tertiary)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              BANDEJA · 23
            </span>
            <Filter size={12} color="var(--text-tertiary)" strokeWidth={1.6} />
          </div>
          {QUEUE.map((item, i) => (
            <div
              key={i}
              style={{
                padding: "9px 12px 9px 14px",
                borderBottom: "1px solid var(--border-subtle)",
                background: item.sel ? "var(--surface-2)" : "transparent",
                borderLeft: item.sel ? "2px solid var(--accent)" : "2px solid transparent",
                position: "relative",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 8,
                  bottom: 8,
                  width: 2,
                  background: sentimentColor(item.s),
                  borderRadius: "0 2px 2px 0",
                }}
              />
              <div
                style={{
                  display: "flex",
                  gap: 5,
                  marginBottom: 4,
                  fontSize: 9,
                  fontFamily: "var(--font-mono)",
                }}
              >
                <span
                  style={{
                    padding: "1px 5px",
                    borderRadius: 3,
                    background: pBg(item.p),
                    color: pColor(item.p),
                  }}
                >
                  {item.p.toUpperCase()}
                </span>
                {item.lead && (
                  <span style={{ padding: "1px 5px", borderRadius: 3, background: "#ECFDF5", color: "#047857" }}>
                    LEAD
                  </span>
                )}
                <span style={{ marginLeft: "auto", color: "var(--text-tertiary)" }}>{item.t}</span>
              </div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  marginBottom: 2,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {item.sub}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 11,
                  color: "var(--text-secondary)",
                }}
              >
                <span
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: 999,
                    background: planColor(item.plan),
                    flexShrink: 0,
                  }}
                />
                {item.from}
              </div>
            </div>
          ))}
        </div>

        {/* Center */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
            background: "var(--surface)",
          }}
        >
          <div
            style={{
              padding: "8px 14px",
              borderBottom: "1px solid var(--border-subtle)",
              display: "flex",
              gap: 8,
              alignItems: "center",
              background: "white",
              fontSize: 11,
            }}
          >
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 500 }}>KAI-T-1247</span>
            <span style={{ width: 1, height: 12, background: "var(--border)" }} />
            <span
              style={{
                padding: "1px 6px",
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 500,
                fontFamily: "var(--font-mono)",
                background: "#FEF2F2",
                color: "#B91C1C",
                border: "1px solid #FECACA",
              }}
            >
              P1
            </span>
            <span
              style={{
                padding: "1px 6px",
                borderRadius: 999,
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                background: "white",
                color: "var(--text-secondary)",
                border: "1px solid var(--border)",
              }}
            >
              Facturación
            </span>
          </div>
          <div style={{ padding: 16, flex: 1, overflow: "hidden" }}>
            <div
              style={{
                fontSize: 16,
                fontWeight: 600,
                letterSpacing: "-0.01em",
                marginBottom: 10,
                lineHeight: 1.25,
              }}
            >
              Cobro duplicado en factura de noviembre
            </div>
            <div
              style={{
                display: "flex",
                gap: 6,
                alignItems: "center",
                marginBottom: 12,
                padding: "6px 8px",
                background: "var(--accent-subtle)",
                borderRadius: 5,
                fontSize: 11,
              }}
            >
              <Sparkles size={11} color="#2B5BFF" />
              <span style={{ color: "var(--text-secondary)" }}>
                <span style={{ color: "#2B5BFF", fontWeight: 500 }}>Triage</span> clasificó como{" "}
                <strong>Facturación · Urgente</strong>
              </span>
              <span
                style={{
                  marginLeft: "auto",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  color: "var(--text-tertiary)",
                }}
              >
                hace 2s
              </span>
            </div>
            <div
              style={{
                background: "white",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: 12,
                fontSize: 12,
                lineHeight: 1.55,
                color: "var(--text-secondary)",
              }}
            >
              <div
                style={{
                  marginBottom: 6,
                  fontWeight: 500,
                  color: "var(--text-primary)",
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span>Marta Pérez</span>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    color: "var(--text-tertiary)",
                  }}
                >
                  09:42
                </span>
              </div>
              Vi en el panel que mi última factura tiene dos cargos por{" "}
              <span
                style={{
                  background: "#FEF2F2",
                  color: "#B91C1C",
                  padding: "0 3px",
                  borderRadius: 2,
                }}
              >
                $199
              </span>{" "}
              con la misma fecha. Necesito esto resuelto hoy, tenemos cierre contable…
            </div>
            <div
              style={{
                marginTop: 10,
                background: "white",
                border: "1px solid var(--border)",
                borderRadius: 8,
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: 2,
                  background: "linear-gradient(180deg,#2B5BFF,#6E8BFF)",
                }}
              />
              <div
                style={{
                  padding: "8px 12px",
                  fontSize: 10,
                  color: "var(--accent)",
                  fontWeight: 500,
                  fontFamily: "var(--font-mono)",
                  borderBottom: "1px solid var(--border-subtle)",
                }}
              >
                ✦ BORRADOR IA · 5 casos similares
              </div>
              <div
                style={{
                  padding: 12,
                  fontSize: 12,
                  color: "var(--text-primary)",
                  lineHeight: 1.55,
                }}
              >
                Hola Marta, confirmamos el cargo duplicado en la orden #4729 y ya iniciamos el
                reembolso al método original…
              </div>
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div
          style={{
            borderLeft: "1px solid var(--border-subtle)",
            padding: 12,
            fontSize: 11,
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            CLIENTE
          </span>
          <div style={{ display: "flex", gap: 8, marginTop: 8, marginBottom: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 999,
                background: "linear-gradient(135deg,#FCA5A5,#F472B6)",
                color: "white",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                fontWeight: 600,
                flexShrink: 0,
              }}
            >
              MP
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 500 }}>Marta Pérez</div>
              <div style={{ color: "var(--text-tertiary)", fontSize: 10 }}>Acme · CFO</div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {RIGHT_STATS.map(([label, value]) => (
              <div key={label} style={{ padding: 6, background: "var(--surface)", borderRadius: 5 }}>
                <div
                  style={{
                    fontSize: 9,
                    fontFamily: "var(--font-mono)",
                    color: "var(--text-tertiary)",
                    textTransform: "uppercase",
                  }}
                >
                  {label}
                </div>
                <div style={{ fontSize: 12, fontWeight: 500 }}>{value}</div>
              </div>
            ))}
          </div>
          <div
            style={{
              marginTop: 14,
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            3 casos similares
          </div>
          {SIMILAR.map(([id, score]) => (
            <div
              key={id}
              style={{
                padding: "6px 8px",
                border: "1px solid var(--border-subtle)",
                borderRadius: 5,
                marginTop: 6,
                display: "flex",
                justifyContent: "space-between",
                fontSize: 10,
                fontFamily: "var(--font-mono)",
              }}
            >
              <span style={{ color: "var(--text-secondary)" }}>{id}</span>
              <span style={{ color: "#10B981" }}>{score}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Floating callout */}
      <div
        style={{
          position: "absolute",
          bottom: 80,
          left: 220,
          background: "white",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: "8px 12px",
          fontSize: 12,
          display: "flex",
          alignItems: "center",
          gap: 8,
          boxShadow: "0 8px 24px -4px rgba(9,9,11,0.15)",
        }}
      >
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: 5,
            background: "linear-gradient(135deg,#2B5BFF,#6E8BFF)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Sparkles size={11} color="white" />
        </span>
        <div>
          <div style={{ fontWeight: 500 }}>
            Triage clasificó como <span style={{ color: "#2B5BFF" }}>Facturación · Urgente</span>
          </div>
          <div
            style={{
              fontSize: 10,
              color: "var(--text-tertiary)",
              fontFamily: "var(--font-mono)",
            }}
          >
            hace 2s · confianza 0.94
          </div>
        </div>
      </div>
    </div>
  );
}
