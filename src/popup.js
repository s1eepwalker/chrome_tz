const search = document.getElementById('zone-search');
const zoneSelect = document.getElementById('zone-select');
const enabled = document.getElementById('enabled');
const reload = document.getElementById('reload');
const status = document.getElementById('status');
const setup = document.getElementById('setup');

const zones = [...new Set(['UTC', ...Intl.supportedValuesOf('timeZone')])];
let current = { enabled: false, timeZone: '', userScriptsAvailable: true };

setup.textContent = 'Chrome / Vivaldi: откройте сведения об этом расширении и включите «Allow User Scripts» (Разрешить пользовательские скрипты). Затем откройте окно расширения снова.';

function renderZones() {
  const query = search.value.trim().toLowerCase();
  const shown = zones.filter(zone => zone.toLowerCase().includes(query));
  zoneSelect.replaceChildren(...shown.map(zone => {
    const option = document.createElement('option');
    option.value = zone;
    option.textContent = zone;
    return option;
  }));
  zoneSelect.value = shown.includes(current.timeZone) ? current.timeZone : '';
}

function render(result, action = '') {
  current = {
    enabled: result.enabled === true,
    timeZone: typeof result.timeZone === 'string' ? result.timeZone : '',
    userScriptsAvailable: result.userScriptsAvailable !== false
  };
  enabled.checked = current.enabled;
  setup.hidden = current.userScriptsAvailable;
  renderZones();
  status.textContent = result.error
    ? `Ошибка: ${result.error}`
    : action === 'reload'
      ? 'Вкладки перезагружены.'
      : current.enabled
        ? `Подмена активна: ${current.timeZone}`
        : 'Подмена выключена.';
}

async function send(message, action = '') {
  try {
    const result = await chrome.runtime.sendMessage(message);
    if (!result) throw new Error('Нет ответа от расширения.');
    render(result, action);
  } catch (error) {
    enabled.checked = current.enabled;
    renderZones();
    status.textContent = `Ошибка: ${error.message || String(error)}`;
  }
}

search.addEventListener('input', renderZones);
zoneSelect.addEventListener('change', () => {
  if (zones.includes(zoneSelect.value)) {
    send({ type: 'setSettings', enabled: true, timeZone: zoneSelect.value });
  }
});
enabled.addEventListener('change', () => {
  if (enabled.checked && !current.timeZone) {
    enabled.checked = false;
    status.textContent = 'Сначала выберите часовой пояс.';
    return;
  }
  send({ type: 'setSettings', enabled: enabled.checked, timeZone: current.timeZone });
});
reload.addEventListener('click', () => send({ type: 'reloadTabs' }, 'reload'));

renderZones();
send({ type: 'getStatus' });
