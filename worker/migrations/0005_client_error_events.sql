CREATE TABLE IF NOT EXISTS client_error_events (
  id TEXT PRIMARY KEY,
  order_id TEXT,
  short_code TEXT,
  ts TEXT NOT NULL,
  stage TEXT NOT NULL,
  error TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_client_error_events_order_ts
  ON client_error_events(order_id, ts);

CREATE INDEX IF NOT EXISTS idx_client_error_events_created_at
  ON client_error_events(created_at);
