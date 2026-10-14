const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function page() {
  const context = vm.createContext({});
  const run = code => vm.runInContext(code, context);
  const nativeZone = run('Intl.DateTimeFormat().resolvedOptions().timeZone');
  const math = fs.readFileSync(path.join(__dirname, '../src/zone-math.js'), 'utf8');
  const shim = fs.readFileSync(path.join(__dirname, '../src/timezone-shim.js'), 'utf8');
  function send(payload) {
    run(`globalThis.__chromeTZPayload = ${JSON.stringify(payload)}`);
    run(math);
    run(shim);
  }
  return { run, send, nativeZone };
}

test('local Date fields and offset follow the selected zone', () => {
  const { run, send } = page();
  send({ mode: 'apply', timeZone: 'America/New_York' });
  assert.equal(run('new Date("2024-03-10T07:30:00Z").getHours()'), 3);
  assert.equal(run('new Date("2024-03-10T07:30:00Z").getMonth()'), 2);
  assert.equal(run('new Date("2024-03-10T07:30:00Z").getTimezoneOffset()'), 240);
  assert.equal(run('new Date("2024-03-10T07:30:00Z").getUTCHours()'), 7);
});

test('local constructor, parsing, and setters resolve a DST gap', () => {
  const { run, send } = page();
  send({ mode: 'apply', timeZone: 'America/New_York' });
  const expected = Date.parse('2024-03-10T07:30:00Z');
  assert.equal(run('new Date(2024, 2, 10, 2, 30).getTime()'), expected);
  assert.equal(run('Date.parse("2024-03-10T02:30:00")'), expected);
  assert.equal(run('new Date("2024-03-10T02:30:00").getTime()'), expected);
  assert.equal(run('new Date("2024-03-10T02:30:00-05:00").getTime()'), expected);
  assert.equal(run('new Date("2024-03-10").getTime()'), Date.parse('2024-03-10T00:00:00Z'));
  assert.equal(run('new Date("2024-03-10T06:30:00Z").setHours(2)'), expected);
});

test('month and full-year setters use zero-based month arguments', () => {
  const { run, send } = page();
  send({ mode: 'apply', timeZone: 'America/New_York' });
  assert.equal(run('new Date("2024-01-15T17:00:00Z").setMonth(1)'), Date.parse('2024-02-15T17:00:00Z'));
  assert.equal(run('new Date("2024-01-15T17:00:00Z").setFullYear(2025, 1, 15)'), Date.parse('2025-02-15T17:00:00Z'));
});

test('Date string and locale methods display local time', () => {
  const { run, send } = page();
  send({ mode: 'apply', timeZone: 'America/New_York' });
  assert.match(run('new Date("2024-03-10T07:30:00Z").toString()'), /Sun Mar 10 2024 03:30:00 GMT-0400/);
  assert.equal(run('new Date("2024-03-10T07:30:00Z").toDateString()'), 'Sun Mar 10 2024');
  assert.match(run('new Date("2024-03-10T07:30:00Z").toTimeString()'), /^03:30:00 GMT-0400/);
  assert.match(run('new Date("2024-03-10T07:30:00Z").toLocaleString("en-US")'), /3:30:00 AM/);
  assert.equal(run('new Date("2024-03-10T07:30:00Z").toLocaleDateString("en-US")'), '3/10/2024');
  assert.match(run('new Date("2024-03-10T07:30:00Z").toLocaleTimeString("en-US")'), /3:30:00 AM/);
  assert.match(run('Date()'), /GMT[+-]\d{4}/);
});

test('Intl default zone changes but explicit zone and UTC APIs do not', () => {
  const { run, send } = page();
  send({ mode: 'apply', timeZone: 'America/New_York' });
  assert.equal(run('Intl.DateTimeFormat().resolvedOptions().timeZone'), 'America/New_York');
  assert.equal(run('Intl.DateTimeFormat("en-US", {timeZone:undefined}).resolvedOptions().timeZone'), 'America/New_York');
  assert.equal(run('Intl.DateTimeFormat("en-US", {timeZone:"UTC"}).resolvedOptions().timeZone'), 'UTC');
  assert.equal(run('new Intl.DateTimeFormat("en-US", {hour:"numeric", timeZone:"UTC"}).format(new Date("2024-03-10T07:30:00Z"))'), '7 AM');
  assert.equal(run('Date.UTC(2024, 2, 10, 7, 30)'), Date.parse('2024-03-10T07:30:00Z'));
  assert.ok(Math.abs(run('Date.now()') - Date.now()) < 2000);
  assert.equal(run('new Date("2024-03-10T07:30:00Z") instanceof Date'), true);
});

test('invalid dates stay invalid', () => {
  const { run, send } = page();
  send({ mode: 'apply', timeZone: 'America/New_York' });
  assert.equal(run('Number.isNaN(new Date(NaN).getTimezoneOffset())'), true);
  assert.equal(run('Number.isNaN(new Date(NaN).getHours())'), true);
  assert.equal(run('new Date(NaN).toString()'), 'Invalid Date');
});

test('re-injection switches zone and restore recovers native APIs', () => {
  const { run, send, nativeZone } = page();
  send({ mode: 'apply', timeZone: 'America/New_York' });
  send({ mode: 'apply', timeZone: 'Asia/Kolkata' });
  assert.equal(run('Intl.DateTimeFormat().resolvedOptions().timeZone'), 'Asia/Calcutta');
  assert.equal(run('new Date("2024-01-01T00:00:00Z").getTimezoneOffset()'), -330);
  send({ mode: 'restore' });
  assert.equal(run('Intl.DateTimeFormat().resolvedOptions().timeZone'), nativeZone);
  send({ mode: 'apply', timeZone: 'America/New_York' });
  assert.equal(run('Intl.DateTimeFormat().resolvedOptions().timeZone'), 'America/New_York');
});
