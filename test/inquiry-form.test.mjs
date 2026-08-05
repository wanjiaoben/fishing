import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

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

test('fishing uses only the first-party analytics beacon', () => {
  const googleAnalyticsPattern = new RegExp(['g', 'tag'].join('') + '|google' + 'tagmanager|G-[A-Z0-9]+');
  assert.doesNotMatch(html, googleAnalyticsPattern);
  const beaconMatches = html.match(/https:\/\/analytics\.nice\.okinawa\/beacon\.js/g) || [];
  assert.equal(beaconMatches.length, 1);
  assert.match(html, /data-site=["']fishing["']/);
});

test('fishing removes the inquiry form and endpoint integration', () => {
  assert.doesNotMatch(html, /INQUIRY_ENDPOINT|api\/inquiries|submitForm|cf-turnstile|inquiry-submit|inquiry-status/);
  assert.doesNotMatch(html, /id=["']f-(name|contact|plan|size|dates|msg)["']/);
  assert.doesNotMatch(html, /https:\/\/challenges\.cloudflare\.com\/turnstile/);
  assert.doesNotMatch(html, /contact_channel:\s*['"]form['"]/);
});

test('fishing exposes direct email and WhatsApp contact links in the former form position', () => {
  const directContact = html.indexOf('class="direct-contact"');
  const contactGrid = html.indexOf('class="contact-grid"');
  assert.ok(directContact > -1);
  assert.ok(directContact > contactGrid);
  assert.match(html, /href=["']mailto:info@nice\.okinawa["'][^>]*data-contact=["']email["']/);
  assert.match(html, />info@nice\.okinawa</);
  assert.match(html, /href=["']https:\/\/wa\.me\/817089523968["'][^>]*data-contact=["']whatsapp["']/);
  assert.match(html, />\+81 70-8952-3968</);
});
