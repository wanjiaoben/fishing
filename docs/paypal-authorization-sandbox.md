# FISH-0820-02 PayPal Authorization Sandbox Runbook

This implementation is for PayPal Authorization, not PayPal Invoice and not immediate capture.

## Scope

- Product: Private Fishing Charter
- Activity date: 2026-08-24
- Authorization amount: JPY 66,000
- PayPal order intent: `AUTHORIZE`
- Customer status after approval: `AUTHORIZED – NOT CHARGED`
- Capture is admin-only and only for No Show, customer cancellation, or an agreed cancellation-fee case.
- Release is admin-only and voids the PayPal authorization.

## Cloudflare resources

Worker:

- `fishing-paypal-auth-sandbox`
- Sandbox URL: `https://fishing-paypal-auth-sandbox.gerheidicn.workers.dev`

D1 database:

- `fishing-paypal-auth-sandbox`

D1 tables:

- `paypal_authorizations`
- `paypal_authorization_events`
- `payment_policy_agreements`
- `payment_audit_log`
- `paypal_webhook_events`

## Secrets and vars

Committed vars in `wrangler.toml`:

- `PAYPAL_ENV=sandbox`
- `PAYPAL_AUTH_POLICY_VERSION=fishing-paypal-auth-v2026-08-20`
- `PAYPAL_AUTH_PRODUCT=Private Fishing Charter`
- `PAYPAL_AUTH_ACTIVITY_DATE=2026-08-24`
- `PAYPAL_AUTH_AMOUNT=66000`
- `PAYPAL_AUTH_CURRENCY=JPY`
- `PAYPAL_AUTH_VALIDITY_REMINDER_DAYS=3`

Secrets to inject with `wrangler secret put`:

- `PAYPAL_SANDBOX_CLIENT_ID`
- `PAYPAL_SANDBOX_CLIENT_SECRET`
- `PAYPAL_WEBHOOK_ID`
- `ADMIN_TOKEN`

Production credentials, if production is authorized later, must be separate:

- `PAYPAL_PRODUCTION_CLIENT_ID`
- `PAYPAL_PRODUCTION_CLIENT_SECRET`

No PayPal secret may be committed, logged, or exposed to the browser.

## URLs

Customer page:

- `/payment/authorize`

Admin page:

- `/admin/paypal-authorizations`

API:

- `POST /api/paypal/create-order`
- `POST /api/paypal/authorize-order`
- `GET /api/admin/authorizations`
- `POST /api/admin/authorizations/{id}/void`
- `POST /api/admin/authorizations/{id}/capture`
- `POST /api/paypal/webhook`

## PayPal Dashboard webhook

Webhook URL:

- `https://fishing-paypal-auth-sandbox.gerheidicn.workers.dev/api/paypal/webhook`

Subscribe to:

- `CHECKOUT.ORDER.APPROVED`
- `PAYMENT.AUTHORIZATION.CREATED`
- `PAYMENT.AUTHORIZATION.VOIDED`
- `PAYMENT.CAPTURE.COMPLETED`
- `PAYMENT.CAPTURE.DENIED`
- `PAYMENT.CAPTURE.REFUNDED`

After creating the webhook, copy the webhook ID into `PAYPAL_WEBHOOK_ID` with `wrangler secret put`.

## Authorization timing

PayPal authorizations are generally valid for 29 days. The first 3 days are the honor period, where funds availability is strongest. After the 3-day honor period, capture may still be possible until expiration, but PayPal availability is less guaranteed.

System handling:

- Stores PayPal `expiration_time` if returned.
- Falls back to `authorization_create_time + 29 days` if PayPal does not return expiration.
- Stores `honor_period_ends_at = authorization_create_time + 3 days`.
- Admin list returns:
  - `days_until_expiration`
  - `in_honor_period`
  - `AUTHORIZATION_EXPIRING_SOON` reminder when the stored expiration is within 3 days.

## Sandbox validation checklist

1. JPY 66,000 authorization succeeds.
2. Customer approval does not capture funds.
3. Admin list shows `AUTHORIZED – NOT CHARGED`.
4. Release Authorization voids successfully and status becomes `VOIDED / RELEASED`.
5. Capture full JPY 66,000 succeeds.
6. Capture partial amount succeeds.
7. Duplicate clicks do not duplicate charge because admin operations require idempotency keys and reuse PayPal `PayPal-Request-Id`.
8. Authorization failure returns a clear error JSON and does not show Paid.
9. Duplicate PayPal webhook event IDs are ignored.
10. Existing PayPal Invoice behavior is unaffected. Current fishing repo has no PayPal Invoice code; this Worker is isolated from bjt/pro.
