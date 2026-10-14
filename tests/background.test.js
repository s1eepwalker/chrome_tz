const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function worker(initial = {}, { available = true, failTab = null } = {}) {
  const settings = { enabled: false, timeZone: '', ...initial };
  const scripts = new Map();
  const executed = [];
  const reloaded = [];
  const listeners = {};
  const tabs = [
    { id: 1, url: 'https://example.test/' },
    { id: 2, url: 'chrome://extensions/' },
    { id: 3, url: 'http://localhost:8765/' }
  ];
  const chrome = {
    storage: { local: {
      async get() { return { ...settings }; },
      async set(next) { Object.assign(settings, next); }
    } },
    runtime: {
      onMessage: { addListener(fn) { listeners.message = fn; } },
      onInstalled: { addListener(fn) { listeners.installed = fn; } },
      onStartup: { addListener(fn) { listeners.startup = fn; } }
    },
    tabs: {
      async query() { return tabs; },
      async reload(tabId) { reloaded.push(tabId); }
    }
  };
  if (available) chrome.userScripts = {
    async getScripts() { return [...scripts.values()]; },
    async register(items) { for (const item of items) scripts.set(item.id, item); },
    async update(items) { for (const item of items) scripts.set(item.id, item); },
    async unregister({ ids }) { for (const id of ids) scripts.delete(id); },
    async execute(injection) {
      if (injection.target.tabId === failTab) throw new Error('tab inaccessible');
      executed.push(injection);
    }
  };
  const context = vm.createContext({ chrome, Intl, URL, console });
  const source = fs.readFileSync(path.join(__dirname, '../src/background.js'), 'utf8');
  vm.runInContext(source, context);
  const message = input => new Promise(resolve => listeners.message(input, {}, resolve));
  return { settings, scripts, executed, reloaded, listeners, message, chrome };
}

test('initial state is disabled and exposes API availability', async () => {
  const app = worker();
  const status = await app.message({ type: 'getStatus' });
  assert.equal(status.ok, true);
  assert.equal(status.enabled, false);
  assert.equal(status.timeZone, '');
  assert.equal(status.userScriptsAvailable, true);
  assert.equal(app.scripts.size, 0);
});

test('valid selection persists and registers an early main-world script', async () => {
  const app = worker();
  const status = await app.message({ type: 'setSettings', enabled: true, timeZone: 'America/New_York' });
  assert.equal(status.ok, true);
  assert.equal(app.settings.timeZone, 'America/New_York');
  const [script] = app.scripts.values();
  assert.equal(script.runAt, 'document_start');
  assert.equal(script.world, 'MAIN');
  assert.equal(script.allFrames, true);
  assert.deepEqual(Array.from(script.matches), ['http://*/*', 'https://*/*']);
  assert.match(script.js[0].code, /America\/New_York/);
  assert.deepEqual(Array.from(script.js.slice(1), item => item.file), ['src/zone-math.js', 'src/timezone-shim.js']);
  assert.deepEqual(app.executed.map(item => item.target.tabId), [1, 3]);
});

test('invalid zone does not replace a saved choice', async () => {
  const app = worker({ enabled: true, timeZone: 'UTC' });
  const status = await app.message({ type: 'setSettings', enabled: true, timeZone: 'Mars/Olympus' });
  assert.equal(status.ok, false);
  assert.equal(app.settings.timeZone, 'UTC');
  assert.equal(app.scripts.size, 0);
});

test('changing and disabling the zone updates then unregisters one script', async () => {
  const app = worker();
  await app.message({ type: 'setSettings', enabled: true, timeZone: 'America/New_York' });
  await app.message({ type: 'setSettings', enabled: true, timeZone: 'Asia/Kolkata' });
  assert.equal(app.scripts.size, 1);
  assert.match([...app.scripts.values()][0].js[0].code, /Asia\/Kolkata/);
  const status = await app.message({ type: 'setSettings', enabled: false, timeZone: 'Asia/Kolkata' });
  assert.equal(status.ok, true);
  assert.equal(app.scripts.size, 0);
  assert.equal(app.executed.at(-1).js[0].code.includes('restore'), true);
});

test('unavailable User Scripts API preserves the selected zone and reports setup', async () => {
  const app = worker({ enabled: true, timeZone: 'UTC' }, { available: false });
  const status = await app.message({ type: 'getStatus' });
  assert.equal(status.userScriptsAvailable, false);
  assert.equal(status.timeZone, 'UTC');
  assert.equal(status.ok, false);
  assert.match(status.error, /Allow User Scripts/i);
});

test('install and startup restore registration from storage', async () => {
  const app = worker({ enabled: true, timeZone: 'UTC' });
  await app.listeners.installed();
  assert.equal(app.scripts.size, 1);
  app.scripts.clear();
  await app.listeners.startup();
  assert.equal(app.scripts.size, 1);
});

test('one inaccessible tab does not stop injection into later tabs', async () => {
  const app = worker({}, { failTab: 1 });
  const status = await app.message({ type: 'setSettings', enabled: true, timeZone: 'UTC' });
  assert.equal(app.settings.enabled, true);
  assert.equal(app.scripts.size, 1);
  assert.deepEqual(app.executed.map(item => item.target.tabId), [3]);
  assert.match(status.error, /tab/i);
});

test('reload action touches only web tabs', async () => {
  const app = worker();
  const status = await app.message({ type: 'reloadTabs' });
  assert.equal(status.ok, true);
  assert.deepEqual(app.reloaded, [1, 3]);
});
