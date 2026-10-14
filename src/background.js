const SCRIPT_ID = 'chrome-tz-override';
const MATCHES = ['http://*/*', 'https://*/*'];
let pending = Promise.resolve();

function enqueue(work) {
  const result = pending.then(work, work);
  pending = result.catch(() => {});
  return result;
}

async function settings() {
  const saved = await chrome.storage.local.get({ enabled: false, timeZone: '' });
  return { enabled: saved.enabled === true, timeZone: typeof saved.timeZone === 'string' ? saved.timeZone : '' };
}

function validateZone(timeZone) {
  if (typeof timeZone !== 'string' || !timeZone) throw new Error('Select a time zone.');
  new Intl.DateTimeFormat('en-US', { timeZone });
}

function payloadSources(mode, timeZone) {
  return [
    { code: `globalThis.__chromeTZPayload = ${JSON.stringify({ mode, timeZone })};` },
    { file: 'src/zone-math.js' },
    { file: 'src/timezone-shim.js' }
  ];
}

function webTab(tab) {
  return Number.isInteger(tab.id) && /^https?:\/\//i.test(tab.url || '');
}

async function applyOpenTabs(mode, timeZone) {
  const tabs = (await chrome.tabs.query({})).filter(webTab);
  const attempts = await Promise.allSettled(tabs.map(tab => chrome.userScripts.execute({
    target: { tabId: tab.id, allFrames: true },
    world: 'MAIN',
    js: payloadSources(mode, timeZone)
  })));
  const failures = attempts.filter(result => result.status === 'rejected').length;
  return failures ? `Could not apply to ${failures} tab${failures === 1 ? '' : 's'}; reload affected pages.` : undefined;
}

async function reconcile(current, applyOpen = false) {
  if (!chrome.userScripts) {
    return { ok: false, ...current, userScriptsAvailable: false, error: 'Enable Allow User Scripts in the extension details.' };
  }
  let registered;
  try {
    registered = await chrome.userScripts.getScripts({ ids: [SCRIPT_ID] });
  } catch {
    return { ok: false, ...current, userScriptsAvailable: false, error: 'Enable Allow User Scripts in the extension details.' };
  }
  try {
    if (current.enabled) {
      validateZone(current.timeZone);
      const script = {
        id: SCRIPT_ID,
        matches: MATCHES,
        js: payloadSources('apply', current.timeZone),
        runAt: 'document_start',
        world: 'MAIN',
        allFrames: true
      };
      if (registered.length) await chrome.userScripts.update([script]);
      else await chrome.userScripts.register([script]);
    } else if (registered.length) {
      await chrome.userScripts.unregister({ ids: [SCRIPT_ID] });
    }
    const error = (applyOpen || (current.enabled && !registered.length))
      ? await applyOpenTabs(current.enabled ? 'apply' : 'restore', current.timeZone)
      : undefined;
    return { ok: true, ...current, userScriptsAvailable: true, ...(error ? { error } : {}) };
  } catch (failure) {
    return { ok: false, ...current, userScriptsAvailable: true, error: failure.message || String(failure) };
  }
}

async function reloadTabs() {
  const tabs = (await chrome.tabs.query({})).filter(webTab);
  const attempts = await Promise.allSettled(tabs.map(tab => chrome.tabs.reload(tab.id)));
  const failures = attempts.filter(result => result.status === 'rejected').length;
  const current = await settings();
  return { ok: failures === 0, ...current, userScriptsAvailable: !!chrome.userScripts,
    ...(failures ? { error: `Could not reload ${failures} tab${failures === 1 ? '' : 's'}.` } : {}) };
}

async function handleMessage(message) {
  if (message?.type === 'getStatus') return reconcile(await settings());
  if (message?.type === 'reloadTabs') return reloadTabs();
  if (message?.type === 'setSettings') {
    const current = { enabled: message.enabled === true, timeZone: message.timeZone };
    if (typeof current.timeZone !== 'string') throw new Error('Invalid time zone.');
    if (current.enabled || current.timeZone) validateZone(current.timeZone);
    await chrome.storage.local.set(current);
    return reconcile(current, true);
  }
  throw new Error('Unknown request.');
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  enqueue(() => handleMessage(message)).then(sendResponse, async failure => {
    const current = await settings();
    sendResponse({ ok: false, ...current, userScriptsAvailable: !!chrome.userScripts,
      error: failure.message || String(failure) });
  });
  return true;
});

function resume() {
  return enqueue(async () => reconcile(await settings(), true)).catch(error => console.error(error));
}
chrome.runtime.onInstalled.addListener(resume);
chrome.runtime.onStartup.addListener(resume);
