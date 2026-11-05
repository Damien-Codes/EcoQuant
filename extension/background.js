/* Service worker : récupère le calendrier, programme les alertes, affiche notifications + pop-up. */
importScripts('common.js');

const REFRESH_EVERY_MIN = 60;            // rafraîchissement automatique du calendrier
const MIN_FETCH_GAP_MS = 5 * 60 * 1000;  // jamais plus d'une requête / 5 min (le flux bloque les abus)
const LATE_TOLERANCE_MS = 5 * 60 * 1000; // une alerte en retard (PC en veille…) reste valable 5 min
const MAX_ALARMS = 400;
const RESULT_FIRST_DELAY_MS = 60 * 1000; // 1re vérification du chiffre réel 1 min après la news
const RESULT_RETRY_MIN = 1;              // puis toutes les minutes…
const RESULT_MAX_TRIES = 6;              // …6 fois au maximum (le site publie parfois avec du retard)
const RESULT_SOURCES = ['investing']; // Forex Factory ne donne pas le chiffre réel

// Exécute les tâches une par une (évite les doublons quand deux alarmes tombent en même temps)
let queue = Promise.resolve();
function serial(fn) {
  const p = queue.then(fn);
  queue = p.catch(() => {});
  return p;
}

/* ---------- Cycle de vie ---------- */

chrome.runtime.onInstalled.addListener(details => serial(async () => {
  const { settings } = await chrome.storage.sync.get('settings');
  await chrome.storage.sync.set({ settings: { ...DEFAULT_SETTINGS, ...(settings || {}) } });
  await ensureRecurringAlarms();
  await refreshCalendar({ force: true });
  if (details.reason === 'install') chrome.runtime.openOptionsPage();
}));

chrome.runtime.onStartup.addListener(() => serial(async () => {
  await ensureRecurringAlarms();
  await refreshCalendar();
}));

async function ensureRecurringAlarms() {
  if (!(await chrome.alarms.get('refresh'))) {
    chrome.alarms.create('refresh', { periodInMinutes: REFRESH_EVERY_MIN, delayInMinutes: REFRESH_EVERY_MIN });
  }
  if (!(await chrome.alarms.get('tick'))) {
    chrome.alarms.create('tick', { periodInMinutes: 1 });
  }
}

/* ---------- Récupération du calendrier ---------- */

async function refreshCalendar({ force = false } = {}) {
  const { fetchedAt = 0 } = await chrome.storage.local.get('fetchedAt');
  if (!force && Date.now() - fetchedAt < MIN_FETCH_GAP_MS) {
    await rescheduleAlerts();
    await updateBadge();
    return { ok: true, cached: true, fetchedAt };
  }
  const { source: wanted } = await getSettings();
  const errors = [];
  const order = wanted === 'forexfactory' ? ['forexfactory'] : ['investing', 'forexfactory'];
  let result = null;
  // On essaie la source choisie ; en cas d'échec on bascule sur la suivante (si autorisée)
  for (const source of order) {
    try {
      const events = await fetchFrom(source);
      const now = Date.now();
      const lastError = source === wanted ? null
        : `${SOURCES[wanted].label} indisponible (${errors[0]}) : données ${SOURCES[source].label} utilisées en attendant.`;
      await chrome.storage.local.set({ events, fetchedAt: now, lastError, source });
      result = { ok: true, count: events.length, fetchedAt: now, source };
      break;
    } catch (err) {
      errors.push(err.message || String(err));
    }
  }
  if (!result) {
    const msg = `Impossible de récupérer le calendrier (${errors.join(' ; ')}).`;
    await chrome.storage.local.set({ lastError: msg });
    chrome.alarms.create('retry', { delayInMinutes: 10 });
    result = { ok: false, error: msg };
  } else if (result.source !== wanted) {
    chrome.alarms.create('retry', { delayInMinutes: 30 }); // on retente la source choisie plus tard
  }
  await rescheduleAlerts();
  await updateBadge();
  return result;
}

function fetchFrom(source, from, to) {
  return source === 'investing' ? fetchInvesting(from, to) : fetchForexFactory();
}

async function fetchForexFactory() {
  const res = await fetch(FEED_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const raw = await res.json();
  if (!Array.isArray(raw)) throw new Error('format inattendu');
  return normalizeEvents(raw);
}

// Investing.com : par défaut du jour J-1 à J+7, heures en UTC (timeZone=55), page de 200 lignes
const isoDay = d => new Date(d).toISOString().slice(0, 10);

async function fetchInvesting(from = isoDay(Date.now() - 864e5), to = isoDay(Date.now() + 7 * 864e5)) {
  await ensureInvestingHeaders();
  const all = [];
  let lastScope = null;
  for (let page = 0; page < 8; page++) {
    const body = new URLSearchParams();
    for (const i of ['1', '2', '3']) body.append('importance[]', i);
    body.set('dateFrom', from);
    body.set('dateTo', to);
    body.set('timeZone', '55');
    body.set('timeFilter', 'timeOnly');
    body.set('currentTab', 'custom');
    body.set('limit_from', String(page));
    if (page === 0) body.set('submitFilters', '1');
    else { body.set('submitFilters', '0'); body.set('last_time_scope', String(lastScope)); body.set('byHandler', 'true'); }

    const res = await fetch(INVESTING_API, {
      method: 'POST',
      body,
      credentials: 'include', // réutilise les cookies d'Investing.com du navigateur (passe l'anti-robot)
      cache: 'no-store',
      headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json, text/javascript, */*; q=0.01' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json().catch(() => null);
    if (!json || typeof json.data !== 'string') throw new Error('accès refusé');
    all.push(...parseInvestingHTML(json.data));
    lastScope = json.last_time_scope;
    if (!json.bind_scroll_handler || !lastScope || Number(json.rows_num) < 200) break;
    await new Promise(r => setTimeout(r, 800)); // on ne martèle pas le site
  }
  const events = sortEvents(all);
  if (!events.length) throw new Error('aucune news reçue');
  return events;
}

// Le site attend un Referer/Origin à lui : on les ajoute aux seules requêtes de l'extension
async function ensureInvestingHeaders() {
  const rule = {
    id: 1,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [
        { header: 'Referer', operation: 'set', value: CALENDAR_URL },
        { header: 'Origin', operation: 'set', value: 'https://www.investing.com' },
      ],
    },
    condition: {
      urlFilter: '|https://www.investing.com/economic-calendar/Service/',
      initiatorDomains: [chrome.runtime.id],
      resourceTypes: ['xmlhttprequest'],
    },
  };
  await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [1], addRules: [rule] });
}

/* ---------- Programmation des alertes ---------- */

function alertTimes(state) {
  const times = new Set(state.events.filter(e => matches(e, state.settings, state.muted)).map(e => e.ts));
  return [...times].sort((a, b) => a - b);
}

async function rescheduleAlerts() {
  const state = await loadState();
  const existing = await chrome.alarms.getAll();
  await Promise.all(existing.filter(a => a.name.startsWith('alert|') || a.name.startsWith('result|'))
    .map(a => chrome.alarms.clear(a.name)));

  const now = Date.now();
  let count = 0;
  // Résultat : 1 min après chaque news suivie (sources qui publient le chiffre réel)
  if (state.settings.showResult && RESULT_SOURCES.includes(state.source)) {
    const times = new Set(state.events
      .filter(e => e.impact !== 'Holiday' && e.ts + RESULT_FIRST_DELAY_MS > now + 1000 && matches(e, state.settings, state.muted))
      .map(e => e.ts));
    for (const ts of [...times].slice(0, 100)) chrome.alarms.create(`result|${ts}`, { when: ts + RESULT_FIRST_DELAY_MS });
  }
  for (const ts of alertTimes(state)) {
    for (const lead of state.settings.leads) {
      const when = ts - lead * 60000;
      if (when > now + 1000 && count < MAX_ALARMS) {
        chrome.alarms.create(`alert|${ts}|${lead}`, { when });
        count++;
      }
    }
  }
  return count;
}

// Filet de sécurité (appelé chaque minute) : rattrape une alerte manquée (redémarrage, veille…)
async function catchUpMissed() {
  const state = await loadState();
  const now = Date.now();
  for (const ts of alertTimes(state)) {
    if (ts < now - LATE_TOLERANCE_MS) continue;
    for (const lead of state.settings.leads) {
      const when = ts - lead * 60000;
      if (now >= when && now - when < LATE_TOLERANCE_MS && !state.fired[`${ts}|${lead}`]) {
        await fireAlert(ts, lead);
      }
    }
  }
}

chrome.alarms.onAlarm.addListener(alarm => serial(async () => {
  if (alarm.name === 'refresh' || alarm.name === 'retry') return refreshCalendar();
  if (alarm.name === 'tick') { await catchUpMissed(); return updateBadge(); }
  const [kind, ts, lead] = alarm.name.split('|');
  if (kind === 'alert') return fireAlert(Number(ts), Number(lead));
  if (kind === 'snooze') return fireAlert(Number(ts), 0, { snooze: true });
  if (kind === 'result') return checkResults(Number(ts), 1);
  if (kind === 'resretry') return checkResults(Number(ts), Number(lead));
}));

/* ---------- Résultat après publication ---------- */

async function checkResults(ts, attempt) {
  const state = await loadState();
  if (!state.settings.showResult || !RESULT_SOURCES.includes(state.source) || Date.now() - ts > 30 * 60000) return;
  const targets = state.events.filter(e => e.ts === ts && e.impact !== 'Holiday' && matches(e, state.settings, state.muted));
  if (!targets.length) return;

  let fresh = [];
  try {
    fresh = await fetchFrom(state.source, isoDay(ts), isoDay(ts)); // une seule journée : 1 requête
  } catch (err) {
    console.warn('Résultat indisponible :', err);
  }

  // On range les chiffres réels dans le calendrier stocké (le popup les affiche)
  const byId = new Map(fresh.map(e => [e.id, e]));
  const { events = [], resultsSent = {} } = await chrome.storage.local.get(['events', 'resultsSent']);
  const merged = events.map(e => (byId.has(e.id) ? { ...e, ...pick(byId.get(e.id), ['actual', 'surprise', 'forecast', 'previous']) } : e));
  await chrome.storage.local.set({ events: merged });

  const now = Date.now();
  const published = targets.map(t => byId.get(t.id)).filter(e => e && e.actual && !resultsSent[e.id]);
  const missing = targets.filter(t => !byId.get(t.id)?.actual);

  if (published.length) {
    const sent = Object.fromEntries(Object.entries(resultsSent).filter(([, t]) => now - t < 2 * 864e5));
    for (const e of published) sent[e.id] = now;
    await chrome.storage.local.set({ resultsSent: sent });
    if (!inQuietHours(state.settings, new Date(now))) await showResultNotification(ts, published, false);
  }
  if (missing.length && attempt < RESULT_MAX_TRIES) {
    chrome.alarms.create(`resretry|${ts}|${attempt + 1}`, { delayInMinutes: RESULT_RETRY_MIN });
  }
}

// Taux de change BCE pour le calculateur (API gratuite Frankfurter), gardés 6 h
async function getRates(base = 'EUR') {
  const { ratesCache = {} } = await chrome.storage.local.get('ratesCache');
  const cached = ratesCache[base];
  if (cached && Date.now() - cached.at < 6 * 3600e3) return { ok: true, ...cached };
  try {
    const res = await fetch(`${RATES_URL}?from=${encodeURIComponent(base)}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const entry = { base, date: json.date, rates: json.rates || {}, at: Date.now() };
    await chrome.storage.local.set({ ratesCache: { ...ratesCache, [base]: entry } });
    return { ok: true, ...entry };
  } catch (err) {
    return cached ? { ok: true, ...cached, stale: true } : { ok: false, error: err.message || String(err) };
  }
}

function pick(obj, keys) {
  return Object.fromEntries(keys.filter(k => obj[k] !== undefined).map(k => [k, obj[k]]));
}

async function showResultNotification(ts, list, test) {
  const lines = list.slice(0, 4).map(e => {
    const s = SURPRISE[e.surprise || ''];
    return `${s.arrow} ${e.currency} ${e.title} : ${e.actual}${e.forecast ? ` (prév. ${e.forecast})` : ''}`;
  });
  if (list.length > 4) lines.push(`+ ${list.length - 4} autre(s)`);
  const ups = list.filter(e => e.surprise === 'up').length, downs = list.filter(e => e.surprise === 'down').length;
  const verdict = ups && !downs ? 'meilleur que prévu' : downs && !ups ? 'moins bon que prévu' : ups && downs ? 'résultats mitigés' : 'conforme';
  await chrome.notifications.create(`notif|res|${ts}|${Date.now()}`, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: `${test ? '[Test] ' : ''}Résultat ${fmtTime(ts)} — ${verdict}`,
    message: lines.join('\n'),
    priority: 2,
  });
}

// Réglages ou news coupées modifiés → on reprogramme
chrome.storage.onChanged.addListener((changes, area) => {
  // Changement de source → on recharge le calendrier depuis la nouvelle source
  if (area === 'sync' && changes.settings
      && (changes.settings.oldValue?.source || 'investing') !== (changes.settings.newValue?.source || 'investing')) {
    serial(() => refreshCalendar({ force: true }));
    return;
  }
  if ((area === 'sync' && changes.settings) || (area === 'local' && changes.muted)) {
    serial(async () => { await rescheduleAlerts(); await updateBadge(); });
  }
});

/* ---------- Déclenchement d'une alerte ---------- */

async function fireAlert(ts, lead, { snooze = false } = {}) {
  const state = await loadState();
  const key = `${ts}|${lead}${snooze ? '|s' : ''}`;
  const now = Date.now();
  if (state.fired[key] || now > ts + LATE_TOLERANCE_MS) return;

  const list = state.events.filter(e => e.ts === ts && matches(e, state.settings, state.muted));
  if (!list.length) return;

  // On marque l'alerte comme envoyée (et on nettoie les entrées de plus de 2 jours)
  const fired = Object.fromEntries(Object.entries(state.fired).filter(([, t]) => now - t < 2 * 864e5));
  fired[key] = now;
  await chrome.storage.local.set({ fired });

  if (inQuietHours(state.settings, new Date(now))) return;
  await deliver(ts, lead, list, state.settings, false);
}

async function deliver(ts, lead, list, settings, test) {
  const tasks = [];
  if (settings.notifySystem) tasks.push(showNotification(ts, list, settings, test));
  if (settings.notifyWindow) tasks.push(openAlertWindow(ts, lead, list.length, test));
  if (settings.sound) tasks.push(playSound(settings.volume));
  await Promise.allSettled(tasks);
}

async function showNotification(ts, list, settings, test) {
  const mins = Math.round((ts - Date.now()) / 60000);
  const when = mins <= 0 ? 'Maintenant' : `Dans ${mins} min`;
  const impact = IMPACTS[maxImpact(list)];
  const lines = list.slice(0, 4).map(e => `${e.currency} · ${e.title}${e.forecast ? `  (prév. ${e.forecast})` : ''}`);
  if (list.length > 4) lines.push(`+ ${list.length - 4} autre(s)`);
  await chrome.notifications.create(`notif|${ts}|${Date.now()}`, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: `${test ? '[Test] ' : ''}${when} · ${fmtTime(ts)} — impact ${impact.label.toLowerCase()}`,
    message: lines.join('\n'),
    priority: 2,
    requireInteraction: !settings.notifyWindow, // reste affichée si la fenêtre pop-up est désactivée
  });
}

chrome.notifications.onClicked.addListener(id => {
  chrome.notifications.clear(id);
  chrome.tabs.create({ url: CALENDAR_URL });
});

async function openAlertWindow(ts, lead, n, test) {
  const url = chrome.runtime.getURL(`alert.html?ts=${ts}&lead=${lead}${test ? '&test=1' : ''}`);
  const height = Math.min(220 + n * 58, 640); // ajusté ensuite au contenu par alert.js
  const win = await chrome.windows.create({ url, type: 'popup', width: 440, height, focused: true });
  try { await chrome.windows.update(win.id, { drawAttention: true }); } catch (_) {}
}

async function playSound(volume) {
  try {
    const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
    if (!contexts.length) {
      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['AUDIO_PLAYBACK'],
        justification: "Son d'alerte avant une news économique",
      });
    }
    await chrome.runtime.sendMessage({ target: 'offscreen', type: 'play', volume });
  } catch (err) {
    console.warn('Son impossible :', err);
  }
}

/* ---------- Badge sur l'icône ---------- */

async function updateBadge() {
  const state = await loadState();
  const now = Date.now();
  const upcoming = state.events.filter(e => e.ts > now && matches(e, state.settings, state.muted));
  if (!upcoming.length) {
    await chrome.action.setBadgeText({ text: '' });
    await chrome.action.setTitle({ title: 'EcoQuant — aucune news à venir avec tes filtres' });
    return;
  }
  const next = upcoming[0];
  const diff = next.ts - now;
  let text, color;
  if (diff <= 60 * 60000) {
    text = `${Math.max(1, Math.ceil(diff / 60000))}m`;
    color = IMPACTS[maxImpact(upcoming.filter(e => e.ts === next.ts))].color;
  } else {
    const today = upcoming.filter(e => dayKey(e.ts) === dayKey(now)).length;
    text = today ? String(today) : '';
    color = '#334155';
  }
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color });
  if (chrome.action.setBadgeTextColor) await chrome.action.setBadgeTextColor({ color: '#ffffff' });
  await chrome.action.setTitle({
    title: `Prochaine news : ${next.currency} ${next.title} — ${dayLabel(next.ts).toLowerCase()} à ${fmtTime(next.ts)}`,
  });
}

/* ---------- Messages venant du popup / des options / de la fenêtre d'alerte ---------- */

async function testAlert() {
  const settings = await getSettings();
  const ts = Date.now() + 10 * 60000;
  const list = [
    { id: 'test1', title: 'Non-Farm Employment Change', currency: 'USD', ts, impact: 'High', forecast: '180K', previous: '175K' },
    { id: 'test2', title: 'Unemployment Rate', currency: 'USD', ts, impact: 'High', forecast: '4.1%', previous: '4.1%' },
  ];
  await chrome.storage.local.set({ testAlert: { ts, list } });
  await deliver(ts, 10, list, { ...settings, notifySystem: true, notifyWindow: true }, true);
  return { ok: true };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== 'bg') return;
  serial(async () => {
    switch (msg.type) {
      case 'refresh': return refreshCalendar({ force: !!msg.force });
      case 'test': return testAlert();
      case 'rates': return getRates(msg.base);
      case 'testResult':
        await showResultNotification(Date.now(), [
          { title: 'Nonfarm Payrolls', currency: 'USD', actual: '112K', forecast: '65K', surprise: 'up' },
          { title: 'Unemployment Rate', currency: 'USD', actual: '4.3%', forecast: '4.2%', surprise: 'down' },
        ], true);
        return { ok: true };
      case 'snooze':
        if (msg.ts - Date.now() < 30000) return { ok: false, error: 'Trop tard pour un rappel.' };
        chrome.alarms.create(`snooze|${msg.ts}|0`, { when: msg.ts });
        return { ok: true };
      default: return { ok: false, error: 'message inconnu' };
    }
  }).then(r => sendResponse(r), e => sendResponse({ ok: false, error: String(e) }));
  return true; // réponse asynchrone
});
