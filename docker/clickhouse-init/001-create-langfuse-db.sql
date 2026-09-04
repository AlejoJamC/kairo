-- Runs once, on first container startup (official clickhouse-server image executes
-- every .sql file under /docker-entrypoint-initdb.d/ when the data dir is empty).
-- Langfuse's own migration tool expects this database to already exist — it does
-- not create it — so without this, `langfuse-web`/`langfuse-worker` fail to start
-- with "Database langfuse does not exist".
CREATE DATABASE IF NOT EXISTS langfuse;
