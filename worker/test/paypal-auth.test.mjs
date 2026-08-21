import test from "node:test";
import assert from "node:assert/strict";
import { handleRequest, customerPage } from "../src/index.js";

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
    ...(overrides.env || {})
  };
}

test("customer page states authorization is not an immediate charge", async () => {
  const response = customerPage(env());
  const text = await response.text();
  assert.match(text, /Your card will be authorized for JPY 66,000, but you will not be charged at this time\./);
  assert.match(text, /I understand and agree to the authorization and cancellation policy\./);
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
