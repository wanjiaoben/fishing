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
          if (sql.includes("WHERE id = ? LIMIT 1")) return rows.byAuthorizationId || null;
          if (sql.includes("WHERE id = ? OR paypal_authorization_id")) return rows.byId || null;
          if (sql.includes("payment_audit_log")) return rows.audit || null;
          if (sql.includes("paypal_webhook_events")) return rows.webhook || null;
          return null;
        },
        async all() {
          if (sql.includes("client_error_events")) return { results: rows.clientErrors || [] };
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

function daysFromToday(days) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
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
  assert.match(text, /I agree to the hold and to the booking details sent to me by email \(dates, meeting point, participants and cancellation terms\)\./);
  assert.doesNotMatch(text, /<label[^>]*>(?:(?!<\/label>)[\s\S])*<a\s/i);
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

test("authorize-order returns AUTHORIZED – NOT CHARGED and stores UNKNOWN when provider omits expiration", async (t) => {
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
  assert.equal(data.authorization_expiration_time, "UNKNOWN");
  assert.equal(data.honor_period_ends_at, "2026-08-23T00:00:00.000Z");
});

test("authorize-order stores PayPal provider expiration_time when present", async (t) => {
  t.mock.method(globalThis, "fetch", async (url) => {
    if (String(url).endsWith("/v1/oauth2/token")) return Response.json({ access_token: "token" });
    if (String(url).includes("/v2/checkout/orders/ORDER-EXP/authorize")) {
      return Response.json({
        status: "COMPLETED",
        purchase_units: [{ payments: { authorizations: [{ id: "AUTH-EXP", status: "CREATED", create_time: "2026-08-20T00:00:00Z", expiration_time: "2026-09-18T00:00:00Z" }] } }]
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  const e = env({ rows: { byOrder: { id: "auth_exp", paypal_order_id: "ORDER-EXP", amount: 66000, currency: "JPY", authorization_status: "ORDER_CREATED" } } });
  const response = await handleRequest(new Request("https://worker.test/api/paypal/authorize-order", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ order_id: "ORDER-EXP" })
  }), e);
  const data = await response.json();
  assert.equal(data.authorization_expiration_time, "2026-09-18T00:00:00Z");
  assert.ok(e.DB.calls.some(call => call.sql.includes("authorization_expiration_time") && call.values.includes("2026-09-18T00:00:00Z")));
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
    provider: "square",
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
  assert.equal(data.authorizations[0].payment_method_label, "SQUARE");
  assert.equal(data.authorizations[0].expiry_health, "RED");
  assert.match(data.authorizations[0].expiry_health_message, /活动结束前失效/);
});

test("admin list classifies authorization expiry as green yellow red against activity_end_at", async () => {
  const e = env({ rows: { all: [
    { id: "red", paypal_order_id: "ORDER-R", provider: "paypal", activity: "Red", activity_date: "2026-08-24", activity_end_at: "2026-08-24T09:00:00.000Z", amount: 100, currency: "JPY", authorization_status: "AUTHORIZED", authorization_expiration_time: "2026-08-24T09:00:00.000Z" },
    { id: "yellow", paypal_order_id: "ORDER-Y", provider: "paypal", activity: "Yellow", activity_date: "2026-08-24", activity_end_at: "2026-08-24T09:00:00.000Z", amount: 100, currency: "JPY", authorization_status: "AUTHORIZED", authorization_expiration_time: "2026-08-24T12:00:00.000Z" },
    { id: "green", paypal_order_id: "ORDER-G", provider: "paypal", activity: "Green", activity_date: "2026-08-24", activity_end_at: "2026-08-24T09:00:00.000Z", amount: 100, currency: "JPY", authorization_status: "AUTHORIZED", authorization_expiration_time: "2026-08-24T15:00:00.000Z" },
    { id: "unknown", paypal_order_id: "ORDER-U", provider: "paypal", activity: "Unknown", activity_date: "2026-08-24", activity_end_at: "2026-08-24T09:00:00.000Z", amount: 100, currency: "JPY", authorization_status: "AUTHORIZED", authorization_expiration_time: "UNKNOWN" }
  ] } });
  const response = await handleRequest(new Request("https://worker.test/api/admin/authorizations", {
    headers: { authorization: "Bearer admin-token" }
  }), e);
  const rows = (await response.json()).authorizations;
  assert.equal(rows.find(row => row.id === "red").expiry_health, "RED");
  assert.equal(rows.find(row => row.id === "yellow").expiry_health, "YELLOW");
  assert.equal(rows.find(row => row.id === "green").expiry_health, "GREEN");
  assert.equal(rows.find(row => row.id === "unknown").expiry_health, "UNKNOWN");
});

test("admin renderer omits Honor period for Square rows", async () => {
  const text = await (await adminPage()).text();
  assert.match(text, /row\.provider === 'square' \? ''/);
});

test("admin renderer explains PayPal and Square date windows", async () => {
  const text = await (await adminPage()).text();
  assert.match(text, /PayPal 授权 29 天有效，请在出团前 28 天内发链接；出团 7 天内可加 Square。/);
  assert.match(text, /create\.disabled=days!==null&&days>28/);
  assert.match(text, /收款方式 \/ 授权到期/);
  assert.match(text, /expiry-green/);
  assert.match(text, /Refresh provider expiry/);
  assert.match(text, /PayPal Eligible/);
  assert.match(text, /Square Eligible/);
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
  assert.ok(e.DB.calls.some(call => call.sql.includes("activity_end_at") && call.values.includes("2026-08-24T09:00:00.000Z")), "default activity_end_at is 18:00 JST");
});

test("admin custom order refuses links more than 28 days before trip", async (t) => {
  const captured = [];
  t.mock.method(globalThis, "fetch", async (url, init = {}) => {
    captured.push({ url: String(url), init });
    throw new Error(`unexpected fetch ${url}`);
  });
  const response = await handleRequest(new Request("https://worker.test/api/admin/orders", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer admin-token" },
    body: JSON.stringify({ activity: "Future Charter", activity_date: daysFromToday(29), amount: 100, currency: "JPY" })
  }), env());
  const data = await response.json();
  assert.equal(response.status, 400);
  assert.equal(data.error, "TRIP_DATE_TOO_FAR_FOR_PAYPAL_AUTH_LINK");
  assert.match(data.message, /29 days/);
  assert.equal(captured.length, 0, "PayPal must not be called when the server-side date gate fails");
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
  assert.match(text, /I agree to the hold and to the booking details sent to me by email \(dates, meeting point, participants and cancellation terms\)\./);
  assert.doesNotMatch(text, /<label[^>]*class="agree"[^>]*>(?:(?!<\/label>)[\s\S])*<a\s/i);

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
  const e = env({ rows: { byId: { id: "auth-date", paypal_order_id: "ORDER-DATE", activity_date: "2026-08-23", activity_end_at: "2026-08-23T03:00:00.000Z", amount: 66000, currency: "JPY", authorization_status: "AUTHORIZED" } } });
  const response = await handleRequest(new Request("https://worker.test/api/admin/authorizations/auth-date/date", {
    method: "POST", headers: { "content-type": "application/json", authorization: "Bearer admin-token", "x-admin-user": "Wan" },
    body: JSON.stringify({ confirm: true, activity_date: "2026-08-24", idempotency_key: "date-auth-date" })
  }), e);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).activity_date, "2026-08-24");
  assert.ok(e.DB.calls.some(call => call.sql.includes("activity_end_at") && call.values.includes("2026-08-24T03:00:00.000Z")), "trip date edit keeps 12:00 JST morning end time");
  assert.ok(e.DB.calls.some(call => call.sql.includes("payment_audit_log")));
  const terminal = env({ rows: { byId: { id: "auth-terminal", activity_date: "2026-08-23", authorization_status: "CANCELLED" } } });
  const blocked = await handleRequest(new Request("https://worker.test/api/admin/authorizations/auth-terminal/date", {
    method: "POST", headers: { authorization: "Bearer admin-token", "content-type": "application/json" },
    body: JSON.stringify({ confirm: true, activity_date: "2026-08-24", idempotency_key: "date-auth-terminal" })
  }), terminal);
  assert.equal(blocked.status, 409);
});

test("admin can edit activity end time without changing authorization status", async () => {
  const e = env({ rows: { byId: { id: "auth-end", paypal_order_id: "ORDER-END", activity_date: "2026-08-24", activity_end_at: "2026-08-24T09:00:00.000Z", authorization_status: "AUTHORIZED" } } });
  const response = await handleRequest(new Request("https://worker.test/api/admin/authorizations/auth-end/activity-end", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer admin-token", "x-admin-user": "Wan" },
    body: JSON.stringify({ confirm: true, activity_end_time: "12:00", idempotency_key: "end-auth-end" })
  }), e);
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.activity_end_at, "2026-08-24T03:00:00.000Z");
  const update = e.DB.calls.find(call => call.sql.includes("UPDATE paypal_authorizations SET activity_end_at"));
  assert.ok(update);
  assert.doesNotMatch(update.sql, /authorization_status/);
  assert.ok(e.DB.calls.some(call => call.sql.includes("payment_audit_log") && call.values.includes("EDIT_ACTIVITY_END")));
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

test("customer authorization email failures (500, timeout, invalid key) do not fail authorization and notify info", async (t) => {
  const scenarios = [
    ["500", () => Response.json({ message: "upstream failure" }, { status: 500 })],
    ["timeout", () => { throw new Error("network timeout"); }],
    ["invalid key", () => Response.json({ message: "invalid api key" }, { status: 401 })]
  ];
  let resendFailure;
  const captured = [];
  t.mock.method(globalThis, "fetch", async (url, init = {}) => {
    const target = String(url);
    if (target.includes("connect.squareupsandbox.com/v2/payments")) {
      return Response.json({ payment: { id: "SQ-FAIL-MAIL", status: "APPROVED", created_at: "2026-08-21T00:00:00Z", delayed_until: "2026-08-28T00:00:00Z" } });
    }
    if (target.includes("api.resend.com/emails")) {
      const payload = JSON.parse(init.body);
      captured.push(payload);
      if (payload.to?.[0] === "delivered@resend.dev") return resendFailure();
      return Response.json({ id: "failure-copy-email" });
    }
    throw new Error(`unexpected fetch ${url}`);
  });

  for (const [label, failure] of scenarios) {
    captured.length = 0;
    resendFailure = failure;
    const waits = [];
    const e = env({
      env: { RESEND_API_KEY: "test-resend-key" },
      rows: { byOrder: {
        id: `auth-mail-${label.replaceAll(" ", "-")}`,
        paypal_order_id: `ORDER-MAIL-${label}`,
        short_code: `MAIL${label.length}`,
        guest_email: "delivered@resend.dev",
        activity: "Private Fishing Charter",
        activity_date: "2026-08-24",
        amount: 100,
        currency: "JPY",
        authorization_status: "ORDER_CREATED",
        policy_version: "fishing-paypal-auth-v2026-08-20",
        brand: "fishing"
      } }
    });
    const response = await handleRequest(new Request("https://worker.test/api/square/create-payment", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ order_id: `ORDER-MAIL-${label}`, source_id: "cnon:test", accepted_policy: true, policy_version: "fishing-paypal-auth-v2026-08-20" })
    }), e, { waitUntil(promise) { waits.push(promise); } });
    assert.equal(response.status, 200, `${label}: authorization response must stay successful`);
    assert.equal((await response.json()).status, "AUTHORIZED");
    await Promise.all(waits);
    const customerMail = captured.find(mail => mail.to[0] === "delivered@resend.dev");
    const failureNotice = captured.find(mail => mail.to[0] === "aboutokinawa@gmail.com" && /failed/i.test(`${mail.subject || ""} ${mail.text || ""}`));
    assert.ok(customerMail, `${label}: customer mail attempted`);
    assert.ok(failureNotice, `${label}: info failure notice attempted`);
    const auditValues = e.DB.calls.filter(call => call.sql.includes("payment_audit_log")).flatMap(call => call.values);
    assert.ok(auditValues.includes("CUSTOMER_AUTH_EMAIL"), `${label}: customer email audit action`);
    assert.ok(auditValues.includes("FAILED"), `${label}: failed email audit status`);
  }
});

test("Square create-payment uses delayed full authorization and short-code idempotency", async (t) => {
  const captured = [];
  const waits = [];
  t.mock.method(globalThis, "fetch", async (url, init = {}) => {
    captured.push({ url: String(url), init });
    if (String(url).includes("connect.squareupsandbox.com/v2/payments")) {
      return Response.json({ payment: { id: "SQ-PAY-1", status: "APPROVED", created_at: "2026-08-21T00:00:00Z", delayed_until: "2026-08-24T00:00:00Z", delay_action: "CANCEL" } });
    }
    if (String(url).includes("api.resend.com/emails")) return Response.json({ id: "email-test" });
    throw new Error(`unexpected fetch ${url}`);
  });
  const e = env({ env: { RESEND_API_KEY: "test-resend-key" }, rows: { byOrder: { id: "auth-square", paypal_order_id: "ORDER-SQ", short_code: "ABC123", guest_email: "sandbox@example.test", activity: "Private Fishing Charter", activity_date: "2026-08-24", amount: 66000, currency: "JPY", authorization_status: "ORDER_CREATED", policy_version: "fishing-paypal-auth-v2026-08-20", brand: "fishing" } } });
  const response = await handleRequest(new Request("https://worker.test/api/square/create-payment", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ order_id: "ORDER-SQ", source_id: "cnon:test", accepted_policy: true, policy_version: "fishing-paypal-auth-v2026-08-20" })
  }), e, { waitUntil(promise) { waits.push(promise); } });
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
  assert.ok(e.DB.calls.some(entry => entry.sql.includes("square_delay_action") && entry.values.includes("CANCEL")));
  await Promise.all(waits);
  const customerMail = captured.find(entry => String(entry.url).includes("api.resend.com/emails") && JSON.parse(entry.init.body).to[0] === "sandbox@example.test");
  assert.ok(customerMail);
  assert.match(JSON.parse(customerMail.init.body).text, /Authorized amount: JPY 66,000/);
  assert.match(JSON.parse(customerMail.init.body).text, /This authorization is not the final booking confirmation/);
  assert.ok(e.DB.calls.some(entry => entry.sql.includes("payment_audit_log") && entry.values.includes("CUSTOMER_AUTH_EMAIL")));
});

test("Square create-payment is server-blocked when trip is more than seven days away", async (t) => {
  const captured = [];
  t.mock.method(globalThis, "fetch", async (url, init = {}) => {
    captured.push({ url: String(url), init });
    throw new Error(`unexpected fetch ${url}`);
  });
  const e = env({ rows: { byOrder: {
    id: "auth-square-future",
    paypal_order_id: "ORDER-SQ-FUTURE",
    short_code: "FUTURE",
    activity: "Private Fishing Charter",
    activity_date: daysFromToday(8),
    amount: 66000,
    currency: "JPY",
    authorization_status: "ORDER_CREATED",
    policy_version: "fishing-paypal-auth-v2026-08-20",
    brand: "fishing"
  } } });
  const response = await handleRequest(new Request("https://worker.test/api/square/create-payment", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ order_id: "ORDER-SQ-FUTURE", source_id: "cnon:test", accepted_policy: true, policy_version: "fishing-paypal-auth-v2026-08-20" })
  }), e);
  const data = await response.json();
  assert.equal(response.status, 409);
  assert.equal(data.error, "SQUARE_UNAVAILABLE_FOR_TRIP_DATE");
  assert.equal(captured.length, 0, "Square API must not be called outside the seven-day window");
});

test("admin provider expiry refresh reads provider API and updates metadata only", async (t) => {
  const captured = [];
  t.mock.method(globalThis, "fetch", async (url, init = {}) => {
    captured.push({ url: String(url), init });
    if (String(url).endsWith("/v1/oauth2/token")) return Response.json({ access_token: "token" });
    if (String(url).includes("/v2/payments/authorizations/AUTH-REFRESH")) {
      return Response.json({ id: "AUTH-REFRESH", status: "CREATED", create_time: "2026-08-20T00:00:00Z", expiration_time: "2026-09-18T00:00:00Z" });
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  const e = env({ rows: { byId: { id: "auth-refresh", paypal_order_id: "ORDER-REFRESH", provider: "paypal", paypal_authorization_id: "AUTH-REFRESH", authorization_status: "AUTHORIZED", authorization_expiration_time: "UNKNOWN" } } });
  const response = await handleRequest(new Request("https://worker.test/api/admin/authorizations/auth-refresh/provider-expiry", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer admin-token", "x-admin-user": "Wan" },
    body: JSON.stringify({ confirm: true, idempotency_key: "refresh-auth-refresh" })
  }), e);
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.authorization_expiration_time, "2026-09-18T00:00:00Z");
  assert.ok(captured.some(call => call.url.includes("/v2/payments/authorizations/AUTH-REFRESH")));
  const update = e.DB.calls.find(call => call.sql.includes("UPDATE paypal_authorizations SET authorization_create_time"));
  assert.ok(update);
  assert.doesNotMatch(update.sql, /authorization_status/);
  assert.ok(e.DB.calls.some(call => call.sql.includes("payment_audit_log") && call.values.includes("REFRESH_PROVIDER_EXPIRY")));
});

test("admin Square provider expiry refresh stores delayed_until and delay_action true values", async (t) => {
  const captured = [];
  t.mock.method(globalThis, "fetch", async (url, init = {}) => {
    captured.push({ url: String(url), init });
    if (String(url).includes("connect.squareupsandbox.com/v2/payments/SQ-REFRESH")) {
      return Response.json({ payment: { id: "SQ-REFRESH", status: "APPROVED", created_at: "2026-08-21T00:00:00Z", delayed_until: "2026-08-28T00:00:00Z", delay_action: "CANCEL" } });
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  const e = env({ rows: { byId: { id: "auth-square-refresh", paypal_order_id: "ORDER-SQ-REFRESH", provider: "square", square_payment_id: "SQ-REFRESH", authorization_status: "AUTHORIZED", authorization_expiration_time: "UNKNOWN" } } });
  const response = await handleRequest(new Request("https://worker.test/api/admin/authorizations/auth-square-refresh/provider-expiry", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer admin-token" },
    body: JSON.stringify({ confirm: true, idempotency_key: "refresh-square" })
  }), e);
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.authorization_expiration_time, "2026-08-28T00:00:00Z");
  assert.equal(data.square_delay_action, "CANCEL");
  assert.ok(captured.some(call => call.url.includes("/v2/payments/SQ-REFRESH") && call.init.method === "GET"));
});

test("Square create-payment stores UNKNOWN when provider omits delayed_until and delay_action", async (t) => {
  t.mock.method(globalThis, "fetch", async (url) => {
    if (String(url).includes("connect.squareupsandbox.com/v2/payments")) {
      return Response.json({ payment: { id: "SQ-UNKNOWN", status: "APPROVED", created_at: "2026-08-21T00:00:00Z" } });
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  const e = env({ rows: { byOrder: {
    id: "auth-square-unknown",
    paypal_order_id: "ORDER-SQ-UNKNOWN",
    short_code: "UNKNWN",
    activity: "Private Fishing Charter",
    activity_date: daysFromToday(3),
    amount: 66000,
    currency: "JPY",
    authorization_status: "ORDER_CREATED",
    policy_version: "fishing-paypal-auth-v2026-08-20",
    brand: "fishing"
  } } });
  const response = await handleRequest(new Request("https://worker.test/api/square/create-payment", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ order_id: "ORDER-SQ-UNKNOWN", source_id: "cnon:test", accepted_policy: true, policy_version: "fishing-paypal-auth-v2026-08-20" })
  }), e);
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.authorization_expiration_time, "UNKNOWN");
  assert.ok(e.DB.calls.some(entry => entry.sql.includes("square_delay_action") && entry.values.includes("UNKNOWN")));
});

test("PayPal authorization webhook stores provider expiration_time when present", async (t) => {
  t.mock.method(globalThis, "fetch", async (url) => {
    if (String(url).endsWith("/v1/oauth2/token")) return Response.json({ access_token: "token" });
    if (String(url).endsWith("/v1/notifications/verify-webhook-signature")) return Response.json({ verification_status: "SUCCESS" });
    throw new Error(`unexpected fetch ${url}`);
  });
  const e = env({ rows: { byId: { id: "auth-webhook", paypal_order_id: "ORDER-WH", paypal_authorization_id: "AUTH-WH", provider: "paypal", authorization_status: "ORDER_CREATED" } } });
  const response = await handleRequest(new Request("https://worker.test/api/paypal/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "paypal-transmission-id": "tx-1" },
    body: JSON.stringify({
      id: "WH-1",
      event_type: "PAYMENT.AUTHORIZATION.CREATED",
      resource: {
        id: "AUTH-WH",
        status: "CREATED",
        create_time: "2026-08-20T00:00:00Z",
        expiration_time: "2026-09-18T00:00:00Z",
        supplementary_data: { related_ids: { order_id: "ORDER-WH" } }
      }
    })
  }), e);
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.processed_status, "PROCESSED");
  assert.ok(e.DB.calls.some(call => call.sql.includes("provider = 'paypal'") && call.values.includes("2026-09-18T00:00:00Z")));
});

test("Square customer section is independent of PayPal rendering and admin marks full capture only", async () => {
  const page = await handleRequest(new Request("https://activity.nice.okinawa/payment/authorize?order=ORDER-SQ"), env({ rows: { byOrder: {
    paypal_order_id: "ORDER-SQ", short_code: "ABC123", brand: "fishing", activity: "Charter", activity_date: daysFromToday(5), amount: 100, currency: "JPY", policy_version: "fishing-paypal-auth-v2026-08-20"
  } }, env: { SQUARE_SANDBOX_APPLICATION_ID: "sandbox-sq0idb-FqL-OnkbPoO8bQVmQpB1bA", SQUARE_SANDBOX_LOCATION_ID: "L10P89476GMB8" } }));
  const text = await page.text();
  assert.match(text, /PayPal authorization/);
  assert.match(text, /Pay by card \(Square\)/);
  assert.match(text, /class="payment-options"/);
  assert.match(text, /sandbox\.web\.squarecdn\.com/);
  assert.match(text, /sandbox-sq0idb-FqL-OnkbPoO8bQVmQpB1bA/);
  assert.match(text, /L10P89476GMB8/);
  assert.match(text, /ABC123/);
  assert.match(AUTHORIZE_PAGE_SCRIPT, /Loading secure card form… this can take up to 20 seconds/);
  assert.match(AUTHORIZE_PAGE_SCRIPT, /Card form didn't load — use the PayPal button or open in Safari/);
  assert.match(AUTHORIZE_PAGE_SCRIPT, /}, 25000\)/);
  assert.match(AUTHORIZE_PAGE_SCRIPT, /clearTimeout\(squareTimeout\);[\s\S]*squareStatus\.textContent = 'Card details are handled securely by Square\.';[\s\S]*squareButton\.disabled = false;/);
  assert.match(AUTHORIZE_PAGE_SCRIPT, /__client-error/);
  for (const field of ["order_id", "ts", "stage", "error", "user_agent", "square_loaded", "appId", "locId", "ua", "shortCode"]) assert.match(AUTHORIZE_PAGE_SCRIPT, new RegExp(field));
  assert.match(AUTHORIZE_PAGE_SCRIPT, /sdk-load/);
  assert.match(AUTHORIZE_PAGE_SCRIPT, /payments-init/);
  assert.match(AUTHORIZE_PAGE_SCRIPT, /card-init/);
  assert.match(AUTHORIZE_PAGE_SCRIPT, /card-attach/);
  assert.match(AUTHORIZE_PAGE_SCRIPT, /paypalCardBox\.hidden = true/);
  assert.doesNotMatch(AUTHORIZE_PAGE_SCRIPT, /fundingSource: paypal\.FUNDING\.CARD/);
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

test("customer page hides Square when the trip is more than seven days away", async () => {
  const future = daysFromToday(8);
  const page = await handleRequest(new Request("https://activity.nice.okinawa/payment/authorize?order=ORDER-FUTURE"), env({ rows: { byOrder: {
    paypal_order_id: "ORDER-FUTURE", short_code: "FUTURE", brand: "fishing", activity: "Charter", activity_date: future, amount: 100, currency: "JPY", policy_version: "fishing-paypal-auth-v2026-08-20"
  } } }));
  const text = await page.text();
  assert.match(text, /Pay securely/);
  assert.match(text, /PayPal authorization/);
  assert.match(text, /payment-options paypal-only/);
  assert.match(text, /PayPal authorization is valid for 29 days/);
  assert.doesNotMatch(text, /Pay by card \(Square\)/);
  assert.doesNotMatch(text, /square-card-container/);
  assert.doesNotMatch(text, /id="square-pay"/);
  assert.match(text, /squareAvailable/);
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

test("client errors are persisted with order, timestamp, stage, error and user agent", async () => {
  const e = env();
  const response = await handleRequest(new Request("https://activity.nice.okinawa/__client-error", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "browser-test" },
    body: JSON.stringify({ order_id: "ORDER-ERR", ts: "2026-08-22T01:02:03.000Z", stage: "card-attach", error: "attach failed", user_agent: "UA/test", shortCode: "ERR123" })
  }), e);
  assert.equal(response.status, 204);
  const insert = e.DB.calls.find(call => call.sql.includes("INSERT INTO client_error_events"));
  assert.ok(insert);
  assert.deepEqual(insert.values.slice(1, 8), ["ORDER-ERR", "ERR123", "2026-08-22T01:02:03.000Z", "card-attach", "attach failed", "UA/test", insert.values[7]]);
  assert.ok(e.DB.calls.some(call => call.sql.includes("DELETE FROM client_error_events") && call.values.length === 0));
});

test("admin order details expose client events in reverse chronological order", async () => {
  const e = env({ rows: {
    byAuthorizationId: { id: "auth-errors", paypal_order_id: "ORDER-ERR" },
    clientErrors: [{ id: "evt-2", order_id: "ORDER-ERR", ts: "2026-08-22T02:00:00Z", stage: "card-attach", error: "boom", user_agent: "UA" }]
  } });
  const denied = await handleRequest(new Request("https://activity.nice.okinawa/api/admin/authorizations/auth-errors/client-errors"), e);
  assert.equal(denied.status, 401);
  const response = await handleRequest(new Request("https://activity.nice.okinawa/api/admin/authorizations/auth-errors/client-errors", { headers: { authorization: "Bearer admin-token" } }), e);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.events[0].stage, "card-attach");
  assert.match(await (await adminPage()).text(), /客户端事件/);
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
