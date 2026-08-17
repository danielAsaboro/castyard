export const catalogueSchemaStatements = [
  `CREATE TABLE IF NOT EXISTS agents (
    agent_id TEXT PRIMARY KEY,
    token_id TEXT NOT NULL,
    chain_id INTEGER NOT NULL CHECK (chain_id IN (56, 97)),
    network TEXT NOT NULL CHECK (network IN ('mainnet', 'testnet')),
    registry_address TEXT NOT NULL,
    owner_address TEXT NOT NULL,
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    description TEXT NOT NULL,
    protocols_json TEXT NOT NULL,
    category_claims_json TEXT NOT NULL,
    search_text TEXT NOT NULL,
    x402_supported INTEGER NOT NULL CHECK (x402_supported IN (0, 1)),
    erc8183_supported INTEGER NOT NULL CHECK (erc8183_supported IN (0, 1)),
    evidence_state TEXT NOT NULL CHECK (evidence_state IN ('registered', 'claimed', 'observed', 'activatable')),
    evidence_rank INTEGER NOT NULL CHECK (evidence_rank BETWEEN 0 AND 3),
    feedback_count INTEGER,
    average_score REAL,
    price_amount REAL,
    price_token TEXT,
    created_at TEXT,
    updated_at TEXT,
    observed_at TEXT NOT NULL,
    source_url TEXT NOT NULL,
    source_request_id TEXT,
    current INTEGER NOT NULL DEFAULT 1 CHECK (current IN (0, 1)),
    last_sync_id TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_agents_current_network_evidence
    ON agents(current, network, evidence_rank, observed_at)`,
  `CREATE INDEX IF NOT EXISTS idx_agents_current_name
    ON agents(current, normalized_name, agent_id)`,
  `CREATE TABLE IF NOT EXISTS agent_sources (
    agent_id TEXT NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
    source_name TEXT NOT NULL,
    source_url TEXT NOT NULL,
    observed_at TEXT NOT NULL,
    upstream_at TEXT,
    request_id TEXT,
    PRIMARY KEY (agent_id, source_name)
  )`,
  `CREATE TABLE IF NOT EXISTS agent_services (
    agent_id TEXT NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
    service_name TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    protocol_version TEXT,
    last_status TEXT,
    last_observed_at TEXT,
    PRIMARY KEY (agent_id, service_name, endpoint)
  )`,
  `CREATE TABLE IF NOT EXISTS catalogue_sync_runs (
    sync_id TEXT PRIMARY KEY,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    complete INTEGER NOT NULL DEFAULT 0 CHECK (complete IN (0, 1)),
    coverage_json TEXT NOT NULL,
    indexed_count INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS agents_fts USING fts5(
    name,
    description,
    search_text,
    content='agents',
    content_rowid='rowid',
    tokenize='porter unicode61'
  )`,
  `CREATE TRIGGER IF NOT EXISTS agents_fts_insert AFTER INSERT ON agents BEGIN
    INSERT INTO agents_fts(rowid, name, description, search_text)
    VALUES (new.rowid, new.name, new.description, new.search_text);
  END`,
  `CREATE TRIGGER IF NOT EXISTS agents_fts_delete AFTER DELETE ON agents BEGIN
    INSERT INTO agents_fts(agents_fts, rowid, name, description, search_text)
    VALUES ('delete', old.rowid, old.name, old.description, old.search_text);
  END`,
  `CREATE TRIGGER IF NOT EXISTS agents_fts_update AFTER UPDATE ON agents BEGIN
    INSERT INTO agents_fts(agents_fts, rowid, name, description, search_text)
    VALUES ('delete', old.rowid, old.name, old.description, old.search_text);
    INSERT INTO agents_fts(rowid, name, description, search_text)
    VALUES (new.rowid, new.name, new.description, new.search_text);
  END`,
] as const;
