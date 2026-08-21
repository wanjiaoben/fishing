import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { handleRequest, customerPage, adminPage } from "../src/index.js";
import { AUTHORIZE_PAGE_SCRIPT } from "../src/authorize-page.js";
import { WORKER_ADMIN_PATHS, WORKER_PUBLIC_PATHS, WORKER_ROUTE_DOMAINS } from "../src/routes.js";

function fakeDb(rows = {}) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      const entry = { sql, values: [] };
      calls.push(entry);
      return {
        bind(...values) {
          entry.values = values;
          return this;
        },
        async run() {
          entry.run = true;
          return { success: true };
        },
        async first() {
          if (sql.includes("WHERE paypal_order_id")) return rows.byOrder || null;
          if (sql.includes("WHERE short_code")) return rows.byShortCode || null;
          if (sql.includes("WHERE id = ? OR paypal_authorization_id")) return rows.byId || null;
          if (sql.includes("payment_audit_log")) return rows.audit || null;
          if (sql.includes("paypal_webhook_events")) return rows.webhook || null;
          return null;
        },
        async all() {
          return { results: rows.all || [] };
        }
      };
    }
  };
}

function env(overrides = {}) {
  return {
    DB: fakeDb(overrides.rows),
    PAYPAL_ENV: "sandbox",
    PAYPAL_SANDBOX_CLIENT_ID: "sandbox-client-id",
    PAYPAL_SANDBOX_CLIENT_SECRET: "sandbox-client-secret",
    PAYPAL_WEBHOOK_ID: "sandbox-webhook-id",
    ADMIN_TOKEN: "admin-token",
    PAYPAL_AUTH_POLICY_VERSION: "fishing-paypal-auth-v2026-08-20",
    PAYPAL_AUTH_PRODUCT: "Private Fishing Charter",
    PAYPAL_AUTH_ACTIVITY_DATE: "2026-08-24",
    PAYPAL_AUTH_AMOUNT: "66000",
    PAYPAL_AUTH_CURRENCY: "JPY",
    SQUARE_ENV: "sandbox",
    SQUARE_SANDBOX_APPLICATION_ID: "sandbox-sq0idb-test",
    SQUARE_SANDBOX_ACCESS_TOKEN: "sandbox-square-token",
    SQUARE_SANDBOX_LOCATION_ID: "L10P89476GMB8",
    ...(overrides.env || {})
  };
}

test("production keeps both customer short-link routes", () => {
  const toml = fs.readFileSync(new URL("../../wrangler.production.toml", import.meta.url), "utf8");
  for (const domain of WORKER_ROUTE_DOMAINS) {
    for (const path of WORKER_PUBLIC_PATHS) {
      assert.match(toml, new RegExp(`pattern = "${domain.replaceAll('.', '\\.')}${path.replaceAll('*', '\\*').replaceAll('/', '\\/')}"`), `${domain}${path} missing`);
    }
  }
  for (const path of WORKER_ADMIN_PATHS) {
    assert.match(toml, new RegExp(`pattern = "fishing\\.nice\\.okinawa${path.replaceAll('*', '\\*').replaceAll('/', '\\/')}"`), `fishing${path} missing`);
  }
});

test("diagnostic route exposes route table without secrets", async () => {
  const response = await handleRequest(new Request("https://activity.nice.okinawa/__diag"), env({ env: { SQUARE_SANDBOX_APPLICATION_ID: "sandbox-app" } }));
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(data.routes.public, WORKER_PUBLIC_PATHS);
  assert.deepEqual(data.routes.admin, WORKER_ADMIN_PATHS);
  assert.deepEqual(data.routes.domains, WORKER_ROUTE_DOMAINS);
  assert.equal(data.application_id, "sandbox-app");
  assert.doesNotMatch(JSON.stringify(data), /ACCESS_TOKEN|SECRET|ADMIN_TOKEN/);
});

test("customer page states authorization is not an immediate charge", async () => {
  const response = customerPage(env());
  const text = await response.text();
  assert.match(text, /Your card will be authorized for JPY 66,000, but you will not be charged at this time\./);
  assert.match(text, /I understand and agree to the authorization and cancellation policy\./);
  assert.match(text, /translate="no"/);
  assert.match(text, /name="google" content="notranslate"/);
  assert.match(text, /enable-funding=card/);
  assert.match(text, /Card form didn't load — use the PayPal button or open in Safari/);
  assert.doesNotMatch(text, /Paid/i);
});

test("create-order uses PayPal Orders v2 AUTHORIZE and fixed server-side JPY 66000", async (t) => {
  const captured = [];
  t.mock.method(globalThis, "fetch", async (url, init = {}) => {
    captured.push({ url: String(url), init });
    if (String(url).endsWith("/v1/oauth2/token")) {
      return Response.json({ access_token: "token" });
    }
    if (String(url).endsWith("/v2/checkout/orders")) {
      return Response.json({ id: "ORDER-1", status: "CREATED" });
    }
    throw new Error(`unexpected fetch ${url}`);
  });

  const e = env();
  const response = await handleRequest(new Request("https://worker.test/api/paypal/create-order", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      accepted_policy: true,
      policy_version: "fishing-paypal-auth-v2026-08-20",
      amount: "1",
      currency: "USD",
      idempotency_key: "order-test"
    })
  }), e);
  const data = await response.json();
  assert.equal(data.ok, true);
  const orderCall = captured.find(c => c.url.endsWith("/v2/checkout/orders"));
  const payload = JSON.parse(orderCall.init.body);
  assert.equal(payload.intent, "AUTHORIZE");
  assert.equal(payload.purchase_units[0].amount.currency_code, "JPY");
  assert.equal(payload.purchase_units[0].amount.value, "66000");
  assert.equal(orderCall.init.headers["PayPal-Request-Id"], "order-test");
});

test("authorize-order returns AUTHORIZED – NOT CHARGED and stores expiration fallback", async (t) => {
  t.mock.method(globalThis, "fetch", async (url) => {
    if (String(url).endsWith("/v1/oauth2/token")) return Response.json({ access_token: "token" });
    if (String(url).includes("/v2/checkout/orders/ORDER-1/authorize")) {
      return Response.json({
        status: "COMPLETED",
        payer: { email_address: "sandbox-buyer@example.com", payer_id: "PAYER1" },
        purchase_units: [{ payments: { authorizations: [{ id: "AUTH-1", status: "CREATED", create_time: "2026-08-20T00:00:00Z" }] } }]
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  });

  const e = env({ rows: { byOrder: { id: "auth_local", paypal_order_id: "ORDER-1", amount: 66000, currency: "JPY", authorization_status: "ORDER_CREATED" } } });
  const response = await handleRequest(new Request("https://worker.test/api/paypal/authorize-order", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ order_id: "ORDER-1" })
  }), e);
  const data = await response.json();
  assert.equal(data.ok, true);
  assert.equal(data.status, "AUTHORIZED");
  assert.equal(data.charged, false);
  assert.equal(data.message, "AUTHORIZED – NOT CHARGED");
  assert.equal(data.authorization_expiration_time, "2026-09-18T00:00:00.000Z");
  assert.equal(data.honor_period_ends_at, "2026-08-23T00:00:00.000Z");
});

test("sandbox test-card authorize endpoint is admin-only and sends payment_source card", async (t) => {
  const captured = [];
  t.mock.method(globalThis, "fetch", async (url, init = {}) => {
    captured.push({ url: String(url), init });
    if (String(url).endsWith("/v1/oauth2/token")) return Response.json({ access_token: "token" });
    if (String(url).includes("/v2/checkout/orders/ORDER-1/authorize")) {
      return Response.json({
        status: "COMPLETED",
        purchase_units: [{ payments: { authorizations: [{ id: "AUTH-1", status: "CREATED", create_time: "2026-08-20T00:00:00Z" }] } }]
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  });

  const e = env({ rows: { byOrder: { id: "auth_local", paypal_order_id: "ORDER-1", amount: 66000, currency: "JPY", authorization_status: "ORDER_CREATED" } } });
  const noAdmin = await handleRequest(new Request("https://worker.test/api/paypal/sandbox/authorize-test-card", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ order_id: "ORDER-1", idempotency_key: "sandbox-card-test" })
  }), e);
  assert.equal(noAdmin.status, 401);

  const response = await handleRequest(new Request("https://worker.test/api/paypal/sandbox/authorize-test-card", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer admin-token" },
    body: JSON.stringify({ order_id: "ORDER-1", idempotency_key: "sandbox-card-test" })
  }), e);
  const data = await response.json();
  assert.equal(data.ok, true);
  assert.equal(data.status, "AUTHORIZED");
  assert.equal(data.charged, false);
  const authorizeCall = captured.find(c => c.url.includes("/v2/checkout/orders/ORDER-1/authorize"));
  const payload = JSON.parse(authorizeCall.init.body);
  assert.equal(payload.payment_source.card.number, "1111111111111111");
  assert.equal(authorizeCall.init.headers["PayPal-Request-Id"], "sandbox-card-test");
});

test("sandbox test-card authorize endpoint is unavailable outside sandbox", async () => {
  const e = env({ env: { PAYPAL_ENV: "production" } });
  const response = await handleRequest(new Request("https://worker.test/api/paypal/sandbox/authorize-test-card", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer admin-token" },
    body: JSON.stringify({ order_id: "ORDER-1" })
  }), e);
  assert.equal(response.status, 404);
});

test("capture requires admin token, amount and exact second-confirmation text", async () => {
  const e = env({ rows: { byId: { id: "auth_local", paypal_authorization_id: "AUTH-1", amount: 66000, currency: "JPY", authorization_status: "AUTHORIZED" } } });
  const noAdmin = await handleRequest(new Request("https://worker.test/api/admin/authorizations/auth_local/capture", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ amount: 1000, confirm: true })
  }), e);
  assert.equal(noAdmin.status, 401);

  const badConfirm = await handleRequest(new Request("https://worker.test/api/admin/authorizations/auth_local/capture", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer admin-token" },
    body: JSON.stringify({ amount: 1000, confirm: true, confirmation_text: "charge it", idempotency_key: "cap1" })
  }), e);
  assert.equal(badConfirm.status, 400);
  assert.equal((await badConfirm.json()).error, "SECOND_CONFIRMATION_REQUIRED");
});

test("capture is refused once the authorization is no longer AUTHORIZED", async () => {
  const e = env({ rows: { byId: { id: "auth_local", paypal_authorization_id: "AUTH-1", amount: 66000, currency: "JPY", authorization_status: "CAPTURED" } } });
  const response = await handleRequest(new Request("https://worker.test/api/admin/authorizations/auth_local/capture", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer admin-token" },
    body: JSON.stringify({
      amount: 66000,
      confirm: true,
      confirmation_text: "You are about to charge JPY 66,000 from this authorization.",
      idempotency_key: "cap-again"
    })
  }), e);
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, "AUTHORIZATION_NOT_CAPTURABLE");
});

test("admin list displays AUTHORIZED – NOT CHARGED and reminder fields", async () => {
  const e = env({ rows: { all: [{
    id: "auth_local",
    activity: "Private Fishing Charter",
    activity_date: "2026-08-24",
    amount: 66000,
    currency: "JPY",
    authorization_status: "AUTHORIZED",
    authorization_expiration_time: "2026-08-21T00:00:00Z",
    honor_period_ends_at: "2099-01-01T00:00:00Z"
  }] } });
  const response = await handleRequest(new Request("https://worker.test/api/admin/authorizations", {
    headers: { authorization: "Bearer admin-token" }
  }), e);
  const data = await response.json();
  assert.equal(data.ok, true);
  assert.equal(data.authorizations[0].status_label, "AUTHORIZED – NOT CHARGED");
  assert.equal(data.authorizations[0].reminder, "AUTHORIZATION_EXPIRING_SOON");
  assert.equal(data.authorizations[0].in_honor_period, true);
});

test("admin custom order endpoint is admin-only and fixes currency to JPY", async (t) => {
  const captured = [];
  t.mock.method(globalThis, "fetch", async (url, init = {}) => {
    captured.push({ url: String(url), init });
    if (String(url).endsWith("/v1/oauth2/token")) return Response.json({ access_token: "token" });
    if (String(url).endsWith("/v2/checkout/orders")) return Response.json({ id: "ORDER-CUSTOM", status: "CREATED" });
    throw new Error(`unexpected fetch ${url}`);
  });
  const e = env({ env: { PAYPAL_AUTH_WORKER_ORIGIN: "https://activity.nice.okinawa" } });
  const response = await handleRequest(new Request("https://worker.test/api/admin/orders", {
    method: "POST", headers: { "content-type": "application/json", authorization: "Bearer admin-token" },
    body: JSON.stringify({ activity: "Test Charter", activity_date: "2026-08-24", amount: 100, currency: "USD" })
  }), e);
  const data = await response.json();
  assert.equal(data.ok, false);
  assert.equal(data.error, "INVALID_ORDER_FIELDS");
  const good = await handleRequest(new Request("https://worker.test/api/admin/orders", {
    method: "POST", headers: { "content-type": "application/json", authorization: "Bearer admin-token" },
    body: JSON.stringify({ activity: "Test Charter", activity_date: "2026-08-24", amount: 100, currency: "JPY" })
  }), e);
  const goodData = await good.json();
  assert.equal(goodData.ok, true);
  assert.match(goodData.authorize_url, /activity\.nice\.okinawa\/payment\/authorize\?order=ORDER-CUSTOM/);
  assert.equal(goodData.brand, "fishing");
  const payload = JSON.parse(captured.find(c => c.url.endsWith("/v2/checkout/orders")).init.body);
  assert.equal(payload.purchase_units[0].amount.currency_code, "JPY");
  assert.equal(payload.purchase_units[0].amount.value, "100");
});

test("admin custom order accepts snorkel brand and customer page renders brand return link", async (t) => {
  t.mock.method(globalThis, "fetch", async (url) => {
    if (String(url).endsWith("/v1/oauth2/token")) return Response.json({ access_token: "token" });
    if (String(url).endsWith("/v2/checkout/orders")) return Response.json({ id: "ORDER-SNORKEL", status: "CREATED" });
    throw new Error(`unexpected fetch ${url}`);
  });
  const e = env({ env: { PAYPAL_AUTH_WORKER_ORIGIN: "https://activity.nice.okinawa" } });
  const response = await handleRequest(new Request("https://fishing.test/api/admin/orders", {
    method: "POST", headers: { "content-type": "application/json", authorization: "Bearer admin-token" },
    body: JSON.stringify({ brand: "snorkel", activity: "Snorkel Test", activity_date: "2026-08-24", amount: 100, currency: "JPY" })
  }), e);
  const data = await response.json();
  assert.equal(data.ok, true);
  assert.equal(data.brand, "snorkel");
  assert.match(data.authorize_url, /activity\.nice\.okinawa\/payment\/authorize\?order=ORDER-SNORKEL/);

  const page = await handleRequest(new Request("https://activity.nice.okinawa/payment/authorize?order=ORDER-SNORKEL"), env({ rows: { byOrder: {
    paypal_order_id: "ORDER-SNORKEL", brand: "snorkel", activity: "Snorkel Test", activity_date: "2026-08-24", amount: 100, currency: "JPY", policy_version: "fishing-paypal-auth-v2026-08-20"
  } } }));
  const text = await page.text();
  assert.match(text, /Snorkel Nice Okinawa/);
  assert.match(text, /https:\/\/snorkel\.nice\.okinawa\//);
  assert.match(text, /I understand and agree to the authorization and cancellation policy/);

  const legacy = await handleRequest(new Request("https://fishing.nice.okinawa/payment/authorize?order=ORDER-SNORKEL"), env({ rows: { byOrder: {
    paypal_order_id: "ORDER-SNORKEL", brand: "snorkel", activity: "Snorkel Test", activity_date: "2026-08-24", amount: 100, currency: "JPY", policy_version: "fishing-paypal-auth-v2026-08-20"
  } } }));
  assert.equal(legacy.status, 200);
  assert.match(await legacy.text(), /Snorkel Nice Okinawa/);
});

test("ORDER_CREATED can be cancelled without calling PayPal, AUTHORIZED cannot", async () => {
  const createdEnv = env({ rows: { byId: { id: "auth-created", paypal_order_id: "ORDER-C", authorization_status: "ORDER_CREATED" } } });
  const response = await handleRequest(new Request("https://worker.test/api/admin/authorizations/auth-created/cancel", {
    method: "POST", headers: { "content-type": "application/json", authorization: "Bearer admin-token" },
    body: JSON.stringify({ confirm: true, idempotency_key: "cancel-created" })
  }), createdEnv);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "CANCELLED");
  const authEnv = env({ rows: { byId: { id: "auth-authorized", paypal_order_id: "ORDER-A", authorization_status: "AUTHORIZED", paypal_authorization_id: "AUTH-A" } } });
  const blocked = await handleRequest(new Request("https://worker.test/api/admin/authorizations/auth-authorized/cancel", {
    method: "POST", headers: { "content-type": "application/json", authorization: "Bearer admin-token" },
    body: JSON.stringify({ confirm: true, idempotency_key: "cancel-authorized" })
  }), authEnv);
  assert.equal(blocked.status, 409);
  assert.equal((await blocked.json()).error, "AUTHORIZATION_NOT_CANCELLABLE");
});

test("admin can edit trip date only for active authorizations and writes audit", async () => {
  const e = env({ rows: { byId: { id: "auth-date", paypal_order_id: "ORDER-DATE", activity_date: "2026-08-23", amount: 66000, currency: "JPY", authorization_status: "AUTHORIZED" } } });
  const response = await handleRequest(new Request("https://worker.test/api/admin/authorizations/auth-date/date", {
    method: "POST", headers: { "content-type": "application/json", authorization: "Bearer admin-token", "x-admin-user": "Wan" },
    body: JSON.stringify({ confirm: true, activity_date: "2026-08-24", idempotency_key: "date-auth-date" })
  }), e);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).activity_date, "2026-08-24");
  assert.ok(e.DB.calls.some(call => call.sql.includes("payment_audit_log")));
  const terminal = env({ rows: { byId: { id: "auth-terminal", activity_date: "2026-08-23", authorization_status: "CANCELLED" } } });
  const blocked = await handleRequest(new Request("https://worker.test/api/admin/authorizations/auth-terminal/date", {
    method: "POST", headers: { authorization: "Bearer admin-token", "content-type": "application/json" },
    body: JSON.stringify({ confirm: true, activity_date: "2026-08-24", idempotency_key: "date-auth-terminal" })
  }), terminal);
  assert.equal(blocked.status, 409);
});

test("admin order list exposes guest fields, created time and activity-domain link", async () => {
  const e = env({ rows: { all: [{ id: "auth-1", paypal_order_id: "ORDER-1", brand: "fishing", activity: "Charter", activity_date: "2026-08-24", amount: 66000, currency: "JPY", guest_name: "Guest", guest_email: "guest@example.com", authorization_status: "ORDER_CREATED", created_at: "2026-08-21T00:00:00Z" }] } });
  const response = await handleRequest(new Request("https://worker.test/api/admin/authorizations", { headers: { authorization: "Bearer admin-token" } }), e);
  const data = await response.json();
  assert.equal(data.authorizations[0].guest_name, "Guest");
  assert.match(data.authorizations[0].authorize_url, /activity\.nice\.okinawa\/payment\/authorize/);
  const page = await adminPage().text();
  assert.match(page, /Guest name/);
  assert.match(page, /Copy link/);
  assert.match(page, /AUTHORIZED/);
  assert.match(page, /Released \/ Captured \/ Cancelled/);
});

test("authorization notification is audited and does not block payment when Resend secret is absent", async (t) => {
  t.mock.method(globalThis, "fetch", async (url) => {
    if (String(url).endsWith("/v1/oauth2/token")) return Response.json({ access_token: "token" });
    if (String(url).includes("/v2/checkout/orders/ORDER-N/authorize")) return Response.json({ status: "COMPLETED", purchase_units: [{ payments: { authorizations: [{ id: "AUTH-N", status: "CREATED", create_time: "2026-08-20T00:00:00Z" }] } }] });
    throw new Error(`unexpected fetch ${url}`);
  });
  const e = env({ rows: { byOrder: { id: "auth-notify", paypal_order_id: "ORDER-N", activity: "Charter", activity_date: "2026-08-24", amount: 66000, currency: "JPY", authorization_status: "ORDER_CREATED", brand: "fishing" } } });
  const response = await handleRequest(new Request("https://worker.test/api/paypal/authorize-order", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ order_id: "ORDER-N" }) }), e);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "AUTHORIZED");
  assert.ok(e.DB.calls.some(call => call.sql.includes("payment_audit_log") && call.values.includes("NOTIFY_AUTHORIZED")));
});

test("Square create-payment uses delayed full authorization and short-code idempotency", async (t) => {
  const captured = [];
  t.mock.method(globalThis, "fetch", async (url, init = {}) => {
    captured.push({ url: String(url), init });
    if (String(url).includes("connect.squareupsandbox.com/v2/payments")) {
      return Response.json({ payment: { id: "SQ-PAY-1", status: "APPROVED", created_at: "2026-08-21T00:00:00Z", delayed_until: "2026-08-24T00:00:00Z" } });
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  const e = env({ rows: { byOrder: { id: "auth-square", paypal_order_id: "ORDER-SQ", short_code: "ABC123", activity: "Private Fishing Charter", activity_date: "2026-08-24", amount: 66000, currency: "JPY", authorization_status: "ORDER_CREATED", policy_version: "fishing-paypal-auth-v2026-08-20", brand: "fishing" } } });
  const response = await handleRequest(new Request("https://worker.test/api/square/create-payment", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ order_id: "ORDER-SQ", source_id: "cnon:test", accepted_policy: true, policy_version: "fishing-paypal-auth-v2026-08-20" })
  }), e);
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.status, "AUTHORIZED");
  assert.equal(data.charged, false);
  const call = captured[0];
  const payload = JSON.parse(call.init.body);
  assert.equal(payload.autocomplete, false);
  assert.equal(payload.delay_duration, "P7D");
  assert.equal(payload.amount_money.amount, 66000);
  assert.equal(payload.idempotency_key, "ABC123");
  assert.equal(call.init.headers["idempotency-key"], "ABC123");
});

test("Square customer section is independent of PayPal rendering and admin marks full capture only", async () => {
  const page = await handleRequest(new Request("https://activity.nice.okinawa/payment/authorize?order=ORDER-SQ"), env({ rows: { byOrder: {
    paypal_order_id: "ORDER-SQ", short_code: "ABC123", brand: "fishing", activity: "Charter", activity_date: "2026-08-24", amount: 100, currency: "JPY", policy_version: "fishing-paypal-auth-v2026-08-20"
  } }, env: { SQUARE_SANDBOX_APPLICATION_ID: "sandbox-sq0idb-FqL-OnkbPoO8bQVmQpB1bA", SQUARE_SANDBOX_LOCATION_ID: "L10P89476GMB8" } }));
  const text = await page.text();
  assert.match(text, /Pay by card \(Square\)/);
  assert.match(text, /sandbox\.web\.squarecdn\.com/);
  assert.match(text, /sandbox-sq0idb-FqL-OnkbPoO8bQVmQpB1bA/);
  assert.match(text, /L10P89476GMB8/);
  assert.match(text, /ABC123/);
  assert.match(AUTHORIZE_PAGE_SCRIPT, /Loading secure card form… this can take up to 20 seconds/);
  assert.match(AUTHORIZE_PAGE_SCRIPT, /Card form didn't load — use the PayPal button or open in Safari/);
  assert.match(AUTHORIZE_PAGE_SCRIPT, /}, 25000\)/);
  assert.match(AUTHORIZE_PAGE_SCRIPT, /clearTimeout\(squareTimeout\);[\s\S]*squareStatus\.textContent = 'Card details are handled securely by Square\.';[\s\S]*squareButton\.disabled = false;/);
  assert.match(AUTHORIZE_PAGE_SCRIPT, /__client-error/);
  for (const field of ["stage", "square_loaded", "appId", "locId", "ua", "shortCode"]) assert.match(AUTHORIZE_PAGE_SCRIPT, new RegExp(field));
  assert.match(AUTHORIZE_PAGE_SCRIPT, /sdk-load/);
  assert.match(AUTHORIZE_PAGE_SCRIPT, /payments-init/);
  assert.match(AUTHORIZE_PAGE_SCRIPT, /card-init/);
  assert.match(AUTHORIZE_PAGE_SCRIPT, /card-attach/);
  assert.match(AUTHORIZE_PAGE_SCRIPT, /authorize-submit/);
  assert.match(AUTHORIZE_PAGE_SCRIPT, /HTTP ' \+ response\.status/);
  assert.match(AUTHORIZE_PAGE_SCRIPT, /Square authorization failed\.\\n/);
  assert.match(AUTHORIZE_PAGE_SCRIPT, /debug.*URLSearchParams/);
  assert.match(page.headers.get("content-security-policy-report-only"), /pci-connect\.squareupsandbox\.com/);
  assert.match(page.headers.get("content-security-policy-report-only"), /d1g145x70srn7h\.cloudfront\.net/);
  assert.match(page.headers.get("content-security-policy-report-only"), /cash-f\.squarecdn\.com/);
  assert.doesNotMatch(text, /http-equiv=["']Content-Security-Policy["']/i);
  assert.match(page.headers.get("content-security-policy-report-only"), /script-src 'self' https:\/\/www\.paypal\.com/);
  assert.doesNotMatch(text, /Content-Security-Policy/);
  assert.doesNotMatch(text, /script-src[^;]*unsafe-inline/);
  assert.match(await (await adminPage()).text(), /Square: full capture only/);
});

test("customer page uses report-only CSP and report endpoint is non-blocking", async () => {
  const page = await handleRequest(new Request("https://activity.nice.okinawa/payment/authorize?order=ORDER-CSP"), env({ rows: { byOrder: {
    paypal_order_id: "ORDER-CSP", brand: "fishing", activity: "Charter", activity_date: "2026-08-24", amount: 100, currency: "JPY", policy_version: "fishing-paypal-auth-v2026-08-20"
  } } }));
  assert.match(page.headers.get("content-security-policy-report-only"), /report-uri \/__csp-report/);
  assert.equal(page.headers.get("content-security-policy"), null);
  const report = await handleRequest(new Request("https://activity.nice.okinawa/__csp-report", { method: "POST", body: JSON.stringify({ "csp-report": { "blocked-uri": "https://example.test" } }) }), env());
  assert.equal(report.status, 204);
  const generic = await handleRequest(new Request("https://activity.nice.okinawa/payment/authorize"), env());
  assert.match(generic.headers.get("content-security-policy-report-only"), /report-uri \/__csp-report/);
  assert.equal(generic.headers.get("content-security-policy"), null);
});

test("rendered customer HTML and external authorization script are syntactically valid", async () => {
  const page = await handleRequest(new Request("https://activity.nice.okinawa/payment/authorize?order=ORDER-SYNTAX"), env({ rows: { byOrder: {
    paypal_order_id: "ORDER-SYNTAX", brand: "fishing", activity: "Charter", activity_date: "2026-08-24", amount: 100, currency: "JPY", policy_version: "fishing-paypal-auth-v2026-08-20"
  } } }));
  const text = await page.text();
  const scripts = [...text.matchAll(/<script(?![^>]*\bsrc=)(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
  assert.equal(scripts.length, 0, "customer page must use the external authorization script");
  assert.match(text, /<script src="\/assets\/authorize-page\.js" defer><\/script>/);
  assert.doesNotThrow(() => new Function(AUTHORIZE_PAGE_SCRIPT));
});

test("customer page passes short code into Square client diagnostics", async () => {
  const page = await handleRequest(new Request("https://activity.nice.okinawa/p/ABC123?debug=1"), env({ rows: {
    byOrder: {
      paypal_order_id: "ORDER-SHORT", short_code: "ABC123", brand: "fishing", activity: "Charter", activity_date: "2026-08-24",
      amount: 100, currency: "JPY", policy_version: "fishing-paypal-auth-v2026-08-20"
    },
    byShortCode: {
      paypal_order_id: "ORDER-SHORT", short_code: "ABC123", brand: "fishing", activity: "Charter", activity_date: "2026-08-24",
      amount: 100, currency: "JPY", policy_version: "fishing-paypal-auth-v2026-08-20"
    }
  } }));
  const text = await page.text();
  assert.match(text, /&quot;shortCode&quot;:&quot;ABC123&quot;/);
});

test("terminal customer short-link pages stay HTTP 200", async () => {
  for (const authorization_status of ["AUTHORIZED", "VOIDED / RELEASED", "CAPTURED", "CANCELLED"]) {
    const page = await handleRequest(new Request("https://activity.nice.okinawa/p/ABC123"), env({ rows: {
      byOrder: { paypal_order_id: "ORDER-TERMINAL", short_code: "ABC123", brand: "fishing", activity: "Charter", activity_date: "2026-08-24", amount: 100, currency: "JPY", authorization_status },
      byShortCode: { paypal_order_id: "ORDER-TERMINAL", short_code: "ABC123", brand: "fishing", activity: "Charter", activity_date: "2026-08-24", amount: 100, currency: "JPY", authorization_status }
    } }));
    assert.equal(page.status, 200, authorization_status);
    const text = await page.text();
    if (authorization_status === "VOIDED / RELEASED") assert.match(text, /This hold has been released — nothing was charged/);
    if (authorization_status === "CAPTURED") assert.match(text, /This authorization was captured according to the cancellation policy/);
    if (authorization_status === "CANCELLED") assert.match(text, /This booking authorization was cancelled — nothing was charged/);
  }
});
