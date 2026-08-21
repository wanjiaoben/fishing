ALTER TABLE paypal_authorizations ADD COLUMN short_code TEXT;
ALTER TABLE paypal_authorizations ADD COLUMN headcount INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS idx_paypal_authorizations_short_code ON paypal_authorizations(short_code);
