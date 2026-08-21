-- Existing authorizations predate brand routing; they remain fishing orders.
ALTER TABLE paypal_authorizations ADD COLUMN brand TEXT NOT NULL DEFAULT 'fishing';
