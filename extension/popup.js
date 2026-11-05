const BELL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>';
const BELL_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13.73 21a2 2 0 0 1-3.46 0"/><path d="M18.63 13A17.9 17.9 0 0 1 18 8"/><path d="M6.26 6.26A5.9 5.9 0 0 0 6 8c0 7-3 9-3 9h14"/><path d="M18 8a6 6 0 0 0-9.33-5"/><path d="M1 1l22 22"/></svg>';

let state = null;
let nextEvent = null;

async function render() {
  state = await loadState();
  const { settings, events, muted, fetchedAt, lastError } = state;
  const now = Date.now();

  // En-tête
  document.getElementById('updated').textContent = fetchedAt
    ? `Mis à jour à ${fmtTime(fetchedAt)}${dayKey(fetchedAt) !== dayKey(now) ? ` (${fmtDay(fetchedAt)})` : ''}`
    : 'Pas encore de données';
  document.getElementById('error').textContent = lastError || '';
  document.getElementById('sourceLabel').textContent = `Source : ${SOURCES[state.source]?.label || '—'} · heure locale`;
  document.getElementById('siteLink').href = SITE_URL;

  // Puces d'impact
  const chips = document.getElementById('impactChips');
  chips.innerHTML = ['High', 'Medium', 'Low'].map(k => `
    <button class="chip ${settings.impacts.includes(k) ? 'on' : ''}" data-impact="${k}" title="Alertes pour l'impact ${IMPACTS[k].label.toLowerCase()}">
      ${impactBarsHTML(k)} ${IMPACTS[k].label}
    </button>`).join('');
  document.getElementById('showAll').checked = !!settings.showAll;

  // Prochaine news suivie
  const followed = events.filter(e => e.ts > now && matches(e, settings, muted));
  nextEvent = followed[0] || null;
  const next = document.getElementById('next');
  if (nextEvent) {
    const group = followed.filter(e => e.ts === nextEvent.ts);
    const impact = maxImpact(group);
    next.className = '';
    next.style.setProperty('--c', IMPACTS[impact].color);
    next.innerHTML = `
      <div class="label">Prochaine news suivie</div>
      <div class="what">
        <span class="ccy">${esc(nextEvent.currency)}</span>
        ${impactBarsHTML(impact)}
        <b title="${esc(group.map(e => e.title).join(' · '))}">${esc(nextEvent.title)}${group.length > 1 ? ` <span style="color:var(--muted);font-weight:500">+${group.length - 1}</span>` : ''}</b>
      </div>
      <div class="when">
        <span>${dayLabel(nextEvent.ts)} à <b class="num" style="color:var(--text)">${fmtTime(nextEvent.ts)}</b> · alertes ${settings.leads.length ? settings.leads.slice().sort((a, b) => b - a).map(l => (l ? `${l}′` : 'à l’heure')).join(', ') : 'désactivées'}</span>
        <span class="cd num" id="cd"></span>
      </div>`;
  } else {
    next.className = 'empty';
    next.style.removeProperty('--c');
    next.textContent = !settings.impacts.length
      ? 'Aucun niveau d’impact sélectionné : coche Fort, Moyen ou Faible ci-dessous.'
      : events.length
      ? 'Aucune news à venir avec tes filtres cette semaine. Le calendrier de la semaine suivante arrive le week-end.'
      : 'Le calendrier n’est pas encore chargé.';
  }

  // Liste
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const visible = events.filter(e => e.ts >= startOfToday.getTime()
    && (settings.showAll || matches(e, settings, [])));
  const list = document.getElementById('list');
  if (!visible.length) {
    list.innerHTML = `<div class="empty-list">${events.length ? 'Rien à afficher avec ces filtres.' : '—'}</div>`;
  } else {
    let html = '', lastDay = '';
    for (const e of visible) {
      const dk = dayKey(e.ts);
      if (dk !== lastDay) { html += `<div class="day">${dayLabel(e.ts)}</div>`; lastDay = dk; }
      const followedByFilter = matches(e, settings, []);
      const isMuted = muted.includes(e.id);
      const past = e.ts <= now;
      const detail = [actualHTML(e), e.forecast && `Prév. ${esc(e.forecast)}`, e.previous && `Préc. ${esc(e.previous)}`].filter(Boolean).join(' · ');
      html += `
        <div class="row ${past ? 'past' : ''} ${followedByFilter ? '' : 'dim'} ${isMuted ? 'muted' : ''}">
          <span class="time num">${fmtTime(e.ts)}</span>
          <span class="ccy">${esc(e.currency)}</span>
          ${impactBarsHTML(e.impact)}
          <div class="title">
            <div title="${esc(e.title)}">${esc(e.title)}</div>
            <small>${detail}<span class="soon num" data-ts="${e.ts}" data-sep="${detail ? ' · ' : ''}"></span>&nbsp;</small>
          </div>
          ${followedByFilter && !past
            ? `<button class="icon-btn bell ${isMuted ? 'off' : ''}" data-id="${esc(e.id)}" title="${isMuted ? 'Réactiver l’alerte pour cette news' : 'Couper l’alerte pour cette news'}">${isMuted ? BELL_OFF : BELL}</button>`
            : '<span class="placeholder"></span>'}
        </div>`;
    }
    list.innerHTML = html;
  }
  tick();
}

function tick() {
  const now = Date.now();
  const cd = document.getElementById('cd');
  if (cd && nextEvent) cd.textContent = nextEvent.ts > now ? `dans ${fmtCountdown(nextEvent.ts - now)}` : 'maintenant';
  document.querySelectorAll('.soon').forEach(el => {
    const diff = Number(el.dataset.ts) - now;
    el.textContent = diff > 0 && diff <= 2 * 3600e3 ? `${el.dataset.sep}dans ${fmtCountdown(diff)}` : '';
  });
}

/* ---------- Interactions ---------- */

document.getElementById('impactChips').addEventListener('click', async ev => {
  const btn = ev.target.closest('[data-impact]');
  if (!btn) return;
  const k = btn.dataset.impact;
  const s = state.settings;
  s.impacts = s.impacts.includes(k) ? s.impacts.filter(x => x !== k) : [...s.impacts, k];
  btn.classList.toggle('on', s.impacts.includes(k));
  await chrome.storage.sync.set({ settings: s });
});

document.getElementById('showAll').addEventListener('change', ev => {
  state.settings.showAll = ev.target.checked;
  chrome.storage.sync.set({ settings: state.settings });
});

document.getElementById('list').addEventListener('click', async ev => {
  const btn = ev.target.closest('.bell');
  if (!btn) return;
  const id = btn.dataset.id;
  const { muted = [] } = await chrome.storage.local.get('muted');
  const next = muted.includes(id) ? muted.filter(x => x !== id) : [...muted, id];
  // On ne garde que les news encore présentes dans le calendrier
  const ids = new Set(state.events.map(e => e.id));
  await chrome.storage.local.set({ muted: next.filter(x => ids.has(x)) });
});

document.getElementById('settings').addEventListener('click', () => chrome.runtime.openOptionsPage());

// Onglets Calendrier / Calculateur
document.querySelector('.tabs').addEventListener('click', ev => {
  const btn = ev.target.closest('[data-tab]');
  if (!btn) return;
  for (const b of document.querySelectorAll('.tabs [data-tab]')) {
    const on = b === btn;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', on);
    document.getElementById(`tab-${b.dataset.tab}`).hidden = !on;
  }
  try { localStorage.setItem('tab', btn.dataset.tab); } catch (_) {}
});
try { if (localStorage.getItem('tab') === 'calc') document.querySelector('[data-tab="calc"]').click(); } catch (_) {}

document.getElementById('refresh').addEventListener('click', async () => {
  const btn = document.getElementById('refresh');
  btn.classList.add('spin'); btn.disabled = true;
  const res = await chrome.runtime.sendMessage({ target: 'bg', type: 'refresh' }).catch(e => ({ ok: false, error: String(e) }));
  btn.classList.remove('spin'); btn.disabled = false;
  await render();
  if (res?.cached) {
    const el = document.getElementById('updated');
    el.textContent = `Déjà à jour (${fmtTime(res.fetchedAt)}) — 1 requête / 5 min max`;
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' || changes.events || changes.muted || changes.lastError || changes.fetchedAt) render();
});

// Au premier affichage, on fait défiler la liste jusqu'à la prochaine news
render().then(() => {
  const list = document.getElementById('list');
  const first = list.querySelector('.row:not(.past)');
  const header = first && first.previousElementSibling?.classList.contains('day') ? first.previousElementSibling : first;
  if (header) list.scrollTop = header.offsetTop - list.offsetTop;
});
setInterval(tick, 1000);
