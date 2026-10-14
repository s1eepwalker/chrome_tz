const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function popup(initial = { ok: true, enabled: false, timeZone: '', userScriptsAvailable: true }, reply) {
  const ids = ['zone-search', 'zone-select', 'enabled', 'reload', 'status', 'setup'];
  const elements = Object.fromEntries(ids.map(id => [id, element()]));
  const sent = [];
  const document = {
    getElementById(id) { return elements[id]; },
    createElement() { return element(); }
  };
  const chrome = { runtime: { async sendMessage(message) {
    sent.push(JSON.parse(JSON.stringify(message)));
    return reply ? reply(message) : message.type === 'getStatus' ? initial : { ...initial, ...message, ok: true };
  } } };
  const supportedValuesOf = () => ['America/New_York', 'Asia/Tokyo', 'Europe/London'];
  const context = vm.createContext({ document, chrome, Intl: { supportedValuesOf }, console });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/popup.js'), 'utf8'), context);
  const flush = async () => { await new Promise(resolve => setImmediate(resolve)); };
  return { elements, sent, flush };
}

function element() {
  return {
    value: '', checked: false, textContent: '', hidden: false, disabled: false, children: [],
    listeners: {},
    addEventListener(type, handler) { this.listeners[type] = handler; },
    replaceChildren(...children) { this.children = children; },
    append(...children) { this.children.push(...children); },
    dispatch(type) { return this.listeners[type]({ target: this }); }
  };
}

test('renders stored zone, enabled state and list including UTC', async () => {
  const app = popup({ ok: true, enabled: true, timeZone: 'Asia/Tokyo', userScriptsAvailable: true });
  await app.flush();
  assert.equal(app.elements.enabled.checked, true);
  assert.equal(app.elements['zone-select'].value, 'Asia/Tokyo');
  assert.deepEqual(app.elements['zone-select'].children.map(option => option.value),
    ['UTC', 'America/New_York', 'Asia/Tokyo', 'Europe/London']);
  assert.match(app.elements.status.textContent, /Asia\/Tokyo/);
  assert.deepEqual(app.sent, [{ type: 'getStatus' }]);
});

test('search filters zone list; selection enables override', async () => {
  const app = popup();
  await app.flush();
  app.elements['zone-search'].value = 'tok';
  app.elements['zone-search'].dispatch('input');
  assert.deepEqual(app.elements['zone-select'].children.map(option => option.value), ['Asia/Tokyo']);
  app.elements['zone-select'].value = 'Asia/Tokyo';
  app.elements['zone-select'].dispatch('change');
  await app.flush();
  assert.deepEqual(app.sent[1], { type: 'setSettings', enabled: true, timeZone: 'Asia/Tokyo' });
  assert.equal(app.elements.enabled.checked, true);
});

test('toggle sends saved zone and validates missing selection', async () => {
  const app = popup({ ok: true, enabled: true, timeZone: 'UTC', userScriptsAvailable: true });
  await app.flush();
  app.elements.enabled.checked = false;
  app.elements.enabled.dispatch('change');
  await app.flush();
  assert.deepEqual(app.sent[1], { type: 'setSettings', enabled: false, timeZone: 'UTC' });
  app.elements.enabled.checked = true;
  app.elements.enabled.dispatch('change');
  await app.flush();
  assert.deepEqual(app.sent[2], { type: 'setSettings', enabled: true, timeZone: 'UTC' });
  const fresh = popup();
  await fresh.flush();
  fresh.elements.enabled.checked = true;
  fresh.elements.enabled.dispatch('change');
  assert.equal(fresh.elements.enabled.checked, false);
  assert.match(fresh.elements.status.textContent, /выберите часовой пояс/i);
  assert.equal(fresh.sent.length, 1);
});

test('failed setting displays error and restores saved controls', async () => {
  const app = popup(undefined, message => message.type === 'getStatus'
    ? { ok: true, enabled: false, timeZone: 'UTC', userScriptsAvailable: true }
    : { ok: false, enabled: false, timeZone: 'UTC', userScriptsAvailable: true, error: 'Registration failed' });
  await app.flush();
  app.elements['zone-select'].value = 'Asia/Tokyo';
  app.elements['zone-select'].dispatch('change');
  await app.flush();
  assert.equal(app.elements.enabled.checked, false);
  assert.equal(app.elements['zone-select'].value, 'UTC');
  assert.match(app.elements.status.textContent, /Registration failed/);
});

test('unavailable API shows Chrome and Vivaldi setup guidance', async () => {
  const app = popup({ ok: false, enabled: true, timeZone: 'UTC', userScriptsAvailable: false,
    error: 'Enable Allow User Scripts in the extension details.' });
  await app.flush();
  assert.equal(app.elements.setup.hidden, false);
  assert.match(app.elements.setup.textContent, /Chrome.*Vivaldi.*Allow User Scripts/i);
  assert.match(app.elements.status.textContent, /Allow User Scripts/i);
});

test('reloads tabs only after an explicit click', async () => {
  const app = popup();
  await app.flush();
  assert.deepEqual(app.sent, [{ type: 'getStatus' }]);
  app.elements.reload.dispatch('click');
  await app.flush();
  assert.deepEqual(app.sent[1], { type: 'reloadTabs' });
  assert.match(app.elements.status.textContent, /перезагружены/i);
});
