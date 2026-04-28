import { Pool } from "pg";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

export async function migrate() {
  await pool.query(`
CREATE TABLE IF NOT EXISTS repositories (
  id UUID PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'github',
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  clone_url_ssh TEXT NOT NULL,
  webhook_secret TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider, owner, name)
);
CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY,
  repository_id UUID REFERENCES repositories(id),
  delivery_id TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  signature_valid BOOLEAN NOT NULL,
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  status TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS commits (
  id UUID PRIMARY KEY,
  webhook_event_id UUID REFERENCES webhook_events(id),
  repository_id UUID REFERENCES repositories(id),
  commit_sha TEXT NOT NULL,
  branch TEXT NOT NULL,
  author_name TEXT,
  author_email TEXT,
  message TEXT,
  timestamp TIMESTAMPTZ,
  UNIQUE(repository_id, commit_sha)
);
CREATE TABLE IF NOT EXISTS scan_jobs (
  id UUID PRIMARY KEY,
  commit_id UUID REFERENCES commits(id),
  job_key TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  worker_id TEXT,
  error_message TEXT
);
CREATE TABLE IF NOT EXISTS scan_results (
  id UUID PRIMARY KEY,
  scan_job_id UUID UNIQUE REFERENCES scan_jobs(id),
  summary JSONB NOT NULL,
  findings JSONB NOT NULL,
  scanner_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY,
  scan_job_id UUID REFERENCES scan_jobs(id),
  target_url TEXT NOT NULL,
  status TEXT NOT NULL,
  attempt_count INT NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  response_status INT,
  response_body TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`);
}
