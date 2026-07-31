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
