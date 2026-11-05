const params = new URLSearchParams(location.search);
const TS = Number(params.get('ts'));
const LEAD = Number(params.get('lead') || 0);
const TEST = params.get('test') === '1';

async function getEvents() {
  if (TEST) {
    const { testAlert } = await chrome.storage.local.get('testAlert');
    return testAlert?.list || [];
  }
  const state = await loadState();
  const atTime = state.events.filter(e => e.ts === TS);
  const followed = atTime.filter(e => matches(e, state.settings, state.muted));
  return followed.length ? followed : atTime;
}

function tick() {
  const diff = TS - Date.now();
  const cd = document.getElementById('cd');
  if (diff > 0) {
    const s = Math.ceil(diff / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    cd.textContent = h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  } else if (diff > -60000) {
    cd.textContent = "C'est l'heure !";
  } else {
    cd.textContent = `Publiée il y a ${fmtCountdown(-diff)}`;
  }
  document.title = diff > 0 ? `⏰ ${cd.textContent} — EcoQuant` : 'News publiée';
}

function renderEvents(events) {
  document.getElementById('events').innerHTML = events.map(e => {
    const detail = [actualHTML(e), e.forecast && `Prévision ${esc(e.forecast)}`, e.previous && `Précédent ${esc(e.previous)}`].filter(Boolean).join(' · ');
    return `<li>
      <span class="ccy">${esc(e.currency)}</span>
      ${impactBarsHTML(e.impact)}
      <div class="title"><div title="${esc(e.title)}">${esc(e.title)}</div>${detail ? `<small>${detail}</small>` : ''}</div>
    </li>`;
  }).join('') || '<li style="color:var(--muted)">News introuvable (calendrier mis à jour ?)</li>';
}

async function fitAndPlace() {
  try {
    const win = await chrome.windows.getCurrent();
    const frame = Math.max(0, window.outerHeight - window.innerHeight);
    const height = Math.min(document.documentElement.scrollHeight + frame + 2, screen.availHeight - 40);
    const width = win.width || 440;
    await chrome.windows.update(win.id, {
      height: Math.round(height),
      left: Math.round(screen.availLeft + screen.availWidth - width - 24),
      top: Math.round(screen.availTop + 24),
      focused: true,
    });
  } catch (_) { /* positionnement facultatif */ }
  window.scrollTo(0, 0);
}

(async () => {
  const events = await getEvents();
  const impact = events.length ? maxImpact(events) : 'High';
  document.documentElement.style.setProperty('--c', IMPACTS[impact].color);
  document.getElementById('kicker').textContent = `${LEAD ? `Alerte ${LEAD} min avant` : 'Publication'} · impact ${IMPACTS[impact].label.toLowerCase()}`;
  document.getElementById('testTag').hidden = !TEST;
  document.getElementById('sub').innerHTML = `${LEAD ? 'avant la publication de' : 'publication prévue à'} <b class="num">${fmtTime(TS)}</b> · ${esc(dayLabel(TS).toLowerCase())}`;

  renderEvents(events);
  // Si la fenêtre est encore ouverte à la publication, le chiffre réel s'affiche tout seul
  if (!TEST) chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.events) getEvents().then(renderEvents);
  });

  const withLink = events.find(e => e.url && e.url !== CALENDAR_URL);
  if (withLink) document.getElementById('open').href = withLink.url; // fiche de la news sur Investing.com

  const snooze = document.getElementById('snooze');
  snooze.textContent = `Me rappeler à ${fmtTime(TS)}`;
  snooze.hidden = TEST || LEAD === 0 || TS - Date.now() < 30000;

  tick();
  setInterval(tick, 1000);
  requestAnimationFrame(fitAndPlace);
})();

document.getElementById('snooze').addEventListener('click', async ev => {
  const res = await chrome.runtime.sendMessage({ target: 'bg', type: 'snooze', ts: TS }).catch(() => null);
  if (res?.ok) window.close();
  else { ev.target.disabled = true; ev.target.textContent = 'Trop tard pour un rappel'; }
});
document.getElementById('ok').addEventListener('click', () => window.close());
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' || ev.key === 'Enter') window.close(); });
