CREATE TABLE IF NOT EXISTS paypal_authorizations (
  id TEXT PRIMARY KEY,
  paypal_order_id TEXT UNIQUE,
  paypal_authorization_id TEXT UNIQUE,
  activity TEXT NOT NULL,
  activity_date TEXT NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL,
  authorization_status TEXT NOT NULL,
  paypal_status TEXT,
  paypal_create_response TEXT,
  paypal_authorize_response TEXT,
  authorization_create_time TEXT,
  authorization_expiration_time TEXT,
  honor_period_ends_at TEXT,
  policy_version TEXT NOT NULL,
  agreed_at TEXT,
  payer_email TEXT,
  payer_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS paypal_authorization_events (
  id TEXT PRIMARY KEY,
  authorization_id TEXT,
  paypal_order_id TEXT,
  paypal_authorization_id TEXT,
  event_type TEXT NOT NULL,
  event_status TEXT,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payment_policy_agreements (
  id TEXT PRIMARY KEY,
  authorization_id TEXT,
  paypal_order_id TEXT,
  activity TEXT NOT NULL,
  activity_date TEXT NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  agreed_at TEXT NOT NULL,
  client_ip_hash TEXT,
  user_agent TEXT
);

CREATE TABLE IF NOT EXISTS payment_audit_log (
  id TEXT PRIMARY KEY,
  authorization_id TEXT,
  paypal_authorization_id TEXT,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  amount INTEGER,
  currency TEXT,
  idempotency_key TEXT,
  request_payload TEXT,
  response_payload TEXT,
  result_status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS paypal_webhook_events (
  paypal_event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  transmission_id TEXT,
  verification_status TEXT NOT NULL,
  processed_status TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  processed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_paypal_authorizations_status ON paypal_authorizations(authorization_status);
CREATE INDEX IF NOT EXISTS idx_paypal_authorizations_expiration ON paypal_authorizations(authorization_expiration_time);
CREATE INDEX IF NOT EXISTS idx_payment_audit_authorization ON payment_audit_log(authorization_id);
CREATE INDEX IF NOT EXISTS idx_paypal_events_authorization ON paypal_authorization_events(paypal_authorization_id);
