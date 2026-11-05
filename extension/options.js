const IMPACT_HINTS = {
  High: 'NFP, CPI, taux directeurs, FOMC…',
  Medium: 'PMI, ventes au détail, PIB prélim…',
  Low: 'Indicateurs secondaires',
  Holiday: 'Banques fermées, faible liquidité',
};

let settings = null;
let savedTimer = null;

function flashSaved() {
  const el = document.getElementById('saved');
  el.classList.add('show');
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => el.classList.remove('show'), 1400);
}

async function update(patch) {
  settings = { ...settings, ...patch }; // mis à jour tout de suite : pas de perte si on clique vite
  renderWarnings();
  await chrome.storage.sync.set({ settings });
  flashSaved();
  setTimeout(renderScheduled, 400); // laisse le service worker reprogrammer
}

function render() {
  // Impacts
  document.getElementById('impacts').innerHTML = Object.keys(IMPACTS).map(k => `
    <label class="impact-card">
      <input type="checkbox" data-impact="${k}" ${settings.impacts.includes(k) ? 'checked' : ''}>
      <span class="h">${impactBarsHTML(k)} ${k === 'Holiday' ? 'Jours fériés' : IMPACTS[k].label}</span>
      <small>${IMPACT_HINTS[k]}</small>
    </label>`).join('');

  // Source
  document.getElementById('sources').innerHTML = Object.entries(SOURCES).map(([k, s]) => `
    <label class="impact-card">
      <input type="radio" name="source" data-source="${k}" ${settings.source === k ? 'checked' : ''}>
      <span class="h">${s.label}</span>
      <small>${s.hint}</small>
    </label>`).join('');

  // Devises
  document.getElementById('currencies').innerHTML = CURRENCIES.map(c => `
    <button class="chip ${settings.currencies.includes(c.code) ? 'on' : ''}" data-ccy="${c.code}" title="${c.name}">${c.code}</button>`).join('');

  // Délais
  document.getElementById('leads').innerHTML = LEAD_CHOICES.map(l => `
    <button class="chip ${settings.leads.includes(l) ? 'on' : ''}" data-lead="${l}">${leadLabel(l)}</button>`).join('');

  // Interrupteurs
  for (const id of ['notifySystem', 'notifyWindow', 'sound', 'quietEnabled', 'showResult']) document.getElementById(id).checked = !!settings[id];
  document.getElementById('volume').value = settings.volume;
  document.getElementById('quietStart').value = settings.quietStart;
  document.getElementById('quietEnd').value = settings.quietEnd;
  document.getElementById('volumeRow').style.opacity = settings.sound ? 1 : .4;
  renderWarnings();
}

function renderWarnings() {
  document.getElementById('warnImpacts').textContent = settings.impacts.length ? '' : 'Aucun niveau coché : tu ne recevras aucune alerte.';
  document.getElementById('warnCcy').textContent = settings.currencies.length ? '' : 'Aucune devise cochée : tu ne recevras aucune alerte.';
  document.getElementById('warnLeads').textContent = settings.leads.length ? '' : 'Aucun délai coché : tu ne recevras aucune alerte.';
  document.getElementById('warnType').textContent = (settings.notifySystem || settings.notifyWindow || settings.sound) ? '' : 'Tout est désactivé : les alertes seront silencieuses et invisibles.';
}

async function renderScheduled() {
  const [alarms, state] = await Promise.all([chrome.alarms.getAll(), loadState()]);
  document.getElementById('sourceStatus').textContent = state.lastError
    || (state.source && state.fetchedAt
      ? `Données actuelles : ${SOURCES[state.source]?.label || state.source} · ${state.events.length} news · mises à jour à ${fmtTime(state.fetchedAt)}`
      : '');
  const items = alarms
    .filter(a => a.name.startsWith('alert|') || a.name.startsWith('snooze|'))
    .sort((a, b) => a.scheduledTime - b.scheduledTime)
    .slice(0, 6);
  const ul = document.getElementById('scheduled');
  if (!items.length) {
    ul.innerHTML = `<li style="color:var(--muted)">${state.events.length ? 'Aucune alerte à venir cette semaine avec ces réglages.' : 'Calendrier pas encore chargé.'}</li>`;
    return;
  }
  ul.innerHTML = items.map(a => {
    const [, ts, lead] = a.name.split('|');
    const evs = state.events.filter(e => e.ts === Number(ts) && matches(e, state.settings, state.muted));
    const names = evs.map(e => `${e.currency} ${e.title}`).join(' · ');
    return `<li>
      <span class="t num">${dayLabel(a.scheduledTime)} ${fmtTime(a.scheduledTime)}</span>
      ${evs[0] ? impactBarsHTML(maxImpact(evs)) : ''}
      <span class="n" title="${esc(names)}">${esc(names || '—')}</span>
      <small style="color:var(--faint)">${Number(lead) ? `${lead} min avant` : 'à l’heure'}</small>
    </li>`;
  }).join('');
}

/* ---------- Événements ---------- */

document.getElementById('impacts').addEventListener('change', ev => {
  const k = ev.target.dataset.impact;
  if (!k) return;
  const impacts = ev.target.checked ? [...new Set([...settings.impacts, k])] : settings.impacts.filter(x => x !== k);
  update({ impacts });
});

document.getElementById('sources').addEventListener('change', ev => {
  const k = ev.target.dataset.source;
  if (k) update({ source: k });
});

document.getElementById('currencies').addEventListener('click', ev => {
  const btn = ev.target.closest('[data-ccy]');
  if (!btn) return;
  const c = btn.dataset.ccy;
  const on = !settings.currencies.includes(c);
  btn.classList.toggle('on', on);
  update({ currencies: on ? [...settings.currencies, c] : settings.currencies.filter(x => x !== c) });
});
document.getElementById('allCcy').addEventListener('click', () => { update({ currencies: CURRENCIES.map(c => c.code) }).then(render); });
document.getElementById('noCcy').addEventListener('click', () => { update({ currencies: [] }).then(render); });

document.getElementById('leads').addEventListener('click', ev => {
  const btn = ev.target.closest('[data-lead]');
  if (!btn) return;
  const l = Number(btn.dataset.lead);
  const on = !settings.leads.includes(l);
  btn.classList.toggle('on', on);
  update({ leads: (on ? [...settings.leads, l] : settings.leads.filter(x => x !== l)).sort((a, b) => b - a) });
});


for (const id of ['notifySystem', 'notifyWindow', 'sound', 'quietEnabled', 'showResult']) {
  document.getElementById(id).addEventListener('change', ev => {
    update({ [id]: ev.target.checked });
    if (id === 'sound') document.getElementById('volumeRow').style.opacity = ev.target.checked ? 1 : .4;
  });
}
document.getElementById('volume').addEventListener('change', ev => update({ volume: Number(ev.target.value) }));
document.getElementById('quietStart').addEventListener('change', ev => update({ quietStart: ev.target.value || '23:00' }));
document.getElementById('quietEnd').addEventListener('change', ev => update({ quietEnd: ev.target.value || '07:00' }));

document.getElementById('testSound').addEventListener('click', () => {
  const a = new Audio('sounds/alert.wav');
  a.volume = Number(document.getElementById('volume').value);
  a.play();
});

document.getElementById('testAlert').addEventListener('click', async ev => {
  ev.target.disabled = true;
  await chrome.runtime.sendMessage({ target: 'bg', type: 'test' }).catch(() => {});
  setTimeout(() => { ev.target.disabled = false; }, 1500);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.events || changes.muted || changes.lastError || changes.source)) renderScheduled();
});

(async () => {
  settings = await getSettings();
  render();
  renderScheduled();
})();

document.getElementById('testResult').addEventListener('click', async ev => {
  ev.target.disabled = true;
  await chrome.runtime.sendMessage({ target: 'bg', type: 'testResult' }).catch(() => {});
  setTimeout(() => { ev.target.disabled = false; }, 1500);
});

document.getElementById('siteLink').href = SITE_URL;
