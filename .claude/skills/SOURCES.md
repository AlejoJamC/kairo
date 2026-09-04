# Vendored skills

Skills below are vendored from official upstream repos for the Langfuse + ClickHouse/ClickStack observability work (KAI-126). Update by re-copying the `skills/<name>` folder from the source repo.

| Skill | Source | License |
|---|---|---|
| `langfuse/` | [github.com/langfuse/skills](https://github.com/langfuse/skills) — `skills/langfuse` | MIT (Langfuse GmbH) |
| `infra-clickhouse/` | [github.com/ClickHouse/agent-skills](https://github.com/ClickHouse/agent-skills) — `skills/infra-clickhouse` | Apache-2.0 |
| `clickstack-otel-collector/` | [github.com/ClickHouse/agent-skills](https://github.com/ClickHouse/agent-skills) — `skills/clickstack-otel-collector` | Apache-2.0 |
| `clickhouse-best-practices/` | [github.com/ClickHouse/agent-skills](https://github.com/ClickHouse/agent-skills) — `skills/clickhouse-best-practices` | Apache-2.0 |

Not vendored (out of scope for this repo): `chdb-sql`, `chdb-datastore`, `clickhouse-js-node-*`, `clickhouse-managed-postgres-rca`, `infra-postgres`, `clickhouse-architecture-advisor` — pull them in later if a task actually needs them.
