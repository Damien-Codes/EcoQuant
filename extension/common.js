/* Code partagé : background, popup, options et fenêtre d'alerte. */

// Site de l'extension (GitHub Pages)
const SITE_URL = 'https://damien-codes.github.io/EcoQuant-Site/';

const FEED_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
const CALENDAR_URL = 'https://www.investing.com/economic-calendar/';
const INVESTING_API = 'https://www.investing.com/economic-calendar/Service/getCalendarFilteredData';
const RATES_URL = 'https://api.frankfurter.dev/v1/latest'; // taux de change BCE (gratuit), pour le calculateur

const SOURCES = {
  investing:    { label: 'Investing.com', hint: "Le calendrier d'Investing.com, sur 8 jours glissants, avec le chiffre réel après publication. Si le site refuse la requête (anti-robot), l'extension passe automatiquement sur Forex Factory." },
  forexfactory: { label: 'Forex Factory', hint: 'Flux public très fiable, mais limité à la semaine en cours et sans chiffre réel après publication.' },
};

const IMPACTS = {
  High:    { label: 'Fort',   level: 3, color: '#ef4444' },
  Medium:  { label: 'Moyen',  level: 2, color: '#f59e0b' },
  Low:     { label: 'Faible', level: 1, color: '#eab308' },
  Holiday: { label: 'Férié',  level: 0, color: '#64748b' },
};

const CURRENCIES = [
  { code: 'USD', name: 'Dollar US' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'Livre sterling' },
  { code: 'JPY', name: 'Yen' },
  { code: 'CHF', name: 'Franc suisse' },
  { code: 'CAD', name: 'Dollar canadien' },
  { code: 'AUD', name: 'Dollar australien' },
  { code: 'NZD', name: 'Dollar néo-zélandais' },
  { code: 'CNY', name: 'Yuan' },
];

const LEAD_CHOICES = [60, 30, 15, 10, 5, 0]; // minutes avant la news (0 = au moment de la publication)

const DEFAULT_SETTINGS = {
  source: 'investing',
  impacts: ['High'],
  currencies: CURRENCIES.map(c => c.code),
  leads: [30, 10],
  notifySystem: true,
  notifyWindow: true,
  sound: true,
  volume: 0.7,
  showResult: true,
  quietEnabled: false,
  quietStart: '23:00',
  quietEnd: '07:00',
  showAll: false,
};

/* ---------- Stockage ---------- */

async function getSettings() {
  const { settings } = await chrome.storage.sync.get('settings');
  const s = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  if (!SOURCES[s.source]) s.source = 'investing';
  return s;
}

async function saveSettings(patch) {
  const current = await getSettings();
  const next = { ...current, ...patch };
  await chrome.storage.sync.set({ settings: next });
  return next;
}

async function loadState() {
  const [settings, local] = await Promise.all([
    getSettings(),
    chrome.storage.local.get(['events', 'fetchedAt', 'lastError', 'muted', 'fired', 'source']),
  ]);
  return {
    settings,
    source: local.source || null,
    events: local.events || [],
    fetchedAt: local.fetchedAt || 0,
    lastError: local.lastError || null,
    muted: local.muted || [],
    fired: local.fired || {},
  };
}

/* ---------- Données ---------- */

/* --- Investing.com : la réponse est du HTML (lignes <tr>) dans du JSON. Pas de DOMParser dans un
       service worker, donc on lit les lignes avec des expressions régulières. Heures demandées en UTC. */

const INVESTING_IMPACT = { bull1: 'Low', bull2: 'Medium', bull3: 'High' };

// Jours fériés : Investing ne donne que le pays, on le rattache à la devise
const INVESTING_COUNTRY_CCY = {
  United_States: 'USD', Europe: 'EUR', Germany: 'EUR', France: 'EUR', Italy: 'EUR', Spain: 'EUR',
  United_Kingdom: 'GBP', Japan: 'JPY', Switzerland: 'CHF', Canada: 'CAD', Australia: 'AUD',
  New_Zealand: 'NZD', China: 'CNY',
};

function decodeEntities(s) {
  return String(s)
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function cellText(row, re) {
  const m = row.match(re);
  return m ? decodeEntities(m[1]) : '';
}

function parseInvestingHTML(html) {
  const out = [];
  let currentDay = null; // date UTC (minuit) de la section en cours, pour les jours fériés
  const re = /<td[^>]*class="theDay"[^>]*id="theDay(\d+)"|<tr id="eventRowId_(\d+)"([^>]*)>([\s\S]*?)<\/tr>/g;
  let m;
  while ((m = re.exec(html))) {
    if (m[1]) { currentDay = Number(m[1]) * 1000; continue; }
    const [, , rowId, attrs, body] = m;

    if (/>\s*Holiday\s*</.test(body)) {
      const country = (body.match(/data-img_key="([A-Za-z_]+)"/) || [])[1];
      const currency = INVESTING_COUNTRY_CCY[country];
      const title = cellText(body, /<td[^>]*class="left event"[^>]*>([\s\S]*?)<\/td>/);
      if (!currency || !title || currentDay == null) continue;
      out.push({ id: `inv|hol|${country}|${currentDay}`, title, currency, ts: currentDay,
        impact: 'Holiday', forecast: '', previous: '', url: CALENDAR_URL });
      continue;
    }

    const dt = (attrs.match(/data-event-datetime="(\d{4})\/(\d\d)\/(\d\d) (\d\d):(\d\d)/) || []).slice(1).map(Number);
    if (dt.length !== 5) continue;
    const ts = Date.UTC(dt[0], dt[1] - 1, dt[2], dt[3], dt[4]);
    const currency = (body.match(/class="[^"]*flagCur[^"]*"[^>]*>[\s\S]*?<\/span>\s*([A-Z]{3})\s*</) || [])[1];
    const bull = (body.match(/data-img_key="(bull\d)"/) || [])[1];
    const link = body.match(/<td[^>]*class="left event"[^>]*>\s*<a href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/);
    if (!currency || !link) continue;
    out.push({
      id: `inv|${rowId}`,
      title: decodeEntities(link[2]),
      currency,
      ts,
      impact: INVESTING_IMPACT[bull] || 'Low',
      actual: cellText(body, /id="eventActual_\d+"[^>]*>([\s\S]*?)<\/td>/),
      // Couleur Investing : vert = meilleur que prévu pour la devise, rouge = moins bon
      surprise: { greenFont: 'up', redFont: 'down' }[(body.match(/class="[^"]*\bact\b[^"]*\b(greenFont|redFont)\b/) || [])[1]] || '',
      forecast: cellText(body, /id="eventForecast_\d+"[^>]*>([\s\S]*?)<\/td>/),
      previous: cellText(body, /id="eventPrevious_\d+"[^>]*>([\s\S]*?)<\/td>/),
      url: link[1].startsWith('http') ? link[1] : `https://www.investing.com${link[1]}`,
    });
  }
  return out;
}

function sortEvents(list) {
  const seen = new Set();
  return list
    .filter(e => e.title && Number.isFinite(e.ts) && !seen.has(e.id) && seen.add(e.id))
    .sort((a, b) => a.ts - b.ts || IMPACTS[b.impact].level - IMPACTS[a.impact].level);
}

/* --- Forex Factory : JSON prêt à l'emploi --- */

function normalizeEvents(raw) {
  return raw
    .map(e => ({
      id: `${e.country}|${e.date}|${e.title}`,
      title: String(e.title || '').trim(),
      currency: String(e.country || '').toUpperCase(),
      ts: Date.parse(e.date),
      impact: IMPACTS[e.impact] ? e.impact : 'Low',
      forecast: e.forecast || '',
      previous: e.previous || '',
    }))
    .filter(e => e.title && Number.isFinite(e.ts))
    .sort((a, b) => a.ts - b.ts || IMPACTS[b.impact].level - IMPACTS[a.impact].level);
}

function matches(e, settings, muted = []) {
  return settings.impacts.includes(e.impact)
    && settings.currencies.includes(e.currency)
    && !muted.includes(e.id);
}

function maxImpact(list) {
  return list.reduce((best, e) => (IMPACTS[e.impact].level > IMPACTS[best].level ? e.impact : best), list[0]?.impact || 'Low');
}

function inQuietHours(settings, date = new Date()) {
  if (!settings.quietEnabled) return false;
  const toMin = s => { const [h, m] = String(s).split(':').map(Number); return h * 60 + (m || 0); };
  const start = toMin(settings.quietStart), end = toMin(settings.quietEnd);
  const cur = date.getHours() * 60 + date.getMinutes();
  if (start === end) return false;
  return start < end ? cur >= start && cur < end : cur >= start || cur < end;
}

/* ---------- Formatage (heure locale du navigateur) ---------- */

const _fmtTime = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
const _fmtDay = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

function fmtTime(ts) { return _fmtTime.format(new Date(ts)); }
function fmtDay(ts) { return _fmtDay.format(new Date(ts)); }

function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function dayLabel(ts) {
  const now = Date.now();
  if (dayKey(ts) === dayKey(now)) return "Aujourd'hui";
  if (dayKey(ts) === dayKey(now + 864e5)) return 'Demain';
  const s = fmtDay(ts);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function fmtCountdown(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  if (h < 24) return r ? `${h} h ${String(r).padStart(2, '0')}` : `${h} h`;
  const days = Math.floor(h / 24);
  return `${days} j ${h % 24} h`;
}

function leadLabel(lead) {
  return lead === 0 ? 'Au moment de la news' : `${lead} min avant`;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const SURPRISE = {
  up:   { arrow: '▲', label: 'meilleur que prévu', cls: 'act-up' },
  down: { arrow: '▼', label: 'moins bon que prévu', cls: 'act-down' },
  '':   { arrow: '=', label: 'conforme / sans prévision', cls: 'act-flat' },
};

// « Réel 112K ▲ » coloré, pour le popup et la fenêtre d'alerte
function actualHTML(e) {
  if (!e.actual) return '';
  const s = SURPRISE[e.surprise || ''];
  return `<b class="${s.cls}" title="${s.label}">Réel ${esc(e.actual)} ${s.arrow}</b>`;
}

function impactBarsHTML(impact) {
  const info = IMPACTS[impact];
  if (info.level === 0) return `<span class="bars holiday" title="Jour férié">F</span>`;
  let html = `<span class="bars" title="Impact ${info.label.toLowerCase()}" style="--c:${info.color}">`;
  for (let i = 1; i <= 3; i++) html += `<i class="${i <= info.level ? 'on' : ''}"></i>`;
  return html + '</span>';
}
