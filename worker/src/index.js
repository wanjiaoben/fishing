const PAYPAL_API = {
  sandbox: "https://api-m.sandbox.paypal.com",
  production: "https://api-m.paypal.com"
};

const PAYPAL_JS = {
  sandbox: "https://www.paypal.com/sdk/js",
  production: "https://www.paypal.com/sdk/js"
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
  };
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

const SHORT_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomShortCode() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return [...bytes].map(byte => SHORT_CODE_ALPHABET[byte % SHORT_CODE_ALPHABET.length]).join("");
}

async function createUniqueShortCode(env) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = randomShortCode();
    const existing = await env.DB.prepare(`SELECT id FROM paypal_authorizations WHERE short_code = ?`).bind(code).first();
    if (!existing) return code;
  }
  throw new Error("SHORT_CODE_GENERATION_FAILED");
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
  return await env.DB.prepare(
    `SELECT * FROM paypal_authorizations WHERE short_code = ?`
  ).bind(shortCode).first();
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
  const headcount = body.headcount === "" || body.headcount === null || body.headcount === undefined ? null : Number(body.headcount);
  if (!activity || !/^\d{4}-\d{2}-\d{2}$/.test(activityDate) || !Number.isInteger(amount) || amount <= 0 || currency !== "JPY" || (guestEmail && !/^\S+@\S+\.\S+$/.test(guestEmail)) || (headcount !== null && (!Number.isInteger(headcount) || headcount < 1 || headcount > 100))) {
    return json({ ok: false, error: "INVALID_ORDER_FIELDS", required: ["activity", "activity_date", "amount", "currency=JPY", "guest_name?", "guest_email?", "headcount?"] }, { status: 400 });
  }
  const localId = id("auth");
  const createdAt = nowIso();
  const orderKey = body.idempotency_key || id("admin_order");
  const shortCode = await createUniqueShortCode(env);
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
      paypal_create_response, policy_version, guest_name, guest_email, headcount, short_code, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(localId, paypalOrder.id, brand, activity, activityDate, amount, currency, "ORDER_CREATED", paypalOrder.status || null,
    JSON.stringify(paypalOrder), c.policyVersion, guestName || null, guestEmail || null, headcount, shortCode, createdAt, createdAt).run();
  await insertEvent(env, { authorization_id: localId, paypal_order_id: paypalOrder.id, event_type: "ORDER_CREATED", event_status: paypalOrder.status, payload: paypalOrder });
  return json({ ok: true, local_authorization_id: localId, paypal_order_id: paypalOrder.id,
    authorize_url: `${c.workerOrigin || new URL(request.url).origin}/p/${shortCode}`, short_code: shortCode, brand });
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

async function authorizeOrder(request, env) {
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

  return await storeAuthorizedOrder(env, row, orderId, paypalAuth);
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

async function authorizeOrderWithSandboxTestCard(request, env) {
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

  return await storeAuthorizedOrder(env, row, orderId, paypalAuth);
}

async function storeAuthorizedOrder(env, row, orderId, paypalAuth) {
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
    `SELECT id, paypal_order_id, paypal_authorization_id, brand, activity, activity_date, amount, currency,
            guest_name, guest_email, headcount, short_code,
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
      authorize_url: r.short_code
        ? `${config(env).workerOrigin || "https://activity.nice.okinawa"}/p/${r.short_code}`
        : `${config(env).workerOrigin || "https://activity.nice.okinawa"}/payment/authorize?order=${encodeURIComponent(r.paypal_order_id)}`,
      status_label: r.authorization_status === "AUTHORIZED" ? "AUTHORIZED – NOT CHARGED" : r.authorization_status,
      days_until_expiration: expiresAt ? Math.ceil((expiresAt - now) / 86400000) : null,
      in_honor_period: honorEnds ? now <= honorEnds : false,
      reminder: expiresAt && expiresAt - now <= (3 * 86400000) ? "AUTHORIZATION_EXPIRING_SOON" : null
    };
  });
  return json({ ok: true, authorizations: data });
}

async function previouslySucceeded(env, action, idempotencyKey) {
  if (!idempotencyKey) return null;
  return await env.DB.prepare(
    `SELECT * FROM payment_audit_log WHERE action = ? AND idempotency_key = ? AND result_status = 'SUCCESS' ORDER BY created_at DESC LIMIT 1`
  ).bind(action, idempotencyKey).first();
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
  if (!row || !row.paypal_authorization_id) {
    return json({ ok: false, error: "AUTHORIZATION_NOT_FOUND" }, { status: 404 });
  }
  if (row.authorization_status !== "AUTHORIZED") {
    return json({ ok: false, error: "AUTHORIZATION_NOT_VOIDABLE", current_status: row.authorization_status }, { status: 409 });
  }
  const response = await paypalFetch(env, `/v2/payments/authorizations/${encodeURIComponent(row.paypal_authorization_id)}/void`, {
    method: "POST",
    headers: { "PayPal-Request-Id": idempotencyKey },
    body: "{}"
  });
  await env.DB.prepare(
    `UPDATE paypal_authorizations SET authorization_status = ?, paypal_status = ?, updated_at = ? WHERE id = ?`
  ).bind("VOIDED / RELEASED", response.status || "VOIDED", nowIso(), row.id).run();
  await audit(env, {
    authorization_id: row.id,
    paypal_authorization_id: row.paypal_authorization_id,
    action: "VOID_AUTHORIZATION",
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
  return json({ ok: true, status: "VOIDED / RELEASED", paypal_response: response });
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
  if (!row || !row.paypal_authorization_id) {
    return json({ ok: false, error: "AUTHORIZATION_NOT_FOUND" }, { status: 404 });
  }
  if (row.authorization_status !== "AUTHORIZED") {
    return json({ ok: false, error: "AUTHORIZATION_NOT_CAPTURABLE", current_status: row.authorization_status }, { status: 409 });
  }
  const payload = {
    amount: {
      currency_code: row.currency,
      value: String(amount)
    },
    final_capture: amount >= row.amount
  };
  const response = await paypalFetch(env, `/v2/payments/authorizations/${encodeURIComponent(row.paypal_authorization_id)}/capture`, {
    method: "POST",
    headers: { "PayPal-Request-Id": idempotencyKey },
    body: JSON.stringify(payload)
  });
  const nextStatus = payload.final_capture ? "CAPTURED" : "PARTIALLY_CAPTURED";
  await env.DB.prepare(
    `UPDATE paypal_authorizations SET authorization_status = ?, paypal_status = ?, updated_at = ? WHERE id = ?`
  ).bind(nextStatus, response.status || nextStatus, nowIso(), row.id).run();
  await audit(env, {
    authorization_id: row.id,
    paypal_authorization_id: row.paypal_authorization_id,
    action: "CAPTURE_AUTHORIZATION",
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
  return json({ ok: true, status: nextStatus, paypal_response: response });
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
<html lang="en">
<head>
  <meta charset="utf-8">
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
    <button id="load-paypal" disabled>Continue to PayPal Authorization</button>
    <div id="paypal-buttons"></div>
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
  document.getElementById('load-paypal').disabled = !event.target.checked;
});
document.getElementById('load-paypal').addEventListener('click', async () => {
  if (!cfg.clientId) { show('PayPal sandbox client ID is not configured yet.'); return; }
  document.getElementById('load-paypal').disabled = true;
  const sdk = document.createElement('script');
  sdk.src = cfg.paypalJsBase + '?client-id=' + encodeURIComponent(cfg.clientId) + '&currency=' + encodeURIComponent(cfg.currency) + '&intent=authorize';
  sdk.onload = renderButtons;
  sdk.onerror = () => show('Failed to load PayPal. Please contact us.');
  document.head.appendChild(sdk);
});
function renderButtons() {
  paypal.Buttons({
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
      show('AUTHORIZED – NOT CHARGED\\nAuthorization ID: ' + result.paypal_authorization_id + '\\nExpiration: ' + result.authorization_expiration_time);
    },
    onError: (err) => show('Authorization failed. Please contact us.\\n' + (err && err.message ? err.message : err))
  }).render('#paypal-buttons');
}
</script>
</body>
</html>`);
}

async function customerPageForOrder(request, env, orderId) {
  const row = await getAuthorizationByOrder(env, orderId);
  return row ? renderAuthorizationPage(env, row) : json({ ok: false, error: "ORDER_NOT_FOUND" }, { status: 404 });
}

async function customerPageForShortCode(request, env, shortCode) {
  const row = await getAuthorizationByShortCode(env, shortCode);
  return row ? renderAuthorizationPage(env, row) : json({ ok: false, error: "ORDER_NOT_FOUND" }, { status: 404 });
}

function renderAuthorizationPage(env, row) {
  const c = config(env);
  const brand = brandConfig(row.brand);
  const isSnorkel = brand.key === "snorkel";
  const displayName = isSnorkel ? "Snorkel Okinawa" : "Fishing Okinawa";
  const tripWord = isSnorkel ? "tour" : "trip";
  const cancelActor = isSnorkel ? "we" : "the captain";
  const cancelVerb = isSnorkel ? "cancel" : "cancels";
  const logoUrl = "https://fishing.nice.okinawa/assets/brand/okinawa-private-tour.png";
  const amount = `${escapeHtml(row.currency)} ${Number(row.amount).toLocaleString("en-US")}`;
  const guestLine = row.guest_name ? `<div class="order-row"><span>Guest</span><strong>${escapeHtml(row.guest_name)}</strong></div>` : "";
  const headcountLine = row.headcount ? `<div class="order-row"><span>Participants</span><strong>${escapeHtml(row.headcount)}</strong></div>` : "";
  const supportName = "[Wan name pending]";
  const trustLine = isSnorkel
    ? `Your guide: ${supportName} — Okinawa-based snorkel guide; in the water with you the whole time.`
    : `Your captain: [Captain name pending] — Local captain, fishing these waters for [N] years.`;
  const brandSmall = isSnorkel ? "Snorkel Okinawa" : "Fishing Okinawa";
  const extraNote = isSnorkel
    ? `The authorization covers the tour fee${row.headcount ? ` for ${escapeHtml(row.headcount)} guests` : " stated in your confirmation email"}. Snorkel gear and life jackets are included.`
    : "The authorization covers the charter fee and any gear rental listed in your confirmation email.";
  const cfg = { clientId: c.clientId || "", currency: row.currency, policyVersion: row.policy_version, orderId: row.paypal_order_id, paypalJsBase: c.jsBase };
  return html(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Secure your booking · ${displayName}</title>
<style>
:root{--blue:#1F6FB2;--teal:#2BB5A0;--orange:#F08A24;--yellow:#F5C542;--white:#fff;--ink:#1F2A37;--muted:#637083;--line:#dfe7ef;--page:#f5f8fb}
*{box-sizing:border-box}body{margin:0;background:var(--page);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.55}main{width:min(600px,100%);margin:0 auto;padding:28px 16px 42px}.header{text-align:center}.logo{display:block;width:min(170px,55vw);height:auto;margin:0 auto 6px}.brand-name{font-size:.82rem;color:var(--muted);font-weight:700;letter-spacing:.04em}.card{background:var(--white);border:1px solid var(--line);border-radius:18px;padding:22px;margin-top:20px;box-shadow:0 8px 24px rgba(31,42,55,.06)}h1{font-size:clamp(1.8rem,7vw,2.5rem);line-height:1.1;text-align:center;margin:18px 0 12px;color:var(--ink)}.badge{display:block;width:max-content;margin:0 auto 12px;background:var(--teal);color:#fff;border-radius:999px;padding:5px 12px;font-size:.74rem;font-weight:800;letter-spacing:.08em}.intro{text-align:center;color:var(--muted);margin:0 auto;max-width:520px}.order-card{margin-top:20px}.order-card h2,.next h2,.trust h2{font-size:1.12rem;margin:0 0 12px}.order-row{display:flex;justify-content:space-between;gap:16px;border-top:1px solid var(--line);padding:10px 0;font-size:.94rem}.order-row span{color:var(--muted)}.order-row strong{text-align:right}.next{margin-top:24px}.check{display:flex;gap:10px;margin:12px 0;color:var(--ink);font-size:.94rem}.check b{color:var(--teal);font-size:1.2rem;line-height:1}.note{font-size:.78rem;color:var(--muted);margin:14px 0 0}.policy{font-size:.9rem;color:var(--blue);font-weight:700;margin-top:18px}.agree{display:flex;gap:10px;align-items:flex-start;margin:22px 0 16px;font-size:.9rem}.agree input{margin-top:5px;accent-color:var(--blue)}button{border:0;border-radius:10px;min-height:50px;width:100%;padding:12px 16px;background:var(--blue);color:#fff;font-weight:800;font-size:1rem;cursor:pointer}button:disabled{opacity:.5;cursor:not-allowed}.secure{text-align:center;color:var(--muted);font-size:.75rem;margin:10px 0 0}.status{white-space:pre-wrap;background:#eef6fb;border-radius:10px;padding:12px;margin-top:14px;color:var(--ink)}.trust{margin-top:20px}.trust-top{display:flex;gap:14px;align-items:center}.avatar{width:58px;height:58px;object-fit:contain;border-radius:50%;border:1px solid var(--line);background:#fff}.trust p{margin:0;font-size:.9rem}.company{color:var(--muted);font-size:.76rem;margin-top:14px;line-height:1.65}.company a{color:var(--blue)}footer{text-align:center;color:var(--muted);font-size:.74rem;padding:0 16px 30px}@media(min-width:600px){main{padding-top:42px}}
</style></head><body><main>
<header class="header"><img class="logo" src="${logoUrl}" alt="Okinawa Private Tour"><div class="brand-name">${brandSmall}</div></header>
<h1>Secure Your Booking</h1><span class="badge">NO CHARGE TODAY</span>
<p class="intro">To confirm your reservation, PayPal will place a temporary authorization of ${amount} on your card. This is not a payment, and no money will be collected today.</p>
<section class="card order-card"><h2>Booking details</h2><div class="order-row"><span>Booking reference</span><strong>${escapeHtml(row.short_code || row.paypal_order_id)}</strong></div>${guestLine}<div class="order-row"><span>Activity</span><strong>${escapeHtml(row.activity)}</strong></div><div class="order-row"><span>Date</span><strong>${escapeHtml(row.activity_date)}</strong></div>${headcountLine}<div class="order-row"><span>Temporary authorization — no charge today</span><strong>${amount}</strong></div></section>
<section class="next"><h2>What happens next</h2><div class="check"><b>✓</b><span>If you join the ${tripWord} as scheduled, we release the full authorization on the same day. No payment is taken.</span></div><div class="check"><b>✓</b><span>If ${cancelActor} ${cancelVerb} because of weather or sea conditions, we release the full authorization.</span></div><div class="check"><b>✓</b><span>Only in the case of a late cancellation or no-show may we collect the applicable cancellation fee stated in our policy, up to the authorized amount.</span></div><p class="note">${extraNote}</p><p class="note">After we release the authorization, your bank may need a few days to remove the pending hold from your account.</p><a class="policy" href="${escapeHtml(brand.returnUrl)}#cancellation">View cancellation policy</a></section>
<section class="card"><label class="agree"><input id="agree" type="checkbox"><span>I understand this is a temporary card authorization, not a payment today, and I agree to the cancellation policy.</span></label><button id="load-paypal" disabled>Continue securely with PayPal</button><p class="secure">No charge will be made today. · Securely processed by PayPal. Your card details are handled by PayPal and are never stored on this website.</p><div id="paypal-buttons"></div><div id="status" class="status" hidden></div></section>
<section class="card trust"><h2>Who you're booking with</h2><div class="trust-top"><img class="avatar" src="${logoUrl}" alt="Okinawa Private Tour"><p>${trustLine}</p></div><p class="company">Bookings &amp; English support: ${supportName} · WhatsApp +81 70-8952-3968 · <a href="mailto:info@nice.okinawa">info@nice.okinawa</a><br>CATALINA JAPAN K.K. · Est. 2015 · 3-25-2 Maejima, Naha, Okinawa, Japan</p><p class="company"><a href="${escapeHtml(brand.returnUrl)}">${brandSmall}</a></p></section>
</main><footer>© CATALINA JAPAN K.K. · Okinawa Private Tour</footer>
<script>const cfg=${JSON.stringify(cfg)};const box=document.getElementById('status');const show=m=>{box.hidden=false;box.textContent=m};document.getElementById('agree').onchange=e=>document.getElementById('load-paypal').disabled=!e.target.checked;document.getElementById('load-paypal').onclick=()=>{if(!cfg.clientId){show('PayPal is not configured yet. Please contact us.');return}const s=document.createElement('script');s.src=cfg.paypalJsBase+'?client-id='+encodeURIComponent(cfg.clientId)+'&currency='+encodeURIComponent(cfg.currency)+'&intent=authorize';s.onload=render;s.onerror=()=>show('Failed to load PayPal. Please contact us.');document.head.appendChild(s)};function render(){paypal.Buttons({createOrder:()=>Promise.resolve(cfg.orderId),onApprove:async data=>{const r=await fetch('/api/paypal/authorize-order',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({order_id:data.orderID,accepted_policy:true,policy_version:cfg.policyVersion,idempotency_key:'authorize-'+data.orderID})});const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||'Authorization failed');show('Authorization confirmed — no charge today.\nAuthorization ID: '+d.paypal_authorization_id)},onError:e=>show('Authorization failed. Please contact us.\n'+(e&&e.message||e))}).render('#paypal-buttons')}</script></body></html>`);
}

async function legacyCustomerPageForOrder(request, env, orderId) {
  const row = await getAuthorizationByOrder(env, orderId);
  if (!row) return json({ ok: false, error: "ORDER_NOT_FOUND" }, { status: 404 });
  const c = config(env);
  const brand = brandConfig(row.brand);
  const cfg = { clientId: c.clientId || "", currency: row.currency, policyVersion: row.policy_version,
    amount: row.amount, activity: row.activity, activityDate: row.activity_date, orderId, paypalJsBase: c.jsBase,
    brand: brand.key, brandName: brand.name, brandTitle: brand.title, brandAccent: brand.accent,
    brandBackground: brand.background, returnUrl: brand.returnUrl };
  return html(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(brand.title)} | ${escapeHtml(row.activity)}</title><style>:root{--accent:${brand.accent};--background:${brand.background}}body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:var(--background);color:#fff;margin:0;line-height:1.6}main{max-width:760px;margin:auto;padding:32px 18px}.brand{color:var(--accent);font-weight:800;letter-spacing:.04em;text-transform:uppercase;font-size:.8rem}.card{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.16);border-radius:16px;padding:24px}.fact{display:grid;grid-template-columns:160px 1fr;gap:8px;padding:10px 0;border-top:1px solid rgba(255,255,255,.1)}.fact strong{color:var(--accent)}.notice{background:rgba(200,164,74,.12);border:1px solid rgba(200,164,74,.35);border-radius:12px;padding:16px;margin:18px 0}button{background:#c8a44a;color:#06101d;border:0;border-radius:8px;padding:12px 16px;font-weight:800;min-height:46px}button:disabled{opacity:.45}.status{white-space:pre-wrap;background:rgba(0,0,0,.25);border-radius:8px;padding:12px;margin-top:18px}footer{max-width:760px;margin:auto;padding:0 18px 28px;color:rgba(255,255,255,.65)}footer a{color:var(--accent)}@media(max-width:520px){.fact{grid-template-columns:1fr}}</style></head><body><main><div class="card"><div class="brand">${escapeHtml(brand.name)}</div><h1>${escapeHtml(brand.title)}</h1><p>Your card will be authorized, not charged immediately.</p><div class="fact"><strong>Activity</strong><span>${escapeHtml(row.activity)}</span></div><div class="fact"><strong>Date</strong><span>${escapeHtml(row.activity_date)}</span></div><div class="fact"><strong>Authorized amount</strong><span>${escapeHtml(row.currency)} ${Number(row.amount).toLocaleString("en-US")}</span></div><div class="notice"><p>Your card will be authorized for ${escapeHtml(row.currency)} ${Number(row.amount).toLocaleString("en-US")}, but you will not be charged at this time.</p><p>The hold amount covers the charter fee plus any gear rental stated in your confirmation email. Nothing is charged unless you do not show up.</p><p>If you participate as scheduled, the authorization will be released.</p><p>If you cancel or do not attend, the applicable cancellation fee may be charged according to the cancellation policy you agreed to.</p><p>If the operator cancels due to weather or unsafe sea conditions, the authorization will be released without charge.</p></div><label><input id="agree" type="checkbox"> I understand and agree to the authorization and cancellation policy.</label><button id="load-paypal" disabled>Continue to PayPal Authorization</button><div id="paypal-buttons"></div><div id="status" class="status" hidden></div></div></main><footer><a href="${escapeHtml(brand.returnUrl)}">Return to ${escapeHtml(brand.name)}</a></footer><script>
const cfg=${JSON.stringify(cfg)}; const box=document.getElementById('status'); const show=m=>{box.hidden=false;box.textContent=m};
document.getElementById('agree').onchange=e=>document.getElementById('load-paypal').disabled=!e.target.checked;
document.getElementById('load-paypal').onclick=()=>{const s=document.createElement('script');s.src=cfg.paypalJsBase+'?client-id='+encodeURIComponent(cfg.clientId)+'&currency='+encodeURIComponent(cfg.currency)+'&intent=authorize';s.onload=render;s.onerror=()=>show('Failed to load PayPal. Please contact us.');document.head.appendChild(s)};
function render(){paypal.Buttons({createOrder:()=>Promise.resolve(cfg.orderId),onApprove:async data=>{const r=await fetch('/api/paypal/authorize-order',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({order_id:data.orderID,accepted_policy:true,policy_version:cfg.policyVersion,idempotency_key:'authorize-'+data.orderID})});const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||'Authorization failed');show('AUTHORIZED – NOT CHARGED\\nAuthorization ID: '+d.paypal_authorization_id+'\\nExpiration: '+(d.authorization_expiration_time||''))},onError:e=>show('Authorization failed. Please contact us.\\n'+(e&&e.message||e))}).render('#paypal-buttons')}
</script></body></html>`);
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
    @media(max-width:760px){.meta{grid-template-columns:1fr}.actions{display:grid}}
  </style>
</head>
<body><main>
  <h1>PayPal Authorizations</h1>
  <p>Authorized cards are not paid. Capture only for No Show, customer cancellation, or agreed cancellation-fee cases.</p>
  <p><input id="token" type="password" placeholder="Admin token"> <button id="load">Load</button></p>
  <div class="row"><h2>New authorization order</h2><p><select id="new-brand"><option value="fishing">Fishing</option><option value="snorkel">Snorkel</option></select> <input id="new-activity" placeholder="Activity"> <input id="new-date" type="date"> <input id="new-amount" inputmode="numeric" placeholder="Amount JPY"> <input id="new-headcount" inputmode="numeric" placeholder="Guests (optional)"></p><p><input id="new-guest-name" placeholder="Guest name (optional)"> <input id="new-guest-email" type="email" placeholder="Guest email (optional)"> <button id="create">Create link</button></p><div id="new-result"></div></div>
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
  const res=await fetch('/api/admin/orders',{method:'POST',headers:headers(),body:JSON.stringify({brand:document.getElementById('new-brand').value,activity:document.getElementById('new-activity').value,activity_date:document.getElementById('new-date').value,amount:Number(document.getElementById('new-amount').value),headcount:document.getElementById('new-headcount').value,guest_name:document.getElementById('new-guest-name').value,guest_email:document.getElementById('new-guest-email').value,currency:'JPY',idempotency_key:'admin-'+crypto.randomUUID()})});
  const data=await res.json(); document.getElementById('new-result').innerHTML=data.ok ? '<a href="'+data.authorize_url+'">'+data.authorize_url+'</a>' : (data.error||'Failed');
}
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
  const actions=terminal ? '' : (row.authorization_status==='ORDER_CREATED' ? '<button onclick="cancelAuth(\\''+row.id+'\\')">Cancel order</button>' : '<button onclick="releaseAuth(\\''+row.id+'\\')">Release Authorization</button><input id="cap-'+row.id+'" inputmode="numeric" placeholder="Capture amount JPY"><button onclick="captureAuth(\\''+row.id+'\\')">Capture Authorization</button>');
  return '<div class="row '+(terminal?'terminal':'')+'"><h2>'+esc(row.activity)+' <small>· '+esc(row.brand)+' · '+esc(row.guest_name||'Guest name not provided')+'</small></h2>'+
    '<div class="meta">'+
    '<div>Status: <span class="status">'+esc(row.status_label)+'</span></div>'+
    '<div>Amount: '+esc(row.currency)+' '+Number(row.amount).toLocaleString('en-US')+'</div>'+
    '<div>Date: '+esc(row.activity_date)+'</div>'+
    '<div>Created: '+esc(row.created_at||'-')+'</div>'+
    '<div>Authorization: '+esc(row.paypal_authorization_id||'-')+'</div>'+
    '<div>Expires: '+esc(row.authorization_expiration_time||'-')+'</div>'+
    '<div>Days left: '+(row.days_until_expiration ?? '-')+' '+(row.reminder ? '<span class="warn">'+row.reminder+'</span>' : '')+'</div>'+
    '<div>Honor period: '+(row.in_honor_period ? 'within first 3 days' : 'outside 3-day honor period')+'</div>'+
    '</div>'+
    '<div class="order-link"><a href="'+esc(row.authorize_url)+'">'+esc(row.authorize_url)+'</a><button onclick="copyLink(\\''+esc(row.authorize_url)+'\\')">Copy link</button></div>'+
    '<div class="actions">'+actions+'</div></div>';
}
async function copyLink(link){ try{await navigator.clipboard.writeText(link); alert('Link copied');}catch(e){alert(link);} }
async function cancelAuth(id){ if(!confirm('Cancel this ORDER_CREATED order? No PayPal call will be made.')) return; const key='cancel-'+id+'-'+crypto.randomUUID(); const res=await fetch('/api/admin/authorizations/'+id+'/cancel',{method:'POST',headers:headers(),body:JSON.stringify({confirm:true,idempotency_key:key})}); alert(JSON.stringify(await res.json(),null,2)); load(); }
async function releaseAuth(id){
  if(operationLocks.has('void-'+id)) return;
  if(!confirm('Release this authorization? This voids the authorization and does not charge the customer.')) return;
  operationLocks.add('void-'+id);
  const key = 'void-'+id+'-'+crypto.randomUUID();
  const res = await fetch('/api/admin/authorizations/'+id+'/void', {method:'POST',headers:headers(),body:JSON.stringify({confirm:true,idempotency_key:key})});
  alert(JSON.stringify(await res.json(), null, 2)); operationLocks.delete('void-'+id); load();
}
async function captureAuth(id){
  if(operationLocks.has('capture-'+id)) return;
  const amount = Number(document.getElementById('cap-'+id).value);
  const text = 'You are about to charge JPY '+amount.toLocaleString('en-US')+' from this authorization.';
  if(!amount || !confirm(text)) return;
  operationLocks.add('capture-'+id);
  const key = 'capture-'+id+'-'+amount+'-'+crypto.randomUUID();
  const res = await fetch('/api/admin/authorizations/'+id+'/capture', {method:'POST',headers:headers(),body:JSON.stringify({confirm:true,amount,confirmation_text:text,idempotency_key:key})});
  alert(JSON.stringify(await res.json(), null, 2)); operationLocks.delete('capture-'+id); load();
}
</script></body></html>`);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function staticAuthorizePage() {
  return html(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PayPal Authorization</title></head><body><main style="font-family:system-ui;max-width:720px;margin:40px auto;padding:0 16px"><h1>PayPal Authorization</h1><p>This static page requires the PayPal Authorization Worker route. Open the Worker-backed URL <code>/payment/authorize</code> after sandbox deployment.</p><p><a href="/">Back to fishing.nice.okinawa</a></p></main></body></html>`);
}

async function handleRequest(request, env) {
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
      return orderId ? await customerPageForOrder(request, env, orderId) : customerPage(env);
    }
    const shortCodeMatch = url.pathname.match(/^\/p\/([A-Z0-9]{6})$/i);
    if (shortCodeMatch && request.method === "GET") return await customerPageForShortCode(request, env, shortCodeMatch[1].toUpperCase());
    if (url.pathname === "/payment/authorize-static" && request.method === "GET") return staticAuthorizePage();
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
        policy_version: c.policyVersion
      });
    }
    if (url.pathname === "/api/paypal/create-order" && request.method === "POST") return await createOrder(request, env);
    if (url.pathname === "/api/admin/orders" && request.method === "POST") return await createAdminOrder(request, env);
    if (url.pathname === "/api/paypal/sandbox/create-authorize-test-card" && request.method === "POST") return await createOrderWithSandboxTestCard(request, env);
    if (url.pathname === "/api/paypal/authorize-order" && request.method === "POST") return await authorizeOrder(request, env);
    if (url.pathname === "/api/paypal/sandbox/authorize-test-card" && request.method === "POST") return await authorizeOrderWithSandboxTestCard(request, env);
    if (url.pathname === "/api/paypal/webhook" && request.method === "POST") return await handleWebhook(request, env);
    if (url.pathname === "/api/admin/authorizations" && request.method === "GET") return await listAuthorizations(request, env);
    const voidMatch = url.pathname.match(/^\/api\/admin\/authorizations\/([^/]+)\/void$/);
    if (voidMatch && request.method === "POST") return await voidAuthorization(request, env, voidMatch[1]);
    const cancelMatch = url.pathname.match(/^\/api\/admin\/authorizations\/([^/]+)\/cancel$/);
    if (cancelMatch && request.method === "POST") return await cancelAuthorization(request, env, cancelMatch[1]);
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
