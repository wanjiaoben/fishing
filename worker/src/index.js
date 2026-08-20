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
     (id, paypal_order_id, activity, activity_date, amount, currency, authorization_status, paypal_status,
      paypal_create_response, policy_version, agreed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    authId,
    paypalOrder.id,
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
  if (!activity || !/^\d{4}-\d{2}-\d{2}$/.test(activityDate) || !Number.isInteger(amount) || amount <= 0 || currency !== "JPY") {
    return json({ ok: false, error: "INVALID_ORDER_FIELDS", required: ["activity", "activity_date", "amount", "currency=JPY"] }, { status: 400 });
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
     (id, paypal_order_id, activity, activity_date, amount, currency, authorization_status, paypal_status,
      paypal_create_response, policy_version, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(localId, paypalOrder.id, activity, activityDate, amount, currency, "ORDER_CREATED", paypalOrder.status || null,
    JSON.stringify(paypalOrder), c.policyVersion, createdAt, createdAt).run();
  await insertEvent(env, { authorization_id: localId, paypal_order_id: paypalOrder.id, event_type: "ORDER_CREATED", event_status: paypalOrder.status, payload: paypalOrder });
  return json({ ok: true, local_authorization_id: localId, paypal_order_id: paypalOrder.id,
    authorize_url: `${c.workerOrigin || new URL(request.url).origin}/payment/authorize?order=${encodeURIComponent(paypalOrder.id)}` });
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
     (id, paypal_order_id, activity, activity_date, amount, currency, authorization_status, paypal_status,
      paypal_create_response, policy_version, agreed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    authId,
    paypalOrder.id,
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
    `SELECT id, paypal_order_id, paypal_authorization_id, activity, activity_date, amount, currency,
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
  if (!row) return json({ ok: false, error: "ORDER_NOT_FOUND" }, { status: 404 });
  const c = config(env);
  const cfg = { clientId: c.clientId || "", currency: row.currency, policyVersion: row.policy_version,
    amount: row.amount, activity: row.activity, activityDate: row.activity_date, orderId, paypalJsBase: c.jsBase };
  return html(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PayPal Authorization | ${escapeHtml(row.activity)}</title><style>body{font-family:system-ui;background:#06101d;color:#fff;margin:0;line-height:1.6}main{max-width:760px;margin:auto;padding:32px 18px}.card{background:#10243b;border:1px solid #34506b;border-radius:16px;padding:24px}.fact{display:grid;grid-template-columns:160px 1fr;gap:8px;padding:10px 0;border-top:1px solid #29415a}.fact strong{color:#00b4c8}.notice{background:#3c321d;border:1px solid #806b32;border-radius:12px;padding:16px;margin:18px 0}button{background:#c8a44a;color:#06101d;border:0;border-radius:8px;padding:12px 16px;font-weight:800;min-height:46px}button:disabled{opacity:.45}.status{white-space:pre-wrap;background:#081522;border-radius:8px;padding:12px;margin-top:18px}@media(max-width:520px){.fact{grid-template-columns:1fr}}</style></head><body><main><div class="card"><h1>Card Authorization</h1><p>Your card will be authorized, not charged immediately.</p><div class="fact"><strong>Activity</strong><span>${escapeHtml(row.activity)}</span></div><div class="fact"><strong>Date</strong><span>${escapeHtml(row.activity_date)}</span></div><div class="fact"><strong>Authorized amount</strong><span>${escapeHtml(row.currency)} ${Number(row.amount).toLocaleString("en-US")}</span></div><div class="notice"><p>Your card will be authorized for ${escapeHtml(row.currency)} ${Number(row.amount).toLocaleString("en-US")}, but you will not be charged at this time.</p><p>If you participate as scheduled, the authorization will be released.</p><p>If you cancel or do not attend, the applicable cancellation fee may be charged according to the cancellation policy you agreed to.</p><p>If the operator cancels due to weather or unsafe sea conditions, the authorization will be released without charge.</p></div><label><input id="agree" type="checkbox"> I understand and agree to the authorization and cancellation policy.</label><button id="load-paypal" disabled>Continue to PayPal Authorization</button><div id="paypal-buttons"></div><div id="status" class="status" hidden></div></div></main><script>
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
    @media(max-width:760px){.meta{grid-template-columns:1fr}.actions{display:grid}}
  </style>
</head>
<body><main>
  <h1>PayPal Authorizations</h1>
  <p>Authorized cards are not paid. Capture only for No Show, customer cancellation, or agreed cancellation-fee cases.</p>
  <p><input id="token" type="password" placeholder="Admin token"> <button id="load">Load</button></p>
  <div class="row"><h2>New authorization order</h2><p><input id="new-activity" placeholder="Activity"> <input id="new-date" type="date"> <input id="new-amount" inputmode="numeric" placeholder="Amount JPY"> <button id="create">Create link</button></p><div id="new-result"></div></div>
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
  const res=await fetch('/api/admin/orders',{method:'POST',headers:headers(),body:JSON.stringify({activity:document.getElementById('new-activity').value,activity_date:document.getElementById('new-date').value,amount:Number(document.getElementById('new-amount').value),currency:'JPY',idempotency_key:'admin-'+crypto.randomUUID()})});
  const data=await res.json(); document.getElementById('new-result').textContent=data.ok ? data.authorize_url : (data.error||'Failed');
}
async function load(){
  const res = await fetch('/api/admin/authorizations', {headers: headers()});
  const data = await res.json();
  if(!res.ok){ list.textContent = data.error || 'Failed'; return; }
  list.innerHTML = data.authorizations.map(render).join('');
}
function render(row){
  return '<div class="row"><h2>'+row.activity+'</h2>'+
    '<div class="meta">'+
    '<div>Status: <span class="status">'+row.status_label+'</span></div>'+
    '<div>Amount: '+row.currency+' '+Number(row.amount).toLocaleString('en-US')+'</div>'+
    '<div>Date: '+row.activity_date+'</div>'+
    '<div>Authorization: '+(row.paypal_authorization_id||'-')+'</div>'+
    '<div>Expires: '+(row.authorization_expiration_time||'-')+'</div>'+
    '<div>Days left: '+(row.days_until_expiration ?? '-')+' '+(row.reminder ? '<span class="warn">'+row.reminder+'</span>' : '')+'</div>'+
    '<div>Honor period: '+(row.in_honor_period ? 'within first 3 days' : 'outside 3-day honor period')+'</div>'+
    '</div>'+
    '<div class="actions">'+
    '<button onclick="releaseAuth(\\''+row.id+'\\')">Release Authorization</button>'+
    '<input id="cap-'+row.id+'" inputmode="numeric" placeholder="Capture amount JPY">'+
    '<button onclick="captureAuth(\\''+row.id+'\\')">Capture Authorization</button>'+
    '</div></div>';
}
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
