import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('fishing inline JavaScript parses', () => {
  const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(([, attributes]) => !/\bsrc=|application\/ld\+json/i.test(attributes))
    .map(([, , source]) => source);
  assert.ok(scripts.length > 0);
  for (const source of scripts) {
    assert.doesNotThrow(() => new Function(source));
  }
});

test('fishing sends the exact site and sourceSite values to the inquiry endpoint', () => {
  assert.match(html, /site:\s*['"]fishing['"]/);
  assert.match(html, /sourceSite:\s*['"]fishing\.nice\.okinawa['"]/);
  assert.match(html, /fetch\(INQUIRY_ENDPOINT,\s*\{\s*method:\s*['"]POST['"]/s);
});

test('fishing only reports success after an ok backend response', () => {
  const responseCheck = html.indexOf("if (!response.ok || !result.ok)");
  const successStatus = html.indexOf("setInquiryStatus('ok', 'ok')");
  const errorStatus = html.indexOf("setInquiryStatus('error', 'err')");
  assert.ok(responseCheck > -1);
  assert.ok(successStatus > responseCheck);
  assert.ok(errorStatus > successStatus);
  assert.doesNotMatch(html, /function submitForm\(\)\s*\{[^}]*alert\(/s);
});

test('fishing uses only the first-party analytics beacon', () => {
  const googleAnalyticsPattern = new RegExp(['g', 'tag'].join('') + '|google' + 'tagmanager|G-[A-Z0-9]+');
  assert.doesNotMatch(html, googleAnalyticsPattern);
  const beaconMatches = html.match(/https:\/\/analytics\.nice\.okinawa\/beacon\.js/g) || [];
  assert.equal(beaconMatches.length, 1);
  assert.match(html, /data-site=["']fishing["']/);
});

function createStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.get(key) || null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    }
  };
}

function formScript() {
  const start = html.indexOf('const INQUIRY_ENDPOINT =');
  const end = html.indexOf('// ── i18n stub', start);
  assert.ok(start > -1);
  assert.ok(end > start);
  return html.slice(start, end);
}

function createInquiryContext(fetchImpl) {
  const fields = new Map([
    ['f-name', { value: 'Test User' }],
    ['f-contact', { value: 'test@example.com' }],
    ['f-plan', { value: 'Fishing inquiry' }],
    ['f-size', { value: '2 guests' }],
    ['f-dates', { value: '2026-08-10' }],
    ['f-msg', { value: 'M0805-03 test' }],
    ['inquiry-submit', { disabled: false }]
  ]);
  const tokenInput = { value: 'turnstile-token' };
  const status = { className: '', textContent: '' };
  fields.set('inquiry-status', status);
  return {
    L: () => 'en',
    localStorage: createStorage(),
    sessionStorage: createStorage(),
    location: { href: 'https://fishing.nice.okinawa/' },
    navigator: { language: 'en-US' },
    document: {
      referrer: 'https://example.com/',
      getElementById(id) {
        return fields.get(id) || null;
      },
      querySelector(selector) {
        return selector === '[name="cf-turnstile-response"]' ? tokenInput : null;
      }
    },
    window: {
      crypto: { randomUUID: () => 'uuid-123' },
      turnstile: { reset() {} }
    },
    crypto: { randomUUID: () => 'uuid-123' },
    Blob,
    Date,
    Error,
    JSON,
    Math,
    Number,
    String,
    URLSearchParams,
    fetch: fetchImpl
  };
}

test('fishing reports inquiry success through the first-party beacon only after backend ok', async () => {
  const calls = [];
  const context = createInquiryContext(async (url, options) => {
    calls.push({ url, options });
    if (url === 'https://analytics.nice.okinawa/events') {
      return { ok: true, json: async () => ({ ok: true }) };
    }
    return { ok: true, json: async () => ({ ok: true }) };
  });
  vm.createContext(context);
  vm.runInContext(formScript(), context);

  const result = await context.submitForm({ preventDefault() {} });
  assert.equal(result, true);
  assert.equal(calls[0].url, 'https://inquiry-nice-okinawa-preview.gerheidicn.workers.dev/api/inquiries');
  assert.equal(calls[1].url, 'https://analytics.nice.okinawa/events');
  const payload = JSON.parse(calls[1].options.body);
  assert.equal(payload.site_id, 'fishing');
  assert.equal(payload.event_type, 'contact_click');
  assert.equal(payload.contact_channel, 'form');
});

test('fishing does not report an inquiry beacon when backend submission fails', async () => {
  const calls = [];
  const context = createInquiryContext(async (url, options) => {
    calls.push({ url, options });
    return { ok: false, json: async () => ({ ok: false, error: 'test_failure' }) };
  });
  vm.createContext(context);
  vm.runInContext(formScript(), context);

  const result = await context.submitForm({ preventDefault() {} });
  assert.equal(result, false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://inquiry-nice-okinawa-preview.gerheidicn.workers.dev/api/inquiries');
});
