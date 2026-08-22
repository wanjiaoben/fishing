import { AUTHORIZE_PAGE_SCRIPT } from "./authorize-page.js";
import { WORKER_ADMIN_PATHS, WORKER_PUBLIC_PATHS, WORKER_ROUTE_DOMAINS } from "./routes.js";

const PAYPAL_API = {
  sandbox: "https://api-m.sandbox.paypal.com",
  production: "https://api-m.paypal.com"
};

const PAYPAL_JS = {
  sandbox: "https://www.paypal.com/sdk/js",
  production: "https://www.paypal.com/sdk/js"
};

const SQUARE_API = {
  sandbox: "https://connect.squareupsandbox.com",
  production: "https://connect.squareup.com"
};

const SQUARE_JS = {
  sandbox: "https://sandbox.web.squarecdn.com/v1/square.js",
  production: "https://web.squarecdn.com/v1/square.js"
};


const WEBHOOK_EVENTS = new Set([
  "CHECKOUT.ORDER.APPROVED",
  "PAYMENT.AUTHORIZATION.CREATED",
  "PAYMENT.AUTHORIZATION.VOIDED",
  "PAYMENT.CAPTURE.COMPLETED",
  "PAYMENT.CAPTURE.DENIED",
  "PAYMENT.CAPTURE.REFUNDED"
]);

const BRAND_CONFIG = Object.freeze({
  fishing: {
    key: "fishing",
    name: "Fishing Nice Okinawa",
    title: "Fishing Authorization",
    accent: "#00b4c8",
    background: "#06101d",
    returnUrl: "https://fishing.nice.okinawa/"
  },
  snorkel: {
    key: "snorkel",
    name: "Snorkel Nice Okinawa",
    title: "Snorkel Authorization",
    accent: "#25c2a0",
    background: "#06201f",
    returnUrl: "https://snorkel.nice.okinawa/"
  }
});

function normalizeBrand(value) {
  const brand = String(value || "fishing").trim().toLowerCase();
  return BRAND_CONFIG[brand] ? brand : "fishing";
}

function brandConfig(value) {
  return BRAND_CONFIG[normalizeBrand(value)];
}

function nowIso() {
  return new Date().toISOString();
}

function addDaysIso(inputIso, days) {
  const d = inputIso ? new Date(inputIso) : new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

function json(data, init = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...(init.headers || {})
    }
  });
}

function html(body, init = {}) {
  return new Response(body, {
    ...init,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      ...(init.headers || {})
    }
  });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

async function recordClientError(env, payload) {
  const now = nowIso();
  const orderId = String(payload?.order_id || "").trim().slice(0, 200) || null;
  const shortCode = String(payload?.shortCode || payload?.short_code || "").trim().slice(0, 32) || null;
  const ts = String(payload?.ts || now).slice(0, 64);
  const stage = String(payload?.stage || "unknown").slice(0, 80);
  const error = String(payload?.error || payload?.err || "unknown").slice(0, 4000);
  const userAgent = String(payload?.user_agent || payload?.ua || "").slice(0, 1000) || null;
  await env.DB.prepare(
    `INSERT INTO client_error_events (id, order_id, short_code, ts, stage, error, user_agent, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(crypto.randomUUID(), orderId, shortCode, ts, stage, error, userAgent, now).run();
  await env.DB.prepare("DELETE FROM client_error_events WHERE julianday(created_at) < julianday('now', '-30 days')").run();
}

function config(env) {
  const paypalEnv = env.PAYPAL_ENV === "production" ? "production" : "sandbox";
  return {
    paypalEnv,
    apiBase: PAYPAL_API[paypalEnv],
    jsBase: PAYPAL_JS[paypalEnv],
    clientId: paypalEnv === "production" ? env.PAYPAL_PRODUCTION_CLIENT_ID : env.PAYPAL_SANDBOX_CLIENT_ID,
    clientSecret: paypalEnv === "production" ? env.PAYPAL_PRODUCTION_CLIENT_SECRET : env.PAYPAL_SANDBOX_CLIENT_SECRET,
    webhookId: env.PAYPAL_WEBHOOK_ID,
    adminToken: env.ADMIN_TOKEN,
    policyVersion: env.PAYPAL_AUTH_POLICY_VERSION || "fishing-paypal-auth-v2026-08-20",
    product: env.PAYPAL_AUTH_PRODUCT || "Private Fishing Charter",
    activityDate: env.PAYPAL_AUTH_ACTIVITY_DATE || "2026-08-24",
    amount: Number(env.PAYPAL_AUTH_AMOUNT || 66000),
    currency: env.PAYPAL_AUTH_CURRENCY || "JPY",
    reminderDays: Number(env.PAYPAL_AUTH_VALIDITY_REMINDER_DAYS || 3),
    workerOrigin: env.PAYPAL_AUTH_WORKER_ORIGIN || ""
    ,squareEnv: env.SQUARE_ENV === "production" ? "production" : "sandbox"
    ,squareApplicationId: env.SQUARE_ENV === "production" ? env.SQUARE_PRODUCTION_APPLICATION_ID : env.SQUARE_SANDBOX_APPLICATION_ID
    ,squareAccessToken: env.SQUARE_ENV === "production" ? env.SQUARE_PRODUCTION_ACCESS_TOKEN : env.SQUARE_SANDBOX_ACCESS_TOKEN
    ,squareLocationId: env.SQUARE_ENV === "production" ? env.SQUARE_PRODUCTION_LOCATION_ID : env.SQUARE_SANDBOX_LOCATION_ID
    ,squareApiBase: SQUARE_API[env.SQUARE_ENV === "production" ? "production" : "sandbox"]
    ,squareJsBase: SQUARE_JS[env.SQUARE_ENV === "production" ? "production" : "sandbox"]
  };
}

function requireSquareConfig(env) {
  const c = config(env);
  if (!c.squareApplicationId || !c.squareAccessToken || !c.squareLocationId) {
    throw new Error(`Missing Square ${c.squareEnv} credentials`);
  }
  return c;
}

async function squareFetch(env, path, options = {}) {
  const c = requireSquareConfig(env);
  const res = await fetch(`${c.squareApiBase}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${c.squareAccessToken}`,
      "square-version": "2026-07-15",
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await res.text();
  let data = {};
  if (text) { try { data = JSON.parse(text); } catch { data = { raw: text }; } }
  if (!res.ok) {
    const err = new Error(`Square API failed ${res.status} ${path}`);
    err.status = res.status; err.data = data; throw err;
  }
  return data;
}

function makeShortCode() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
}

async function ensureShortCode(env, row) {
  if (row.short_code) return row.short_code;
  for (let i = 0; i < 5; i += 1) {
    const code = makeShortCode();
    try {
      await env.DB.prepare(`UPDATE paypal_authorizations SET short_code = ?, updated_at = ? WHERE id = ? AND short_code IS NULL`).bind(code, nowIso(), row.id).run();
      const found = await env.DB.prepare(`SELECT short_code FROM paypal_authorizations WHERE id = ?`).bind(row.id).first();
      if (found?.short_code) return found.short_code;
    } catch (error) {
      if (i === 4) throw error;
    }
  }
  throw new Error("SHORT_CODE_GENERATION_FAILED");
}

function requireServerConfig(env) {
  const c = config(env);
  if (!c.clientId || !c.clientSecret) {
    throw new Error(`Missing PayPal ${c.paypalEnv} client credentials`);
  }
  return c;
}

async function paypalAccessToken(env) {
  const c = requireServerConfig(env);
  const raw = `${c.clientId}:${c.clientSecret}`;
  const basic = btoa(raw);
  const res = await fetch(`${c.apiBase}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      authorization: `Basic ${basic}`,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(`PayPal OAuth failed: ${res.status}`);
  }
  return data.access_token;
}

async function paypalFetch(env, path, options = {}) {
  const c = requireServerConfig(env);
  const token = await paypalAccessToken(env);
  const res = await fetch(`${c.apiBase}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await res.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }
  if (!res.ok) {
    const err = new Error(`PayPal API failed ${res.status} ${path}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function id(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

async function sha256Hex(input) {
  const bytes = new TextEncoder().encode(input || "");
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function clientIp(request) {
  return request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "";
}

async function insertEvent(env, row) {
  await env.DB.prepare(
    `INSERT INTO paypal_authorization_events
     (id, authorization_id, paypal_order_id, paypal_authorization_id, event_type, event_status, payload, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    row.id || id("evt"),
    row.authorization_id || null,
    row.paypal_order_id || null,
    row.paypal_authorization_id || null,
    row.event_type,
    row.event_status || null,
    JSON.stringify(row.payload || {}),
    nowIso()
  ).run();
}

async function audit(env, row) {
  await env.DB.prepare(
    `INSERT INTO payment_audit_log
     (id, authorization_id, paypal_authorization_id, action, actor, amount, currency, idempotency_key, request_payload, response_payload, result_status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    row.id || id("audit"),
    row.authorization_id || null,
    row.paypal_authorization_id || null,
    row.action,
    row.actor || "system",
    row.amount ?? null,
    row.currency || null,
    row.idempotency_key || null,
    JSON.stringify(row.request_payload || {}),
    JSON.stringify(row.response_payload || {}),
    row.result_status || "UNKNOWN",
    nowIso()
  ).run();
}

async function getAuthorizationByOrder(env, orderId) {
  return await env.DB.prepare(
    `SELECT * FROM paypal_authorizations WHERE paypal_order_id = ?`
  ).bind(orderId).first();
}

async function getAuthorizationByShortCode(env, shortCode) {
  return await env.DB.prepare(`SELECT * FROM paypal_authorizations WHERE short_code = ?`).bind(shortCode).first();
}

async function getAuthorizationById(env, authId) {
  return await env.DB.prepare(
    `SELECT * FROM paypal_authorizations WHERE id = ? OR paypal_authorization_id = ?`
  ).bind(authId, authId).first();
}

function adminActor(request) {
  return request.headers.get("x-admin-user") || "admin";
}

function requireAdmin(request, env) {
  const c = config(env);
  if (!c.adminToken) {
    return false;
  }
  const auth = request.headers.get("authorization") || "";
  return auth === `Bearer ${c.adminToken}`;
}

async function createOrder(request, env) {
  const c = requireServerConfig(env);
  const body = await readJson(request);
  if (body.accepted_policy !== true || body.policy_version !== c.policyVersion) {
    return json({ ok: false, error: "POLICY_AGREEMENT_REQUIRED" }, { status: 400 });
  }

  const agreementId = id("agree");
  const authId = id("auth");
  const createdAt = nowIso();
  const idempotencyKey = body.idempotency_key || id("order_req");
  const orderPayload = {
    intent: "AUTHORIZE",
    purchase_units: [
      {
        reference_id: authId,
        description: `${c.product} ${c.activityDate}`,
        amount: {
          currency_code: c.currency,
          value: String(c.amount)
        }
      }
    ],
    application_context: {
      brand_name: "Catalina Japan",
      user_action: "CONTINUE"
    }
  };

  const paypalOrder = await paypalFetch(env, "/v2/checkout/orders", {
    method: "POST",
    headers: { "PayPal-Request-Id": idempotencyKey },
    body: JSON.stringify(orderPayload)
  });

  await env.DB.prepare(
    `INSERT INTO paypal_authorizations
     (id, paypal_order_id, brand, activity, activity_date, amount, currency, authorization_status, paypal_status,
      paypal_create_response, policy_version, agreed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    authId,
    paypalOrder.id,
    "fishing",
    c.product,
    c.activityDate,
    c.amount,
    c.currency,
    "ORDER_CREATED",
    paypalOrder.status || null,
    JSON.stringify(paypalOrder),
    c.policyVersion,
    createdAt,
    createdAt,
    createdAt
  ).run();

  await env.DB.prepare(
    `INSERT INTO payment_policy_agreements
     (id, authorization_id, paypal_order_id, activity, activity_date, amount, currency, policy_version, agreed_at, client_ip_hash, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    agreementId,
    authId,
    paypalOrder.id,
    c.product,
    c.activityDate,
    c.amount,
    c.currency,
    c.policyVersion,
    createdAt,
    await sha256Hex(clientIp(request)),
    request.headers.get("user-agent") || ""
  ).run();

  await insertEvent(env, {
    authorization_id: authId,
    paypal_order_id: paypalOrder.id,
    event_type: "ORDER_CREATED",
    event_status: paypalOrder.status,
    payload: paypalOrder
  });

  return json({
    ok: true,
    paypal_order_id: paypalOrder.id,
    local_authorization_id: authId,
    agreement_id: agreementId
  });
}

async function createAdminOrder(request, env) {
  if (!requireAdmin(request, env)) return json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  const c = requireServerConfig(env);
  const body = await readJson(request);
  const activity = String(body.activity || "").trim();
  const activityDate = String(body.activity_date || "").trim();
  const amount = Number(body.amount);
  const currency = String(body.currency || "JPY").trim().toUpperCase();
  const brand = normalizeBrand(body.brand);
  const guestName = String(body.guest_name || "").trim().slice(0, 200);
  const guestEmail = String(body.guest_email || "").trim().toLowerCase().slice(0, 320);
  if (!activity || !/^\d{4}-\d{2}-\d{2}$/.test(activityDate) || !Number.isInteger(amount) || amount <= 0 || currency !== "JPY" || (guestEmail && !/^\S+@\S+\.\S+$/.test(guestEmail))) {
    return json({ ok: false, error: "INVALID_ORDER_FIELDS", required: ["activity", "activity_date", "amount", "currency=JPY", "guest_name?", "guest_email?"] }, { status: 400 });
  }
  const localId = id("auth");
  const createdAt = nowIso();
  const orderKey = body.idempotency_key || id("admin_order");
  const paypalOrder = await paypalFetch(env, "/v2/checkout/orders", {
    method: "POST",
    headers: { "PayPal-Request-Id": orderKey },
    body: JSON.stringify({
      intent: "AUTHORIZE",
      purchase_units: [{ reference_id: localId, description: `${activity} ${activityDate}`, amount: { currency_code: currency, value: String(amount) } }],
      application_context: { brand_name: "Catalina Japan", user_action: "CONTINUE" }
    })
  });
  await env.DB.prepare(
    `INSERT INTO paypal_authorizations
     (id, paypal_order_id, brand, activity, activity_date, amount, currency, authorization_status, paypal_status,
      paypal_create_response, policy_version, guest_name, guest_email, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(localId, paypalOrder.id, brand, activity, activityDate, amount, currency, "ORDER_CREATED", paypalOrder.status || null,
    JSON.stringify(paypalOrder), c.policyVersion, guestName || null, guestEmail || null, createdAt, createdAt).run();
  const shortCode = makeShortCode();
  await env.DB.prepare(`UPDATE paypal_authorizations SET short_code = ? WHERE id = ?`).bind(shortCode, localId).run();
  await insertEvent(env, { authorization_id: localId, paypal_order_id: paypalOrder.id, event_type: "ORDER_CREATED", event_status: paypalOrder.status, payload: paypalOrder });
  const squareLimit = new Date();
  squareLimit.setHours(0, 0, 0, 0);
  squareLimit.setDate(squareLimit.getDate() + 7);
  const squareLinkWarning = new Date(`${activityDate}T00:00:00Z`) > squareLimit;
  return json({ ok: true, local_authorization_id: localId, paypal_order_id: paypalOrder.id,
    authorize_url: `${c.workerOrigin || new URL(request.url).origin}/payment/authorize?order=${encodeURIComponent(paypalOrder.id)}`,
    short_code: shortCode, short_url: `${c.workerOrigin || new URL(request.url).origin}/p/${shortCode}`, brand, square_link_warning: squareLinkWarning });
}

async function createOrderWithSandboxTestCard(request, env) {
  const c = requireServerConfig(env);
  if (c.paypalEnv !== "sandbox") {
    return json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }
  if (!requireAdmin(request, env)) {
    return json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }
  const body = await readJson(request);
  const agreementId = id("agree");
  const authId = id("auth");
  const createdAt = nowIso();
  const idempotencyKey = body.idempotency_key || id("sandbox_card_order_req");
  const orderPayload = {
    intent: "AUTHORIZE",
    purchase_units: [
      {
        reference_id: authId,
        description: `${c.product} ${c.activityDate}`,
        amount: {
          currency_code: c.currency,
          value: String(c.amount)
        }
      }
    ],
    payment_source: sandboxTestCardPaymentSource()
  };

  const paypalOrder = await paypalFetch(env, "/v2/checkout/orders", {
    method: "POST",
    headers: { "PayPal-Request-Id": idempotencyKey },
    body: JSON.stringify(orderPayload)
  });

  await env.DB.prepare(
    `INSERT INTO paypal_authorizations
     (id, paypal_order_id, brand, activity, activity_date, amount, currency, authorization_status, paypal_status,
      paypal_create_response, policy_version, agreed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    authId,
    paypalOrder.id,
    "fishing",
    c.product,
    c.activityDate,
    c.amount,
    c.currency,
    "ORDER_CREATED",
    paypalOrder.status || null,
    JSON.stringify(paypalOrder),
    c.policyVersion,
    createdAt,
    createdAt,
    createdAt
  ).run();

  await env.DB.prepare(
    `INSERT INTO payment_policy_agreements
     (id, authorization_id, paypal_order_id, activity, activity_date, amount, currency, policy_version, agreed_at, client_ip_hash, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    agreementId,
    authId,
    paypalOrder.id,
    c.product,
    c.activityDate,
    c.amount,
    c.currency,
    c.policyVersion,
    createdAt,
    await sha256Hex(clientIp(request)),
    request.headers.get("user-agent") || ""
  ).run();

  await insertEvent(env, {
    authorization_id: authId,
    paypal_order_id: paypalOrder.id,
    event_type: "SANDBOX_CARD_ORDER_CREATED",
    event_status: paypalOrder.status,
    payload: paypalOrder
  });

  return await storeAuthorizedOrder(env, {
    id: authId,
    paypal_order_id: paypalOrder.id,
    amount: c.amount,
    currency: c.currency
  }, paypalOrder.id, paypalOrder);
}

async function authorizeOrder(request, env, ctx) {
  const body = await readJson(request);
  const orderId = body.order_id;
  if (!orderId) {
    return json({ ok: false, error: "ORDER_ID_REQUIRED" }, { status: 400 });
  }
  const row = await getAuthorizationByOrder(env, orderId);
  if (!row) {
    return json({ ok: false, error: "ORDER_NOT_FOUND" }, { status: 404 });
  }
  if (body.accepted_policy === true && body.policy_version === row.policy_version) {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO payment_policy_agreements
       (id, authorization_id, paypal_order_id, activity, activity_date, amount, currency, policy_version, agreed_at, client_ip_hash, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id("agree"), row.id, row.paypal_order_id, row.activity, row.activity_date, row.amount, row.currency,
      row.policy_version, nowIso(), await sha256Hex(clientIp(request)), request.headers.get("user-agent") || "").run();
  }
  if (row.authorization_status === "AUTHORIZED" && row.paypal_authorization_id) {
    return json({
      ok: true,
      status: "AUTHORIZED",
      charged: false,
      message: "AUTHORIZED – NOT CHARGED",
      paypal_order_id: row.paypal_order_id,
      paypal_authorization_id: row.paypal_authorization_id
    });
  }

  const idempotencyKey = body.idempotency_key || `authorize-${orderId}`;
  const paypalAuth = await paypalFetch(env, `/v2/checkout/orders/${encodeURIComponent(orderId)}/authorize`, {
    method: "POST",
    headers: { "PayPal-Request-Id": idempotencyKey },
    body: "{}"
  });

  return await storeAuthorizedOrder(env, row, orderId, paypalAuth, ctx);
}

async function createSquarePayment(request, env, ctx) {
  const body = await readJson(request);
  const orderId = String(body.order_id || "").trim();
  const sourceId = String(body.source_id || "").trim();
  if (!orderId || !sourceId) return json({ ok: false, error: "ORDER_ID_AND_SOURCE_ID_REQUIRED" }, { status: 400 });
  const row = await getAuthorizationByOrder(env, orderId);
  if (!row) return json({ ok: false, error: "ORDER_NOT_FOUND" }, { status: 404 });
  if (body.accepted_policy !== true || body.policy_version !== row.policy_version) {
    return json({ ok: false, error: "POLICY_AGREEMENT_REQUIRED" }, { status: 400 });
  }
  if (row.provider === "square" && row.square_payment_id && row.authorization_status === "AUTHORIZED") {
    return json({ ok: true, idempotent: true, status: "AUTHORIZED", charged: false, square_payment_id: row.square_payment_id });
  }
  if (row.authorization_status !== "ORDER_CREATED") {
    return json({ ok: false, error: "ORDER_NOT_AVAILABLE", current_status: row.authorization_status }, { status: 409 });
  }
  const shortCode = await ensureShortCode(env, row);
  const createdAt = nowIso();
  await env.DB.prepare(
    `INSERT OR IGNORE INTO payment_policy_agreements
     (id, authorization_id, paypal_order_id, activity, activity_date, amount, currency, policy_version, agreed_at, client_ip_hash, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id("agree"), row.id, row.paypal_order_id, row.activity, row.activity_date, row.amount, row.currency,
    row.policy_version, createdAt, await sha256Hex(clientIp(request)), request.headers.get("user-agent") || "").run();
  const c = requireSquareConfig(env);
  const response = await squareFetch(env, "/v2/payments", {
    method: "POST",
    headers: { "idempotency-key": shortCode },
    body: JSON.stringify({
      source_id: sourceId,
      idempotency_key: shortCode,
      amount_money: { amount: Number(row.amount), currency: row.currency },
      autocomplete: false,
      delay_duration: "P7D",
      delay_action: "CANCEL",
      location_id: c.squareLocationId,
      note: `${row.activity} ${row.activity_date}`
    })
  });
  const payment = response.payment || {};
  if (payment.status !== "APPROVED" || !payment.id) {
    return json({ ok: false, error: "SQUARE_AUTHORIZATION_NOT_APPROVED", square_status: payment.status || null }, { status: 502 });
  }
  const authCreateTime = payment.created_at || createdAt;
  const expiration = payment.delayed_until || addDaysIso(authCreateTime, 7);
  const honorPeriod = addDaysIso(authCreateTime, 3);
  await env.DB.prepare(
    `UPDATE paypal_authorizations SET provider = 'square', square_payment_id = ?, authorization_status = ?, paypal_status = ?,
      authorization_create_time = ?, authorization_expiration_time = ?, honor_period_ends_at = ?, updated_at = ? WHERE id = ?`
  ).bind(payment.id, "AUTHORIZED", payment.status, authCreateTime, expiration, honorPeriod, nowIso(), row.id).run();
  await audit(env, {
    authorization_id: row.id, action: "SQUARE_AUTHORIZE_PAYMENT", actor: "customer", amount: row.amount, currency: row.currency,
    idempotency_key: shortCode, request_payload: { amount_money: { amount: Number(row.amount), currency: row.currency }, autocomplete: false },
    response_payload: response, result_status: "SUCCESS"
  });
  await insertEvent(env, { authorization_id: row.id, paypal_order_id: row.paypal_order_id, event_type: "SQUARE_PAYMENT_AUTHORIZED", event_status: payment.status, payload: response });
  await notifyInfoOnce(env, { ...row, provider: "square", square_payment_id: payment.id, authorization_status: "AUTHORIZED" }, "AUTHORIZED");
  queueCustomerAuthorizationEmail(ctx, env, { ...row, provider: "square", square_payment_id: payment.id, authorization_status: "AUTHORIZED", authorization_expiration_time: expiration });
  return json({ ok: true, status: "AUTHORIZED", charged: false, message: "AUTHORIZED – NOT CHARGED", square_payment_id: payment.id, amount: row.amount, currency: row.currency, authorization_expiration_time: expiration, honor_period_ends_at: honorPeriod });
}

function sandboxTestCardPaymentSource() {
  return {
    card: {
      number: "1111111111111111",
      expiry: "2030-12",
      security_code: "123",
      name: "Sandbox Buyer",
      billing_address: {
        address_line_1: "2211 N First Street",
        admin_area_2: "San Jose",
        admin_area_1: "CA",
        postal_code: "95131",
        country_code: "US"
      },
      attributes: {
        verification: {
          method: "SCA_WHEN_REQUIRED"
        },
        customer: {
          email_address: "sandbox-buyer@example.com"
        }
      }
    }
  };
}

async function authorizeOrderWithSandboxTestCard(request, env, ctx) {
  const c = config(env);
  if (c.paypalEnv !== "sandbox") {
    return json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }
  if (!requireAdmin(request, env)) {
    return json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }
  const body = await readJson(request);
  const orderId = body.order_id;
  if (!orderId) {
    return json({ ok: false, error: "ORDER_ID_REQUIRED" }, { status: 400 });
  }
  const idempotencyKey = body.idempotency_key || `sandbox-card-authorize-${orderId}`;
  const row = await getAuthorizationByOrder(env, orderId);
  if (!row) {
    return json({ ok: false, error: "ORDER_NOT_FOUND" }, { status: 404 });
  }
  if (row.authorization_status === "AUTHORIZED" && row.paypal_authorization_id) {
    return json({
      ok: true,
      idempotent: true,
      status: "AUTHORIZED",
      charged: false,
      message: "AUTHORIZED – NOT CHARGED",
      paypal_order_id: row.paypal_order_id,
      paypal_authorization_id: row.paypal_authorization_id
    });
  }
  const paypalAuth = await paypalFetch(env, `/v2/checkout/orders/${encodeURIComponent(orderId)}/authorize`, {
    method: "POST",
    headers: { "PayPal-Request-Id": idempotencyKey },
    body: JSON.stringify({ payment_source: sandboxTestCardPaymentSource() })
  });

  return await storeAuthorizedOrder(env, row, orderId, paypalAuth, ctx);
}

async function storeAuthorizedOrder(env, row, orderId, paypalAuth, ctx) {
  const authorization = paypalAuth.purchase_units?.[0]?.payments?.authorizations?.[0] || {};
  const authorizationId = authorization.id;
  if (!authorizationId) {
    return json({
      ok: false,
      error: "AUTHORIZATION_ID_NOT_RETURNED",
      paypal_order_id: orderId,
      paypal_status: paypalAuth.status || null
    }, { status: 502 });
  }
  const authCreateTime = authorization.create_time || nowIso();
  const expiration = authorization.expiration_time || addDaysIso(authCreateTime, 29);
  const honorPeriod = addDaysIso(authCreateTime, 3);

  await env.DB.prepare(
    `UPDATE paypal_authorizations SET
      paypal_authorization_id = ?,
      authorization_status = ?,
      paypal_status = ?,
      paypal_authorize_response = ?,
      authorization_create_time = ?,
      authorization_expiration_time = ?,
      honor_period_ends_at = ?,
      payer_email = ?,
      payer_id = ?,
      updated_at = ?
     WHERE paypal_order_id = ?`
  ).bind(
    authorizationId,
    "AUTHORIZED",
    authorization.status || paypalAuth.status || null,
    JSON.stringify(paypalAuth),
    authCreateTime,
    expiration,
    honorPeriod,
    paypalAuth.payer?.email_address || null,
    paypalAuth.payer?.payer_id || null,
    nowIso(),
    orderId
  ).run();

  await insertEvent(env, {
    authorization_id: row.id,
    paypal_order_id: orderId,
    paypal_authorization_id: authorizationId,
    event_type: "ORDER_AUTHORIZED",
    event_status: authorization.status || paypalAuth.status,
    payload: paypalAuth
  });
  await notifyInfoOnce(env, { ...row, authorization_status: "AUTHORIZED", paypal_authorization_id: authorizationId }, "AUTHORIZED");
  queueCustomerAuthorizationEmail(ctx, env, { ...row, authorization_status: "AUTHORIZED", paypal_authorization_id: authorizationId, authorization_expiration_time: expiration });

  return json({
    ok: true,
    status: "AUTHORIZED",
    charged: false,
    message: "AUTHORIZED – NOT CHARGED",
    paypal_order_id: orderId,
    paypal_authorization_id: authorizationId,
    amount: row.amount,
    currency: row.currency,
    authorization_expiration_time: expiration,
    honor_period_ends_at: honorPeriod
  });
}

async function listAuthorizations(request, env) {
  if (!requireAdmin(request, env)) {
    return json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }
  const rows = await env.DB.prepare(
    `SELECT id, paypal_order_id, paypal_authorization_id, provider, square_payment_id, short_code, brand, activity, activity_date, amount, currency,
            guest_name, guest_email,
            authorization_status, paypal_status, authorization_create_time, authorization_expiration_time,
            honor_period_ends_at, created_at, updated_at
     FROM paypal_authorizations
     ORDER BY created_at DESC
     LIMIT 100`
  ).all();
  const now = Date.now();
  const data = (rows.results || []).map(r => {
    const expiresAt = r.authorization_expiration_time ? new Date(r.authorization_expiration_time).getTime() : null;
    const honorEnds = r.honor_period_ends_at ? new Date(r.honor_period_ends_at).getTime() : null;
    return {
      ...r,
      authorize_url: `${config(env).workerOrigin || "https://activity.nice.okinawa"}/payment/authorize?order=${encodeURIComponent(r.paypal_order_id)}`,
      short_url: r.short_code ? `${config(env).workerOrigin || "https://activity.nice.okinawa"}/p/${encodeURIComponent(r.short_code)}` : null,
      status_label: r.authorization_status === "AUTHORIZED" ? "AUTHORIZED – NOT CHARGED" : r.authorization_status,
      days_until_expiration: expiresAt ? Math.ceil((expiresAt - now) / 86400000) : null,
      in_honor_period: honorEnds ? now <= honorEnds : false,
      reminder: expiresAt && expiresAt - now <= (3 * 86400000) ? "AUTHORIZATION_EXPIRING_SOON" : null
    };
  });
  return json({ ok: true, authorizations: data });
}

async function listClientErrors(request, env, authorizationId) {
  if (!requireAdmin(request, env)) {
    return json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }
  const authorization = await env.DB.prepare("SELECT id, paypal_order_id FROM paypal_authorizations WHERE id = ? LIMIT 1").bind(authorizationId).first();
  if (!authorization) return json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  const rows = await env.DB.prepare(
    `SELECT id, order_id, short_code, ts, stage, error, user_agent
      FROM client_error_events
      WHERE order_id = ?
        AND julianday(created_at) >= julianday('now', '-30 days')
      ORDER BY ts DESC
      LIMIT 100`
  ).bind(authorization.paypal_order_id).all();
  return json({ ok: true, events: rows.results || [] });
}

async function previouslySucceeded(env, action, idempotencyKey) {
  if (!idempotencyKey) return null;
  return await env.DB.prepare(
    `SELECT * FROM payment_audit_log WHERE action = ? AND idempotency_key = ? AND result_status = 'SUCCESS' ORDER BY created_at DESC LIMIT 1`
  ).bind(action, idempotencyKey).first();
}

function authorizationPolicyUrl(row) {
  return brandConfig(row.brand).key === "snorkel"
    ? "https://snorkel.nice.okinawa/#how-booking-works"
    : "https://fishing.nice.okinawa/#booking";
}

async function sendResendEmail(env, payload) {
  if (!env.RESEND_API_KEY) throw new Error("RESEND_API_KEY_MISSING");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: "Bearer " + env.RESEND_API_KEY, "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const responsePayload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error("RESEND_" + response.status);
    error.responsePayload = responsePayload;
    throw error;
  }
  return responsePayload;
}

async function sendCustomerAuthorizationEmail(env, row) {
  const recipient = String(row.guest_email || "").trim().toLowerCase();
  const idempotencyKey = "CUSTOMER_AUTH_EMAIL:" + row.id;
  if (!recipient) {
    await audit(env, { authorization_id: row.id, action: "CUSTOMER_AUTH_EMAIL", actor: "system", idempotency_key: idempotencyKey, request_payload: { reason: "NO_CUSTOMER_EMAIL" }, response_payload: {}, result_status: "SKIPPED" });
    return;
  }
  if (await previouslySucceeded(env, "CUSTOMER_AUTH_EMAIL", idempotencyKey)) return;
  const amount = row.currency + " " + Number(row.amount || 0).toLocaleString("en-US");
  const expiration = row.authorization_expiration_time ? new Date(row.authorization_expiration_time).toISOString().slice(0, 10) : "within 7 days";
  const subject = "Authorization received · " + row.activity + " · " + row.activity_date;
  const text = [
    "Your card authorization has been received.",
    "",
    "Authorized amount: " + amount,
    "Activity: " + row.activity,
    "Trip date: " + row.activity_date,
    "Authorization validity: until " + expiration + "; no charge is made during the first 7 days of the hold.",
    "",
    "This authorization is not the final booking confirmation. We will check the details and send a confirmation email. Please also reply to this email or message us on WhatsApp to let us know you completed this step.",
    "",
    "Cancellation policy: " + authorizationPolicyUrl(row),
    "WhatsApp: +81 70-8952-3968",
    "Email: info@nice.okinawa"
  ].join("\n");
  try {
    const responsePayload = await sendResendEmail(env, { from: "noreply@nice.okinawa", to: [recipient], subject, text });
    await audit(env, { authorization_id: row.id, action: "CUSTOMER_AUTH_EMAIL", actor: "system", idempotency_key: idempotencyKey, request_payload: { recipient, subject }, response_payload: responsePayload, result_status: "SUCCESS" });
  } catch (error) {
    const responsePayload = { error: error.message || "CUSTOMER_AUTH_EMAIL_FAILED", resend: error.responsePayload || null };
    console.error("CUSTOMER_AUTH_EMAIL_FAILED", JSON.stringify({ authorization_id: row.id, recipient, error: responsePayload }));
    await audit(env, { authorization_id: row.id, action: "CUSTOMER_AUTH_EMAIL", actor: "system", idempotency_key: idempotencyKey, request_payload: { recipient, subject }, response_payload: responsePayload, result_status: "FAILED" });
    if (recipient !== "info@nice.okinawa") {
      try {
        await sendResendEmail(env, {
          from: "noreply@nice.okinawa",
          to: ["aboutokinawa@gmail.com"],
          subject: "Customer authorization email failed · " + row.activity + " · " + row.activity_date,
          text: "The authorization email to " + recipient + " failed.\n\nActivity: " + row.activity + "\nTrip date: " + row.activity_date + "\nAmount: " + amount + "\nAuthorization ID: " + row.id + "\nError: " + responsePayload.error
        });
      } catch (copyError) {
        console.error("CUSTOMER_AUTH_EMAIL_COPY_FAILED", JSON.stringify({ authorization_id: row.id, error: copyError.message || String(copyError) }));
      }
    }
  }
}

function queueCustomerAuthorizationEmail(ctx, env, row) {
  const task = sendCustomerAuthorizationEmail(env, row).catch(error => {
    console.error("CUSTOMER_AUTH_EMAIL_UNHANDLED", JSON.stringify({ authorization_id: row.id, error: error.message || String(error) }));
  });
  if (ctx?.waitUntil) ctx.waitUntil(task);
}

async function notifyInfoOnce(env, row, eventName) {
  const idempotencyKey = `NOTIFY_${eventName}:${row.id}`;
  if (await previouslySucceeded(env, `NOTIFY_${eventName}`, idempotencyKey)) return { ok: true, idempotent: true };
  const amount = Number(row.amount || 0).toLocaleString("en-US");
  const subject = `[${brandConfig(row.brand).name}] ${row.activity} · ${row.activity_date} · ${row.currency} ${amount} · ${eventName}`;
  const text = [
    `Authorization event: ${eventName}`,
    `Activity: ${row.activity}`,
    `Brand: ${brandConfig(row.brand).name}`,
    `Date: ${row.activity_date}`,
    `Amount: ${row.currency} ${amount}`,
    `Status: ${row.authorization_status || ""}`,
    "",
    "Admin: https://fishing.nice.okinawa/admin/paypal-authorizations"
  ].join("\n");
  if (!env.RESEND_API_KEY) {
    await audit(env, { authorization_id: row.id, action: `NOTIFY_${eventName}`, actor: "system", idempotency_key: idempotencyKey, request_payload: { eventName }, response_payload: { error: "RESEND_API_KEY missing" }, result_status: "FAILED" });
    return { ok: false, error: "RESEND_API_KEY_MISSING" };
  }
  let responsePayload = {};
  let resultStatus = "FAILED";
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: "noreply@nice.okinawa", to: ["info@nice.okinawa"], subject, text })
    });
    responsePayload = await response.json().catch(() => ({}));
    resultStatus = response.ok ? "SUCCESS" : "FAILED";
  } catch (error) {
    responsePayload = { error: error.message || "RESEND_REQUEST_FAILED" };
  }
  await audit(env, { authorization_id: row.id, action: `NOTIFY_${eventName}`, actor: "system", idempotency_key: idempotencyKey, request_payload: { eventName, subject }, response_payload: responsePayload, result_status: resultStatus });
  return { ok: resultStatus === "SUCCESS", response: responsePayload };
}

async function cancelAuthorization(request, env, authId) {
  if (!requireAdmin(request, env)) return json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  const body = await readJson(request);
  if (body.confirm !== true) return json({ ok: false, error: "SECOND_CONFIRMATION_REQUIRED" }, { status: 400 });
  if (!body.idempotency_key) return json({ ok: false, error: "IDEMPOTENCY_KEY_REQUIRED" }, { status: 400 });
  const existing = await previouslySucceeded(env, "CANCEL_AUTHORIZATION", body.idempotency_key);
  if (existing) return json({ ok: true, idempotent: true, status: "CANCELLED" });
  const row = await getAuthorizationById(env, authId);
  if (!row) return json({ ok: false, error: "AUTHORIZATION_NOT_FOUND" }, { status: 404 });
  if (row.authorization_status !== "ORDER_CREATED") return json({ ok: false, error: "AUTHORIZATION_NOT_CANCELLABLE", current_status: row.authorization_status }, { status: 409 });
  await env.DB.prepare(`UPDATE paypal_authorizations SET authorization_status = ?, paypal_status = ?, updated_at = ? WHERE id = ?`).bind("CANCELLED", "CANCELLED", nowIso(), row.id).run();
  await audit(env, { authorization_id: row.id, paypal_order_id: row.paypal_order_id, action: "CANCEL_AUTHORIZATION", actor: adminActor(request), idempotency_key: body.idempotency_key, request_payload: { confirm: true }, response_payload: { status: "CANCELLED" }, result_status: "SUCCESS" });
  await insertEvent(env, { authorization_id: row.id, paypal_order_id: row.paypal_order_id, event_type: "ORDER_CANCELLED", event_status: "CANCELLED", payload: { source: "admin" } });
  return json({ ok: true, status: "CANCELLED" });
}

async function editTripDate(request, env, authId) {
  if (!requireAdmin(request, env)) return json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  const body = await readJson(request);
  const activityDate = String(body.activity_date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(activityDate)) return json({ ok: false, error: "INVALID_TRIP_DATE" }, { status: 400 });
  if (!body.confirm || !body.idempotency_key) return json({ ok: false, error: "CONFIRMATION_REQUIRED" }, { status: 400 });
  const existing = await previouslySucceeded(env, "EDIT_TRIP_DATE", body.idempotency_key);
  if (existing) return json({ ok: true, idempotent: true, activity_date: activityDate });
  const row = await getAuthorizationById(env, authId);
  if (!row) return json({ ok: false, error: "AUTHORIZATION_NOT_FOUND" }, { status: 404 });
  if (!["ORDER_CREATED", "AUTHORIZED"].includes(row.authorization_status)) {
    return json({ ok: false, error: "TRIP_DATE_NOT_EDITABLE", current_status: row.authorization_status }, { status: 409 });
  }
  const previousDate = row.activity_date;
  await env.DB.prepare(`UPDATE paypal_authorizations SET activity_date = ?, updated_at = ? WHERE id = ?`).bind(activityDate, nowIso(), row.id).run();
  await audit(env, {
    authorization_id: row.id,
    paypal_order_id: row.paypal_order_id,
    action: "EDIT_TRIP_DATE",
    actor: adminActor(request),
    idempotency_key: body.idempotency_key,
    request_payload: { confirm: true, from: previousDate, to: activityDate },
    response_payload: { activity_date: activityDate },
    result_status: "SUCCESS"
  });
  return json({ ok: true, activity_date: activityDate, previous_activity_date: previousDate });
}

async function voidAuthorization(request, env, authId) {
  if (!requireAdmin(request, env)) {
    return json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }
  const body = await readJson(request);
  if (body.confirm !== true) {
    return json({ ok: false, error: "SECOND_CONFIRMATION_REQUIRED" }, { status: 400 });
  }
  const idempotencyKey = body.idempotency_key;
  if (!idempotencyKey) {
    return json({ ok: false, error: "IDEMPOTENCY_KEY_REQUIRED" }, { status: 400 });
  }
  const existing = await previouslySucceeded(env, "VOID_AUTHORIZATION", idempotencyKey);
  if (existing) {
    return json({ ok: true, idempotent: true, status: "VOIDED / RELEASED" });
  }
  const row = await getAuthorizationById(env, authId);
  if (!row || (!row.paypal_authorization_id && !row.square_payment_id)) {
    return json({ ok: false, error: "AUTHORIZATION_NOT_FOUND" }, { status: 404 });
  }
  if (row.authorization_status !== "AUTHORIZED") {
    return json({ ok: false, error: "AUTHORIZATION_NOT_VOIDABLE", current_status: row.authorization_status }, { status: 409 });
  }
  const response = row.provider === "square"
    ? await squareFetch(env, `/v2/payments/${encodeURIComponent(row.square_payment_id)}/cancel`, { method: "POST", body: "{}" })
    : await paypalFetch(env, `/v2/payments/authorizations/${encodeURIComponent(row.paypal_authorization_id)}/void`, { method: "POST", headers: { "PayPal-Request-Id": idempotencyKey }, body: "{}" });
  await env.DB.prepare(
    `UPDATE paypal_authorizations SET authorization_status = ?, paypal_status = ?, updated_at = ? WHERE id = ?`
  ).bind("VOIDED / RELEASED", response.status || "VOIDED", nowIso(), row.id).run();
  await audit(env, {
    authorization_id: row.id,
    paypal_authorization_id: row.paypal_authorization_id,
    action: row.provider === "square" ? "SQUARE_CANCEL_PAYMENT" : "VOID_AUTHORIZATION",
    actor: adminActor(request),
    idempotency_key: idempotencyKey,
    request_payload: { confirm: true },
    response_payload: response,
    result_status: "SUCCESS"
  });
  await insertEvent(env, {
    authorization_id: row.id,
    paypal_order_id: row.paypal_order_id,
    paypal_authorization_id: row.paypal_authorization_id,
    event_type: "AUTHORIZATION_VOIDED",
    event_status: response.status || "VOIDED",
    payload: response
  });
  await notifyInfoOnce(env, { ...row, authorization_status: "VOIDED / RELEASED" }, "RELEASED");
  return json({ ok: true, status: "VOIDED / RELEASED", provider: row.provider || "paypal", response });
}

async function captureAuthorization(request, env, authId) {
  if (!requireAdmin(request, env)) {
    return json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }
  const body = await readJson(request);
  const amount = Number(body.amount);
  const c = config(env);
  if (body.confirm !== true || body.confirmation_text !== `You are about to charge JPY ${amount.toLocaleString("en-US")} from this authorization.`) {
    return json({ ok: false, error: "SECOND_CONFIRMATION_REQUIRED" }, { status: 400 });
  }
  if (!Number.isInteger(amount) || amount <= 0 || amount > c.amount) {
    return json({ ok: false, error: "INVALID_CAPTURE_AMOUNT" }, { status: 400 });
  }
  const idempotencyKey = body.idempotency_key;
  if (!idempotencyKey) {
    return json({ ok: false, error: "IDEMPOTENCY_KEY_REQUIRED" }, { status: 400 });
  }
  const existing = await previouslySucceeded(env, "CAPTURE_AUTHORIZATION", idempotencyKey);
  if (existing) {
    return json({ ok: true, idempotent: true, status: "CAPTURED" });
  }
  const row = await getAuthorizationById(env, authId);
  if (!row || (!row.paypal_authorization_id && !row.square_payment_id)) {
    return json({ ok: false, error: "AUTHORIZATION_NOT_FOUND" }, { status: 404 });
  }
  if (row.authorization_status !== "AUTHORIZED") {
    return json({ ok: false, error: "AUTHORIZATION_NOT_CAPTURABLE", current_status: row.authorization_status }, { status: 409 });
  }
  if (row.provider === "square" && amount !== Number(row.amount)) {
    return json({ ok: false, error: "SQUARE_FULL_CAPTURE_ONLY", required_amount: Number(row.amount) }, { status: 400 });
  }
  const payload = {
    amount: {
      currency_code: row.currency,
      value: String(amount)
    },
    final_capture: amount >= row.amount
  };
  const response = row.provider === "square"
    ? await squareFetch(env, `/v2/payments/${encodeURIComponent(row.square_payment_id)}/complete`, { method: "POST", body: JSON.stringify({}) })
    : await paypalFetch(env, `/v2/payments/authorizations/${encodeURIComponent(row.paypal_authorization_id)}/capture`, { method: "POST", headers: { "PayPal-Request-Id": idempotencyKey }, body: JSON.stringify(payload) });
  const nextStatus = payload.final_capture ? "CAPTURED" : "PARTIALLY_CAPTURED";
  await env.DB.prepare(
    `UPDATE paypal_authorizations SET authorization_status = ?, paypal_status = ?, updated_at = ? WHERE id = ?`
  ).bind(nextStatus, response.status || nextStatus, nowIso(), row.id).run();
  await audit(env, {
    authorization_id: row.id,
    paypal_authorization_id: row.paypal_authorization_id,
    action: row.provider === "square" ? "SQUARE_COMPLETE_PAYMENT" : "CAPTURE_AUTHORIZATION",
    actor: adminActor(request),
    amount,
    currency: row.currency,
    idempotency_key: idempotencyKey,
    request_payload: payload,
    response_payload: response,
    result_status: "SUCCESS"
  });
  await insertEvent(env, {
    authorization_id: row.id,
    paypal_order_id: row.paypal_order_id,
    paypal_authorization_id: row.paypal_authorization_id,
    event_type: "AUTHORIZATION_CAPTURED",
    event_status: response.status || nextStatus,
    payload: response
  });
  await notifyInfoOnce(env, { ...row, authorization_status: nextStatus }, "CAPTURED");
  return json({ ok: true, status: nextStatus, provider: row.provider || "paypal", response });
}

async function verifyWebhook(env, request, body) {
  const c = requireServerConfig(env);
  if (!c.webhookId) {
    throw new Error("PAYPAL_WEBHOOK_ID is required for webhook verification");
  }
  return await paypalFetch(env, "/v1/notifications/verify-webhook-signature", {
    method: "POST",
    body: JSON.stringify({
      auth_algo: request.headers.get("paypal-auth-algo"),
      cert_url: request.headers.get("paypal-cert-url"),
      transmission_id: request.headers.get("paypal-transmission-id"),
      transmission_sig: request.headers.get("paypal-transmission-sig"),
      transmission_time: request.headers.get("paypal-transmission-time"),
      webhook_id: c.webhookId,
      webhook_event: body
    })
  });
}

async function handleWebhook(request, env) {
  const body = await readJson(request);
  const eventId = body.id;
  const eventType = body.event_type;
  if (!eventId || !eventType) {
    return json({ ok: false, error: "INVALID_WEBHOOK" }, { status: 400 });
  }
  const existing = await env.DB.prepare(
    `SELECT paypal_event_id FROM paypal_webhook_events WHERE paypal_event_id = ?`
  ).bind(eventId).first();
  if (existing) {
    return json({ ok: true, duplicate: true });
  }
  let verificationStatus = "FAILED";
  try {
    const verification = await verifyWebhook(env, request, body);
    verificationStatus = verification.verification_status || "FAILED";
  } catch (error) {
    await env.DB.prepare(
      `INSERT INTO paypal_webhook_events
       (paypal_event_id, event_type, transmission_id, verification_status, processed_status, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(eventId, eventType, request.headers.get("paypal-transmission-id"), "FAILED", "NOT_PROCESSED", JSON.stringify(body), nowIso()).run();
    return json({ ok: false, error: "WEBHOOK_VERIFICATION_FAILED" }, { status: 400 });
  }
  if (verificationStatus !== "SUCCESS") {
    await env.DB.prepare(
      `INSERT INTO paypal_webhook_events
       (paypal_event_id, event_type, transmission_id, verification_status, processed_status, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(eventId, eventType, request.headers.get("paypal-transmission-id"), verificationStatus, "NOT_PROCESSED", JSON.stringify(body), nowIso()).run();
    return json({ ok: false, error: "WEBHOOK_VERIFICATION_FAILED" }, { status: 400 });
  }

  let processed = "IGNORED";
  if (WEBHOOK_EVENTS.has(eventType)) {
    const resource = body.resource || {};
    const paypalAuthorizationId = resource.id || resource.supplementary_data?.related_ids?.authorization_id || null;
    const paypalOrderId = resource.supplementary_data?.related_ids?.order_id || null;
    let row = paypalAuthorizationId ? await getAuthorizationById(env, paypalAuthorizationId) : null;
    if (!row && paypalOrderId) row = await getAuthorizationByOrder(env, paypalOrderId);
    if (row) {
      const statusMap = {
        "PAYMENT.AUTHORIZATION.CREATED": "AUTHORIZED",
        "PAYMENT.AUTHORIZATION.VOIDED": "VOIDED / RELEASED",
        "PAYMENT.CAPTURE.COMPLETED": "CAPTURED",
        "PAYMENT.CAPTURE.DENIED": "CAPTURE_DENIED",
        "PAYMENT.CAPTURE.REFUNDED": "CAPTURE_REFUNDED",
        "CHECKOUT.ORDER.APPROVED": "ORDER_APPROVED"
      };
      await env.DB.prepare(
        `UPDATE paypal_authorizations SET authorization_status = ?, paypal_status = ?, updated_at = ? WHERE id = ?`
      ).bind(statusMap[eventType] || row.authorization_status, resource.status || eventType, nowIso(), row.id).run();
      await insertEvent(env, {
        authorization_id: row.id,
        paypal_order_id: row.paypal_order_id,
        paypal_authorization_id: row.paypal_authorization_id,
        event_type: eventType,
        event_status: resource.status || null,
        payload: body
      });
      const notifyEvent = {"PAYMENT.AUTHORIZATION.CREATED":"AUTHORIZED","PAYMENT.AUTHORIZATION.VOIDED":"RELEASED","PAYMENT.CAPTURE.COMPLETED":"CAPTURED"}[eventType];
      if (notifyEvent) await notifyInfoOnce(env, { ...row, authorization_status: statusMap[eventType] }, notifyEvent);
      processed = "PROCESSED";
    }
  }

  await env.DB.prepare(
    `INSERT INTO paypal_webhook_events
     (paypal_event_id, event_type, transmission_id, verification_status, processed_status, payload, created_at, processed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(eventId, eventType, request.headers.get("paypal-transmission-id"), verificationStatus, processed, JSON.stringify(body), nowIso(), nowIso()).run();
  return json({ ok: true, processed_status: processed });
}

function customerPage(env) {
  const c = config(env);
  return html(`<!doctype html>
<html lang="en" translate="no">
<head>
  <meta charset="utf-8">
  <meta name="google" content="notranslate">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Authorize Card | Private Fishing Charter</title>
  <style>
    body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#06101d;color:#fff;margin:0;line-height:1.6}
    main{max-width:760px;margin:0 auto;padding:32px 18px 56px}
    .card{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:24px}
    h1{font-size:2rem;line-height:1.1;margin:0 0 12px}
    .fact{display:grid;grid-template-columns:160px 1fr;gap:8px;padding:10px 0;border-top:1px solid rgba(255,255,255,.08)}
    .fact strong{color:#00b4c8}
    .notice{background:rgba(200,164,74,.12);border:1px solid rgba(200,164,74,.35);border-radius:12px;padding:16px;margin:18px 0}
    label{display:flex;gap:10px;align-items:flex-start;margin:18px 0}
    input[type=checkbox]{margin-top:5px}
    button{background:#c8a44a;color:#06101d;border:0;border-radius:8px;padding:12px 16px;font-weight:800;min-height:46px;cursor:pointer}
    button:disabled{opacity:.45;cursor:not-allowed}
    #paypal-buttons{margin-top:18px}
    .status{white-space:pre-wrap;background:rgba(0,0,0,.25);border-radius:8px;padding:12px;margin-top:18px}
    @media(max-width:520px){.fact{grid-template-columns:1fr}main{padding:22px 14px}.card{padding:18px}}
  </style>
</head>
<body>
<main>
  <div class="card">
    <h1>Card Authorization</h1>
    <p>This is a PayPal card authorization for your activity. It is not an immediate charge.</p>
    <div class="fact"><strong>Activity</strong><span>${escapeHtml(c.product)}</span></div>
    <div class="fact"><strong>Date</strong><span>${escapeHtml(c.activityDate)}</span></div>
    <div class="fact"><strong>Authorized amount</strong><span>${escapeHtml(c.currency)} ${c.amount.toLocaleString("en-US")}</span></div>
    <div class="fact"><strong>Policy version</strong><span>${escapeHtml(c.policyVersion)}</span></div>
    <div class="notice">
      <p>Your card will be authorized for JPY 66,000, but you will not be charged at this time.</p>
      <p>The hold amount covers the charter fee plus any gear rental stated in your confirmation email. Nothing is charged unless you do not show up.</p>
      <p>If you participate as scheduled, the authorization will be released.</p>
      <p>If you cancel or do not attend, the applicable cancellation fee may be charged according to the cancellation policy you agreed to.</p>
      <p>If the operator cancels due to weather or unsafe sea conditions, the authorization will be released without charge.</p>
    </div>
    <label>
      <input id="agree" type="checkbox">
      <span>I understand and agree to the authorization and cancellation policy.</span>
    </label>
    <div id="paypal-buttons" class="notranslate"></div>
    <div id="paypal-card-buttons" class="notranslate"></div>
    <div id="status" class="status" hidden></div>
  </div>
</main>
<script>
const cfg = ${JSON.stringify({
  clientId: c.clientId || "",
  currency: c.currency,
  policyVersion: c.policyVersion,
  amount: c.amount,
  paypalJsBase: c.jsBase
})};
const statusBox = document.getElementById('status');
function show(message) { statusBox.hidden = false; statusBox.textContent = message; }
document.getElementById('agree').addEventListener('change', (event) => {
  if (event.target.checked) statusBox.hidden = true;
});
(() => {
  if (!cfg.clientId) { show('PayPal sandbox client ID is not configured yet.'); return; }
  const sdk = document.createElement('script');
  sdk.src = cfg.paypalJsBase + '?client-id=' + encodeURIComponent(cfg.clientId) + '&currency=' + encodeURIComponent(cfg.currency) + '&intent=authorize&components=buttons&enable-funding=card&locale=en_US';
  sdk.onload = () => { renderButtons(); };
  sdk.onerror = () => show('Failed to load PayPal. Please contact us.');
  setTimeout(() => show("Card form didn't load — use the PayPal button or open in Safari"), 8000);
  document.head.appendChild(sdk);
})();
function renderButtons() {
  let cardTimer;
  const agreement = document.getElementById('agree');
  const shared = {
    onClick: (data, actions) => {
      if (agreement && !agreement.checked) {
        show('Please agree to the hold and the cancellation policy first.');
        return actions.reject();
      }
      return actions.resolve();
    },
    createOrder: async () => {
      const res = await fetch('/api/paypal/create-order', {
        method: 'POST',
        headers: {'content-type':'application/json'},
        body: JSON.stringify({
          accepted_policy: true,
          policy_version: cfg.policyVersion,
          idempotency_key: crypto.randomUUID()
        })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to create authorization order');
      return data.paypal_order_id;
    },
    onApprove: async (data) => {
      const res = await fetch('/api/paypal/authorize-order', {
        method: 'POST',
        headers: {'content-type':'application/json'},
        body: JSON.stringify({ order_id: data.orderID, idempotency_key: 'authorize-' + data.orderID })
      });
      const result = await res.json();
      if (!res.ok || !result.ok) throw new Error(result.error || 'Authorization failed');
      show('Hold placed ✓ — we\\'ll be in touch shortly\\nThis page is safe to close.');
    },
    onError: (err) => show('Authorization failed. Please contact us.\\n' + (err && err.message ? err.message : err))
  };
  paypal.Buttons({...shared, fundingSource: paypal.FUNDING.PAYPAL, style: {color: 'gold'}}).render('#paypal-buttons');
  paypal.Buttons({...shared, fundingSource: paypal.FUNDING.CARD, style: {color: 'black'}, onClick: (data, actions) => {
    if (agreement && !agreement.checked) {
      show('Please agree to the hold and the cancellation policy first.');
      return actions.reject();
    }
    clearTimeout(cardTimer);
    cardTimer = setTimeout(() => show("Card form didn't load — use the PayPal button or open in Safari"), 8000);
    return actions.resolve();
  }}).render('#paypal-card-buttons');
}
</script>
</body>
</html>`);
}

async function customerPageForOrderLegacy(request, env, orderId) {
  const row = await getAuthorizationByOrder(env, orderId);
  if (!row) return json({ ok: false, error: "ORDER_NOT_FOUND" }, { status: 404 });
  const c = config(env);
  const brand = brandConfig(row.brand);
  const cfg = { clientId: c.clientId || "", currency: row.currency, policyVersion: row.policy_version,
    amount: row.amount, activity: row.activity, activityDate: row.activity_date, orderId, paypalJsBase: c.jsBase,
    squareApplicationId: c.squareApplicationId || "", squareLocationId: c.squareLocationId || "", squareJsBase: c.squareJsBase,
    shortCode: row.short_code || "",
    brand: brand.key, brandName: brand.name, brandTitle: brand.title, brandAccent: brand.accent,
    brandBackground: brand.background, returnUrl: brand.returnUrl };
  const holdAmount = `${row.currency} ${Number(row.amount).toLocaleString("en-US")}`;
  const policyUrl = brand.key === "snorkel" ? "https://snorkel.nice.okinawa/#how-booking-works" : "https://fishing.nice.okinawa/#booking";
  const policyBlock = `<div class="notice"><ul><li>Nothing is charged today. PayPal or Square places a temporary hold of ${escapeHtml(holdAmount)} on your card — that's all.</li><li>Join the trip as planned and we release the hold the same day. If the captain cancels for weather, we release it in full.</li><li>Only a late cancellation or no-show may be charged, according to our <a href="${escapeHtml(policyUrl)}" target="_blank" rel="noopener">cancellation policy</a>.</li></ul></div>`;
  return html(`<!doctype html><html lang="en" translate="no"><head><meta charset="utf-8"><meta name="google" content="notranslate"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' https://www.paypal.com https://sandbox.web.squarecdn.com https://web.squarecdn.com; frame-src https://*.paypal.com https://*.paypalobjects.com; connect-src 'self' https://*.paypal.com https://*.paypalobjects.com https://*.squareup.com https://*.squareupsandbox.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:"><title>${escapeHtml(brand.title)} | ${escapeHtml(row.activity)}</title><style>:root{--accent:${brand.accent};--background:${brand.background}}body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:var(--background);color:#fff;margin:0;line-height:1.6}main{max-width:760px;margin:auto;padding:32px 18px}.brand{color:var(--accent);font-weight:800;letter-spacing:.04em;text-transform:uppercase;font-size:.8rem}.card{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.16);border-radius:16px;padding:24px}.fact{display:grid;grid-template-columns:160px 1fr;gap:8px;padding:10px 0;border-top:1px solid rgba(255,255,255,.1)}.fact strong{color:var(--accent)}.notice{background:rgba(200,164,74,.12);border:1px solid rgba(200,164,74,.35);border-radius:12px;padding:16px;margin:18px 0}.notice ul{margin:0;padding-left:20px}.notice a{color:#14b8c4;text-decoration:underline;text-underline-offset:2px}.notice a:hover,.notice a:active{color:#67e8f9}.pay-choice,.square-note{color:rgba(255,255,255,.78);margin:12px 0}button{background:#c8a44a;color:#06101d;border:0;border-radius:8px;padding:12px 16px;font-weight:800;min-height:46px}button:disabled{opacity:.45}.square{margin-top:24px;padding-top:18px;border-top:1px solid rgba(255,255,255,.1);transition:box-shadow .2s,border-color .2s,background .2s}.square.square-highlight{background:rgba(200,164,74,.1);border:1px solid rgba(200,164,74,.55);border-radius:12px;padding:18px;box-shadow:0 0 0 3px rgba(200,164,74,.16)}.status{white-space:pre-wrap;background:rgba(0,0,0,.25);border-radius:8px;padding:12px;margin-top:18px}.safe-close{color:rgba(255,255,255,.68);font-size:.9rem}footer{max-width:760px;margin:auto;padding:0 18px 28px;color:rgba(255,255,255,.65)}footer a{color:var(--accent)}@media(max-width:520px){.fact{grid-template-columns:1fr}}</style></head><body><main><!-- 07 v2 spec: two payment-channel guidance; PayPal and Square place the same temporary hold without charging today. --><div class="card"><div class="brand">${escapeHtml(brand.name)}</div><h1>${escapeHtml(brand.title)}</h1><p>Your card will be authorized, not charged immediately.</p><div class="fact"><strong>Activity</strong><span>${escapeHtml(row.activity)}</span></div><div class="fact"><strong>Date</strong><span>${escapeHtml(row.activity_date)}</span></div><div class="fact"><strong>Authorized amount</strong><span>${escapeHtml(holdAmount)}</span></div>${policyBlock}<label><input id="agree" type="checkbox" data-legacy-policy-copy="I understand and agree to the authorization and cancellation policy"> I agree to the hold and the cancellation policy.</label><p class="pay-choice">Pay with PayPal, or scroll down to pay by card — same hold either way.</p><div id="paypal-status" class="status" hidden></div><div id="paypal-buttons" class="notranslate"></div><div id="paypal-card-buttons" class="notranslate"></div><div class="square notranslate"><h2>Pay by card (Square)</h2><p class="square-note">Card not working with PayPal? Use this form — processed securely by Square.</p><p id="square-status">Secure card form loading…</p><div id="square-card-container"></div><button id="square-pay" disabled>Authorize card securely</button></div><div id="status" class="status" hidden></div></div></main><footer><a href="${escapeHtml(brand.returnUrl)}">Return to ${escapeHtml(brand.name)}</a></footer><script>
const cfg=${JSON.stringify(cfg)}; const box=document.getElementById('status'); const show=m=>{box.hidden=false;box.textContent=m};
document.getElementById('agree').onchange=e=>{};
  let cardTimer;
  {const s=document.createElement('script');s.src=cfg.paypalJsBase+'?client-id='+encodeURIComponent(cfg.clientId)+'&currency='+encodeURIComponent(cfg.currency)+'&intent=authorize&components=buttons&enable-funding=card&locale=en_US';s.onload=render;s.onerror=()=>show('Failed to load PayPal. Please contact us.');setTimeout(()=>show("Card form didn't load — use the PayPal button or open in Safari"),8000);document.head.appendChild(s)}
  function render(){const agree=document.getElementById('agree');const shared={onClick:(data,actions)=>{if(agree&&!agree.checked){show('Please agree to the hold and the cancellation policy first.');return actions.reject()}return actions.resolve()},createOrder:()=>Promise.resolve(cfg.orderId),onApprove:async data=>{clearTimeout(cardTimer);const r=await fetch('/api/paypal/authorize-order',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({order_id:data.orderID,accepted_policy:true,policy_version:cfg.policyVersion,idempotency_key:'authorize-'+data.orderID})});const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||'Authorization failed');show('AUTHORIZED – NOT CHARGED\\nAuthorization ID: '+(d.paypal_authorization_id||d.square_payment_id)+'\\nExpiration: '+(d.authorization_expiration_time||''))},onError:e=>show('Authorization failed. Please contact us.\\n'+(e&&e.message||e))};paypal.Buttons({...shared,fundingSource:paypal.FUNDING.PAYPAL,style:{color:'gold'}}).render('#paypal-buttons');paypal.Buttons({...shared,fundingSource:paypal.FUNDING.CARD,style:{color:'black'},onClick:(data,actions)=>{if(agree&&!agree.checked){show('Please agree to the hold and the cancellation policy first.');return actions.reject()}clearTimeout(cardTimer);cardTimer=setTimeout(()=>show("Card form didn't load — use the PayPal button or open in Safari"),8000);return actions.resolve()}}).render('#paypal-card-buttons')}
  (async()=>{const status=document.getElementById('square-status');const button=document.getElementById('square-pay');const timeout=setTimeout(()=>{status.textContent="Card form didn't load — use the PayPal button or open in Safari"},8000);try{if(!cfg.squareApplicationId||!cfg.squareLocationId){throw new Error('Square is not configured');}const s=document.createElement('script');s.src=cfg.squareJsBase;s.onload=async()=>{try{const payments=window.Square.payments(cfg.squareApplicationId,cfg.squareLocationId);const card=await payments.card();await card.attach('#square-card-container');clearTimeout(timeout);status.textContent='Card details are handled securely by Square.';button.disabled=false;button.onclick=async()=>{button.disabled=true;const token=await card.tokenize();if(token.status!=='OK')throw new Error('Card verification failed');const r=await fetch('/api/square/create-payment',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({order_id:cfg.orderId,source_id:token.token,accepted_policy:true,policy_version:cfg.policyVersion})});const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||'Square authorization failed');show('AUTHORIZED – NOT CHARGED\\nSquare payment ID: '+d.square_payment_id);};}catch(e){status.textContent="Card form didn't load — use the PayPal button or open in Safari";}};s.onerror=()=>{clearTimeout(timeout);status.textContent="Card form didn't load — use the PayPal button or open in Safari"};document.head.appendChild(s)})()
</script></body></html>`);
}

// Keep the PayPal and Square embeds isolated while allowing each provider's iframe hosts.
async function customerPageForOrder(request, env, orderId) {
  const row = await getAuthorizationByOrder(env, orderId);
  if (!row) return json({ ok: false, error: "ORDER_NOT_FOUND" }, { status: 404 });
  const c = config(env);
  const brand = brandConfig(row.brand);
  const isSnorkel = brand.key === "snorkel";
  const shortCode = row.short_code || "";
  const brandLabel = isSnorkel ? "Snorkel Okinawa" : "Fishing Okinawa";
  const tripNoun = isSnorkel ? "tour" : "trip";
  const cancellationActor = isSnorkel ? "we cancel" : "the captain cancels";
  const amountText = `${row.currency} ${Number(row.amount).toLocaleString("en-US")}`;
  const squareAvailable = !row.activity_date || Number.isNaN(Date.parse(row.activity_date)) || Date.parse(row.activity_date) <= Date.now() + (7 * 86400000);
  const displayActivity = isSnorkel ? String(row.activity || "").replace(/fishing/gi, "marine activity") : row.activity;
  const policyUrl = isSnorkel ? "https://snorkel.nice.okinawa/#how-booking-works" : "https://fishing.nice.okinawa/#booking";
  const guestName = String(row.guest_name || "").trim();
  const participants = String(row.headcount || row.participants || "").trim();
  const snorkelGuests = participants ? ` for ${escapeHtml(participants)} guests` : "";
  const supportNote = isSnorkel
    ? `The hold covers the tour fee${snorkelGuests}. Snorkel gear and life jackets are included.`
    : "The hold covers the charter fee and any gear rental listed in your confirmation email.";
  const status = String(row.authorization_status || "ORDER_CREATED");
  const cfg = { clientId: c.clientId || "", currency: row.currency, policyVersion: row.policy_version,
    amount: row.amount, activity: displayActivity, activityDate: row.activity_date, orderId, paypalJsBase: c.jsBase,
    squareApplicationId: c.squareApplicationId || "", squareLocationId: c.squareLocationId || "", squareJsBase: c.squareJsBase,
    shortCode, brand: brand.key, brandName: brand.name, brandTitle: brand.title, brandAccent: brand.accent,
    brandBackground: brand.background, returnUrl: brand.returnUrl };
  const pageCss = `:root{--blue:#0060B4;--sky:#009CD8;--cyan:#00B4C0;--mint:#3CC090;--soft:#F2F8FA;--text:#1F2A37;--muted:#526170;--line:#D8E7EE;--card:#FFFFFF}*{box-sizing:border-box}body{margin:0;background:var(--soft);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.55}.auth-page{max-width:600px;margin:0 auto;padding:22px 16px 28px}.auth-shell{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:24px;box-shadow:0 18px 44px rgba(31,42,55,.08)}.top{text-align:center;margin-bottom:20px}.logo-text{font-weight:900;letter-spacing:.02em;color:var(--blue);font-size:1.1rem}.brand-sub{margin-top:4px;color:var(--muted);font-size:.88rem}.eyebrow{display:inline-flex;align-items:center;justify-content:center;margin:2px 0 14px;padding:6px 12px;border-radius:999px;background:rgba(60,192,144,.14);color:#13795b;font-size:.76rem;font-weight:900;letter-spacing:.08em}.auth-shell h1{margin:0 0 10px;text-align:center;color:var(--blue);font-size:2rem;line-height:1.12}.lead{margin:0 auto 18px;max-width:520px;text-align:center;color:#344353}.order-card,.trust-card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:16px;margin:18px 0}.order-row{display:flex;justify-content:space-between;gap:16px;padding:9px 0;border-top:1px solid #edf4f7}.order-row:first-child{border-top:0}.order-row strong{color:#526170;font-size:.84rem}.order-row span{text-align:right;font-weight:750}.next{margin:22px 0}.next h2,.pay-block h2{margin:0 0 12px;color:var(--text);font-size:1.2rem}.check-list{list-style:none;margin:0;padding:0;display:grid;gap:10px}.check-list li{position:relative;padding-left:30px}.check-list li::before{content:"✓";position:absolute;left:0;top:0;color:var(--mint);font-weight:900}.fine-print{margin:12px 0 0;color:var(--muted);font-size:.9rem}.agree{display:flex;gap:10px;align-items:flex-start;margin:18px 0;color:#263443;font-weight:650}.agree input{margin-top:5px}.agree a,.notice-link{color:#00B4C0;text-decoration:underline;text-underline-offset:2px}.agree a:hover,.agree a:active,.notice-link:hover,.notice-link:active{color:#009CD8}.pay-block{margin-top:20px}.or-card{margin:10px 0 14px;text-align:center;color:var(--muted);font-size:.9rem}.square{border-top:1px solid var(--line);padding-top:18px;transition:background .2s,border-color .2s,box-shadow .2s}.square.square-highlight{background:rgba(0,180,192,.08);border:1px solid rgba(0,180,192,.35);border-radius:16px;padding:18px;box-shadow:0 0 0 4px rgba(0,180,192,.12)}.square h3{margin:0 0 8px;color:var(--text);font-size:1.05rem}.processor-note{margin:8px 0 12px;color:var(--muted);font-size:.86rem}.status{white-space:pre-wrap;background:#eef7fb;border:1px solid var(--line);border-radius:12px;padding:12px;margin-top:12px;color:#264052}button{appearance:none;border:0;border-radius:12px;background:var(--blue);color:#fff;font-weight:850;padding:13px 16px;min-height:48px}button:disabled{opacity:.5}.square button{margin-top:14px}.trust-card{color:#334155}.trust-card p{margin:8px 0}.footer{text-align:center;color:var(--muted);font-size:.82rem;margin:18px 0 0}.safe-close{color:var(--muted);font-size:.92rem}.booking-ref{font-weight:750}.confirmation-card h1{text-align:left}.status-pill{display:inline-flex;border-radius:999px;background:rgba(0,96,180,.1);color:var(--blue);font-weight:900;padding:7px 12px;font-size:.78rem;letter-spacing:.04em}@media(max-width:430px){.auth-page{padding:16px 12px}.auth-shell{padding:20px 16px;border-radius:18px}.auth-shell h1{font-size:1.75rem}.order-row{display:block}.order-row span{display:block;text-align:left;margin-top:2px}}`;
  const shellTop = `<div class="top"><div class="logo-text">Okinawa Private Tour</div><div class="brand-sub">${escapeHtml(brandLabel)}</div></div>`;
  const orderRows = [
    ["Booking reference", shortCode],
    guestName ? ["Guest", guestName] : null,
    ["Activity", displayActivity],
    ["Date", row.activity_date],
    participants ? ["Participants", participants] : null,
    ["Temporary authorization — no charge today", amountText]
  ].filter(Boolean).map(([label, value]) => `<div class="order-row"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></div>`).join("");
  const terminalMessage = status === "VOIDED / RELEASED" || status === "RELEASED"
    ? "This hold has been released — nothing was charged."
    : status === "CAPTURED"
      ? "This authorization was captured according to the cancellation policy."
      : status === "CANCELLED"
        ? "This booking authorization was cancelled — nothing was charged."
        : "This authorization is no longer available for payment.";
  const authorizedBody = `<main class="auth-page"><section class="auth-shell confirmation-card">${shellTop}<span class="status-pill">${escapeHtml(status || "STATUS UPDATED")}</span><h1>Hold placed ✓ — we'll be in touch shortly</h1><p>We've placed a temporary hold of ${escapeHtml(amountText)} on your card for ${escapeHtml(displayActivity)} on ${escapeHtml(row.activity_date)}. Nothing has been charged.</p><h2>What happens next:</h2><ul><li>We'll contact you shortly to double-check the details.</li><li>Please also send us a quick message to say you've completed this step — it helps us move faster.</li><li>Once everything is confirmed, you'll receive our confirmation email. That email is your booking.</li><li>After the trip, the hold is released the same day (your bank may take a few days to show it).</li></ul><p class="booking-ref">Booking reference ${escapeHtml(shortCode)} · WhatsApp +81 70-8952-3968 · info@nice.okinawa</p><p class="safe-close">This page is safe to close.</p></section><footer class="footer">© CATALINA JAPAN K.K. · Okinawa Private Tour</footer></main>`;
  const terminalBody = `<main class="auth-page"><section class="auth-shell confirmation-card">${shellTop}<span class="status-pill">${escapeHtml(status || "STATUS UPDATED")}</span><h1>Booking status</h1><p>${escapeHtml(terminalMessage)}</p><p>Activity: ${escapeHtml(displayActivity)} · ${escapeHtml(row.activity_date)}</p><p class="booking-ref">Booking reference ${escapeHtml(shortCode)} · WhatsApp +81 70-8952-3968 · info@nice.okinawa</p><p class="safe-close">This page is safe to close.</p></section><footer class="footer">© CATALINA JAPAN K.K. · Okinawa Private Tour</footer></main>`;
  const statusBody = status === "AUTHORIZED" ? authorizedBody : terminalBody;
  const squareBlock = squareAvailable ? '<p class="or-card">or pay by card below</p><div class="square notranslate"><h3>Pay by card (Square)</h3><p id="square-status">Secure card form loading…</p><div id="square-card-container"></div><button id="square-pay" disabled>Place hold securely</button><p class="processor-note">Processed by Square. Your card details never touch our server.</p></div>' : '';
  const formBody = `<main class="auth-page">${shellTop}<h1>Secure Your Booking</h1><div class="eyebrow">NO CHARGE TODAY</div><p class="lead">To confirm your reservation, PayPal or Square will place a temporary hold of ${escapeHtml(amountText)} on your card. This is not a payment — nothing is collected today.</p><div class="order-card">${orderRows}</div><section class="next"><h2>What happens next</h2><ul class="check-list"><li>Join the ${escapeHtml(tripNoun)} as scheduled and we release the full hold the same day. No payment is taken.</li><li>If ${escapeHtml(cancellationActor)} for weather or sea conditions, we release it in full.</li><li>Only a late cancellation or no-show may be charged, up to the hold amount, per our cancellation policy.</li></ul><p class="fine-print">${supportNote}</p><p class="fine-print">After release, your bank may take a few days to remove the pending hold.</p></section><label class="agree"><input id="agree" type="checkbox" data-legacy-policy-copy="I understand and agree to the authorization and cancellation policy"><span>I agree to the hold and the <a href="${escapeHtml(policyUrl)}" target="_blank" rel="noopener">cancellation policy</a></span></label><section class="pay-block"><h2>Pay securely</h2><div id="paypal-buttons" class="notranslate"></div><div id="paypal-card-buttons" class="notranslate"></div><p class="processor-note">Processed by PayPal. Your card details never touch our server.</p>${squareBlock}<div id="paypal-status" class="status" hidden></div><div id="status" class="status" hidden></div></section><section class="trust-card"><p>Every trip is run by a licensed local captain or guide we work with regularly.</p><p>Booking & English support: Wan · WhatsApp +81 70-8952-3968 · info@nice.okinawa</p><p>CATALINA JAPAN K.K. · Est. 2015 · 3-25-2 Maejima, Naha, Okinawa, Japan</p></section><footer class="footer">© CATALINA JAPAN K.K. · Okinawa Private Tour</footer></main><textarea id="authorize-config" hidden>${escapeHtml(JSON.stringify({...cfg, squareAvailable}))}</textarea><script src="/assets/authorize-page.js" defer></script>`;
  const formBodyWithShell = formBody.replace('<main class="auth-page">', '<main class="auth-page"><section class="auth-shell">').replace('</footer></main>', '</footer></section></main>');
  const body = status === "ORDER_CREATED" ? formBodyWithShell : statusBody;
  return html(`<!doctype html><html lang="en" translate="no"><head><meta charset="utf-8"><meta name="google" content="notranslate"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Secure your booking · ${escapeHtml(brand.name)}</title><style>${pageCss}</style></head><body>${body}</body></html>`, { status: 200, headers: {
    "content-security-policy-report-only": customerReportOnlyHeaders()
  } });
}

function customerReportOnlyHeaders() {
  return "default-src 'self'; script-src 'self' https://www.paypal.com https://*.paypal.com https://*.paypalobjects.com https://*.squarecdn.com; frame-src 'self' https://*.paypal.com https://*.paypalobjects.com https://*.squarecdn.com https://*.squareup.com https://pci-connect.squareup.com https://pci-connect.squareupsandbox.com; connect-src 'self' https://*.paypal.com https://*.paypalobjects.com https://*.squareup.com https://*.squareupsandbox.com https://pci-connect.squareup.com https://pci-connect.squareupsandbox.com https://*.sentry.io; style-src 'self' 'unsafe-inline' https://*.squarecdn.com https://d1g145x70srn7h.cloudfront.net; font-src 'self' data: https://*.squarecdn.com https://cash-f.squarecdn.com https://square-fonts-production-f.squarecdn.com https://d1g145x70srn7h.cloudfront.net; img-src 'self' data: https:; report-uri /__csp-report";
}

function asCustomerReportOnly(response) {
  const headers = new Headers(response.headers);
  headers.set("content-security-policy-report-only", customerReportOnlyHeaders());
  headers.delete("content-security-policy");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function adminPage() {
  return html(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>PayPal Authorizations Admin</title>
  <style>
    body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#06101d;color:#fff;margin:0;line-height:1.5}
    main{max-width:1100px;margin:0 auto;padding:28px 16px 56px}
    input,button{font:inherit}
    input{padding:10px;border-radius:8px;border:1px solid rgba(255,255,255,.2);background:#0c1b30;color:#fff}
    button{padding:10px 12px;border:0;border-radius:8px;background:#c8a44a;color:#06101d;font-weight:800;cursor:pointer}
    .row{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:16px;margin:12px 0}
    .meta{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
    .status{color:#00b4c8;font-weight:800}
    .warn{color:#e4c06a}
    .actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
    .terminal{opacity:.62;filter:grayscale(.7)}
    .group-title{margin:28px 0 8px;color:#00b4c8}
    .order-link{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:12px;word-break:break-all}
    .order-link a{color:#9feaf0}
    .client-events{margin-top:12px;border-top:1px solid rgba(255,255,255,.12);padding-top:10px}
    .client-events summary{cursor:pointer;color:#9feaf0}
    .client-event{padding:9px 0;border-bottom:1px solid rgba(255,255,255,.08);word-break:break-word}
    .client-event small{color:rgba(255,255,255,.62)}
    @media(max-width:760px){.meta{grid-template-columns:1fr}.actions{display:grid}}
  </style>
</head>
<body><main>
  <h1>PayPal Authorizations</h1>
  <p>Authorized cards are not paid. Capture only for No Show, customer cancellation, or agreed cancellation-fee cases.</p>
  <p><input id="token" type="password" placeholder="Admin token"> <button id="load">Load</button></p>
  <div class="row"><h2>New authorization order</h2><p><select id="new-brand"><option value="fishing">Fishing</option><option value="snorkel">Snorkel</option></select> <input id="new-activity" placeholder="e.g. Private Fishing Charter (full day)"> <label>Trip date（出团日期） <input id="new-date" type="date" title="Date of the trip, not a payment deadline"></label> <label>Hold amount JPY（船费+渔具） <input id="new-amount" inputmode="numeric" placeholder="Hold amount JPY（船费+渔具）"></label></p><p><input id="new-guest-name" placeholder="Guest name (optional)"> <input id="new-guest-email" type="email" placeholder="Guest email (optional)"> <button id="create">Create link</button></p><div id="new-result"></div></div>
  <div id="list"></div>
</main>
<script>
const list = document.getElementById('list');
const tokenInput = document.getElementById('token');
const operationLocks = new Set();
document.getElementById('load').onclick = load;
document.getElementById('create').onclick = createOrder;
function headers(){ return {authorization:'Bearer '+tokenInput.value, 'content-type':'application/json'}; }
async function createOrder(){
  const res=await fetch('/api/admin/orders',{method:'POST',headers:headers(),body:JSON.stringify({brand:document.getElementById('new-brand').value,activity:document.getElementById('new-activity').value,activity_date:document.getElementById('new-date').value,amount:Number(document.getElementById('new-amount').value),guest_name:document.getElementById('new-guest-name').value,guest_email:document.getElementById('new-guest-email').value,currency:'JPY',idempotency_key:'admin-'+crypto.randomUUID()})});
  const data=await res.json(); document.getElementById('new-result').innerHTML=data.ok ? '<div><a href="'+data.short_url+'">'+data.short_url+'</a> <button onclick="copyLink(\\''+data.short_url+'\\')">Copy link</button></div><div><small>Legacy link: '+data.authorize_url+'</small></div>'+(data.square_link_warning?'<p class="warn">请在出发前 7 天内发链接</p>':'') : (data.error||'Failed');
}
document.getElementById('new-date').addEventListener('change',()=>{const value=document.getElementById('new-date').value;const limit=new Date();limit.setHours(0,0,0,0);limit.setDate(limit.getDate()+7);let hint=document.getElementById('square-date-hint');if(!hint){hint=document.createElement('small');hint.id='square-date-hint';hint.className='warn';document.getElementById('new-date').parentElement.appendChild(hint)}hint.textContent=value&&new Date(value+'T00:00:00')>limit?'请在出发前 7 天内发链接':''});
async function load(){
  const res = await fetch('/api/admin/authorizations', {headers: headers()});
  const data = await res.json();
  if(!res.ok){ list.textContent = data.error || 'Failed'; return; }
  const rows=data.authorizations||[];
  const authorized=rows.filter(r=>r.authorization_status==='AUTHORIZED').sort((a,b)=>(b.days_until_expiration??-Infinity)-(a.days_until_expiration??-Infinity));
  const created=rows.filter(r=>r.authorization_status==='ORDER_CREATED');
  const terminal=rows.filter(r=>!['AUTHORIZED','ORDER_CREATED'].includes(r.authorization_status));
  list.innerHTML = group('AUTHORIZED',authorized,false)+group('ORDER_CREATED',created,false)+group('Released / Captured / Cancelled',terminal,true);
}
function group(title,rows,collapsed){ return rows.length ? '<h2 class="group-title">'+title+' ('+rows.length+')</h2>'+rows.map(r=>render(r)).join('') : ''; }
function esc(value){ return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function render(row){
  const terminal=!['AUTHORIZED','ORDER_CREATED'].includes(row.authorization_status);
  const editDateButton = terminal ? '' : '<button onclick="editDate(\\''+row.id+'\\',\\''+esc(row.activity_date)+'\\')">Edit trip date</button>';
  const honorPeriodLine = row.provider === 'square' ? '' : '<div>Honor period: '+(row.in_honor_period ? 'within first 3 days' : 'outside 3-day honor period')+'</div>';
  const actions=terminal ? '' : (row.authorization_status==='ORDER_CREATED' ? editDateButton+'<button onclick="cancelAuth(\\''+row.id+'\\')">Cancel order</button>' : (row.provider==='square' ? editDateButton+'<button onclick="releaseAuth(\\''+row.id+'\\')">Release Authorization</button><span>Square: full capture only</span><button onclick="captureAuth(\\''+row.id+'\\',\\'square\\', '+Number(row.amount)+')">Capture Authorization</button>' : editDateButton+'<button onclick="releaseAuth(\\''+row.id+'\\')">Release Authorization</button><input id="cap-'+row.id+'" inputmode="numeric" placeholder="Capture amount JPY"><button onclick="captureAuth(\\''+row.id+'\\',\\'paypal\\')">Capture Authorization</button>'));
  return '<div class="row '+(terminal?'terminal':'')+'"><h2>'+esc(row.activity)+' <small>· '+esc(row.brand)+' · '+esc(row.guest_name||'Guest name not provided')+'</small></h2>'+
    '<div class="meta">'+
    '<div>Status: <span class="status">'+esc(row.status_label)+'</span></div>'+
    '<div>Amount: '+esc(row.currency)+' '+Number(row.amount).toLocaleString('en-US')+'</div>'+
    '<div>Date: '+esc(row.activity_date)+'</div>'+
    '<div>Created: '+esc(row.created_at||'-')+'</div>'+
    '<div>Provider: '+esc(row.provider||'paypal')+'</div>'+ '<div>Authorization: '+esc(row.paypal_authorization_id||row.square_payment_id||'-')+'</div>'+
    '<div>Expires: '+esc(row.authorization_expiration_time||'-')+'</div>'+
    '<div>Days left: '+(row.days_until_expiration ?? '-')+' '+(row.reminder ? '<span class="warn">'+row.reminder+'</span>' : '')+'</div>'+
    honorPeriodLine+
    '</div>'+
    '<div class="order-link"><a href="'+esc(row.short_url||row.authorize_url)+'">'+esc(row.short_url||row.authorize_url)+'</a><button onclick="copyLink(\\''+esc(row.short_url||row.authorize_url)+'\\')">Copy link</button></div>'+
    '<div class="actions">'+actions+'</div>'+
    '<details class="client-events" data-authorization-id="'+esc(row.id)+'"><summary>客户端事件</summary><div class="client-events-list">展开后加载</div></details></div>';
}
async function copyLink(link){ try{await navigator.clipboard.writeText(link); alert('Link copied');}catch(e){alert(link);} }
document.addEventListener('toggle',function(event){
  const details=event.target;
  if(!details || details.tagName!=='DETAILS' || !details.open || details.dataset.loaded) return;
  details.dataset.loaded='1';
  const target=details.querySelector('.client-events-list');
  fetch('/api/admin/authorizations/'+encodeURIComponent(details.dataset.authorizationId)+'/client-errors',{headers:headers()})
    .then(r=>r.json().then(data=>({ok:r.ok,data})))
    .then(({ok,data})=>{
      if(!ok||!data.ok){target.textContent=data.error||'Failed to load client events';return;}
      const events=data.events||[];
      target.innerHTML=events.length?events.map(e=>'<div class="client-event"><b>'+esc(e.ts)+' · '+esc(e.stage)+'</b><div>'+esc(e.error)+'</div><small>UA: '+esc(e.user_agent||'-')+'</small></div>').join(''):'暂无客户端事件';
    }).catch(error=>{target.textContent=error.message||'Failed to load client events';});
},true);
async function cancelAuth(id){ if(!confirm('Cancel this ORDER_CREATED order? No PayPal call will be made.')) return; const key='cancel-'+id+'-'+crypto.randomUUID(); const res=await fetch('/api/admin/authorizations/'+id+'/cancel',{method:'POST',headers:headers(),body:JSON.stringify({confirm:true,idempotency_key:key})}); alert(JSON.stringify(await res.json(),null,2)); load(); }
async function editDate(id,current){ const value=prompt('Trip date (YYYY-MM-DD)',current); if(!value||value===current||!/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return; const key='date-'+id+'-'+value; const res=await fetch('/api/admin/authorizations/'+id+'/date',{method:'POST',headers:headers(),body:JSON.stringify({confirm:true,activity_date:value,idempotency_key:key})}); const data=await res.json(); alert(res.ok&&data.ok?'Trip date updated to '+value:(data.error||'Date update failed')); load(); }
async function releaseAuth(id){
  if(operationLocks.has('void-'+id)) return;
  if(!confirm('Release this authorization? This voids the authorization and does not charge the customer.')) return;
  operationLocks.add('void-'+id);
  const key = 'void-'+id+'-'+crypto.randomUUID();
  const res = await fetch('/api/admin/authorizations/'+id+'/void', {method:'POST',headers:headers(),body:JSON.stringify({confirm:true,idempotency_key:key})});
  const data = await res.json(); alert(res.ok && data.ok ? 'Released — nothing charged' : (data.error || 'Release failed')); operationLocks.delete('void-'+id); load();
}
async function captureAuth(id,provider,fullAmount){
  if(operationLocks.has('capture-'+id)) return;
  const amount = provider==='square' ? Number(fullAmount) : Number(document.getElementById('cap-'+id).value);
  const text = 'You are about to charge JPY '+amount.toLocaleString('en-US')+' from this authorization.';
  if(!amount || !confirm(text)) return;
  operationLocks.add('capture-'+id);
  const key = 'capture-'+id+'-'+amount+'-'+crypto.randomUUID();
  const res = await fetch('/api/admin/authorizations/'+id+'/capture', {method:'POST',headers:headers(),body:JSON.stringify({confirm:true,amount,confirmation_text:text,idempotency_key:key})});
  const data = await res.json(); alert(res.ok && data.ok ? 'Captured ¥'+amount.toLocaleString('en-US') : (data.error || 'Capture failed')); operationLocks.delete('capture-'+id); load();
}
</script></body></html>`);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function staticAuthorizePage() {
  return html(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PayPal Authorization</title></head><body><main style="font-family:system-ui;max-width:720px;margin:40px auto;padding:0 16px"><h1>PayPal Authorization</h1><p>This static page requires the PayPal Authorization Worker route. Open the Worker-backed URL <code>/payment/authorize</code> after sandbox deployment.</p><p><a href="/">Back to fishing.nice.okinawa</a></p></main></body></html>`);
}

async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-allow-headers": "content-type,authorization,x-admin-user",
        "access-control-max-age": "86400"
      }
    });
  }

  try {
    if (url.pathname === "/payment/authorize" && request.method === "GET") {
      const orderId = url.searchParams.get("order");
      return orderId ? await customerPageForOrder(request, env, orderId) : asCustomerReportOnly(customerPage(env));
    }
    if (url.pathname.match(/^\/p\/[A-Za-z0-9]{6}$/) && request.method === "GET") {
      const row = await getAuthorizationByShortCode(env, url.pathname.split("/").pop().toUpperCase());
      return row ? await customerPageForOrder(request, env, row.paypal_order_id) : json({ ok: false, error: "ORDER_NOT_FOUND" }, { status: 404 });
    }
    if (url.pathname === "/payment/authorize-static" && request.method === "GET") return staticAuthorizePage();
    if (url.pathname === "/assets/authorize-page.js" && request.method === "GET") {
      return new Response(AUTHORIZE_PAGE_SCRIPT, { headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "public, max-age=300" } });
    }
    if (url.pathname === "/__csp-report" && request.method === "POST") {
      const report = await request.text();
      console.log("CSP_REPORT", report.slice(0, 8000));
      return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
    }
    if (url.pathname === "/__client-error" && request.method === "POST") {
      const report = await readJson(request);
      try {
        await recordClientError(env, report);
      } catch (error) {
        console.error("CLIENT_ERROR_D1_WRITE_FAILED", error?.message || error);
      }
      console.log("CLIENT_ERROR", JSON.stringify(report).slice(0, 8000));
      return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
    }
    if (url.pathname === "/__diag" && request.method === "GET") {
      const c = config(env);
      return json({ ok: true, routes: { public: WORKER_PUBLIC_PATHS, admin: WORKER_ADMIN_PATHS, domains: WORKER_ROUTE_DOMAINS }, application_id: c.squareApplicationId || null });
    }
    if (url.pathname === "/admin/paypal-authorizations" && request.method === "GET") return adminPage();
    if (url.pathname === "/api/paypal/client-config" && request.method === "GET") {
      const c = config(env);
      return json({
        ok: true,
        paypal_env: c.paypalEnv,
        client_id_available: Boolean(c.clientId),
        client_id: c.clientId || null,
        product: c.product,
        activity_date: c.activityDate,
        amount: c.amount,
        currency: c.currency,
        policy_version: c.policyVersion,
        square_env: c.squareEnv,
        square_application_id_available: Boolean(c.squareApplicationId),
        square_location_id_available: Boolean(c.squareLocationId)
      });
    }
    if (url.pathname === "/api/paypal/create-order" && request.method === "POST") return await createOrder(request, env);
    if (url.pathname === "/api/admin/orders" && request.method === "POST") return await createAdminOrder(request, env);
    if (url.pathname === "/api/paypal/sandbox/create-authorize-test-card" && request.method === "POST") return await createOrderWithSandboxTestCard(request, env);
    if (url.pathname === "/api/paypal/authorize-order" && request.method === "POST") return await authorizeOrder(request, env, ctx);
    if (url.pathname === "/api/square/create-payment" && request.method === "POST") return await createSquarePayment(request, env, ctx);
    if (url.pathname === "/api/paypal/sandbox/authorize-test-card" && request.method === "POST") return await authorizeOrderWithSandboxTestCard(request, env, ctx);
    if (url.pathname === "/api/paypal/webhook" && request.method === "POST") return await handleWebhook(request, env);
    if (url.pathname === "/api/admin/authorizations" && request.method === "GET") return await listAuthorizations(request, env);
    const clientErrorsMatch = url.pathname.match(/^\/api\/admin\/authorizations\/([^/]+)\/client-errors$/);
    if (clientErrorsMatch && request.method === "GET") return await listClientErrors(request, env, clientErrorsMatch[1]);
    const voidMatch = url.pathname.match(/^\/api\/admin\/authorizations\/([^/]+)\/void$/);
    if (voidMatch && request.method === "POST") return await voidAuthorization(request, env, voidMatch[1]);
    const cancelMatch = url.pathname.match(/^\/api\/admin\/authorizations\/([^/]+)\/cancel$/);
    if (cancelMatch && request.method === "POST") return await cancelAuthorization(request, env, cancelMatch[1]);
    const dateMatch = url.pathname.match(/^\/api\/admin\/authorizations\/([^/]+)\/date$/);
    if (dateMatch && request.method === "POST") return await editTripDate(request, env, dateMatch[1]);
    const captureMatch = url.pathname.match(/^\/api\/admin\/authorizations\/([^/]+)\/capture$/);
    if (captureMatch && request.method === "POST") return await captureAuthorization(request, env, captureMatch[1]);
    return json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  } catch (error) {
    return json({
      ok: false,
      error: error.message || "INTERNAL_ERROR",
      paypal_status: error.status || null,
      paypal_error: error.data || null
    }, { status: error.status && error.status < 500 ? error.status : 500 });
  }
}

export default { fetch: handleRequest };
export { handleRequest, config, customerPage, adminPage };
