-- Estrutura do banco do EventRelay.
-- Uso: psql -U <usuario> -d <banco> -f db/schema.sql
-- Este arquivo não apaga nada: tabelas que já existem são mantidas como estão.

CREATE TABLE IF NOT EXISTS endpoints (
    id   SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    url  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS deliveries (
    id          SERIAL PRIMARY KEY,
    endpoint_id INTEGER NOT NULL REFERENCES endpoints (id),
    event_type  VARCHAR(200) NOT NULL,
    payload     JSONB NOT NULL,
    status      VARCHAR(20) NOT NULL,
    http_status SMALLINT,
    created_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    -- A primeira tentativa, feita em POST /events, já conta: por isso começa em 1.
    attempts    INTEGER DEFAULT 1
);
