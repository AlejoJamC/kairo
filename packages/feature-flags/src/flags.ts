// =============================================================================
// Feature flags — flip ON/OFF to enable or disable high-level product areas.
//
// Hierarchy:
//   dashboard
//     └── rightPanel
//           ├── clientTab       (Pestaña 1 — Cliente)
//           ├── similarTab      (Pestaña 2 — Similares)
//           ├── articlesTab     (Pestaña 3 — Artículos)
//           └── escalateTab     (Pestaña 4 — Escalar)  ← OFF: not ready yet
// =============================================================================

export const FLAGS = {
  dashboard: {
    rightPanel: {
      clientTab:   true,
      similarTab:  true,
      articlesTab: true,
      escalateTab: false, // 🚧 not ready for testing — re-enable when escalation flow is refined
    },
  },
} as const;

export type FeatureFlags = typeof FLAGS;
