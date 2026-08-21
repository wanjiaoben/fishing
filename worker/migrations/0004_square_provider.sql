ALTER TABLE paypal_authorizations ADD COLUMN provider TEXT NOT NULL DEFAULT 'paypal';
ALTER TABLE paypal_authorizations ADD COLUMN square_payment_id TEXT;
ALTER TABLE paypal_authorizations ADD COLUMN short_code TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_paypal_authorizations_short_code ON paypal_authorizations(short_code);
CREATE INDEX IF NOT EXISTS idx_paypal_authorizations_provider ON paypal_authorizations(provider);
