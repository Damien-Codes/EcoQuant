/* Calculateur de position — onglet du popup.
   Taille = montant risqué ÷ (stop × valeur d'un pip pour 1 lot), arrondie vers le bas au pas du broker. */

const ACCOUNT_CCYS = ['EUR', 'USD', 'GBP', 'CHF'];

// pip = plus petite variation « comptée » ; contract = unités pour 1 lot. Valeur d'1 pip / lot = pip × contract (en devise de cotation).
const FX = (sym, quote, pip = 0.0001) => ({ sym, label: `${sym.slice(0, 3)}/${sym.slice(3)}`, group: 'Forex', quote, pip, contract: 100000, unit: 'pips' });
const INSTRUMENTS = [
  FX('EURUSD', 'USD'), FX('GBPUSD', 'USD'), FX('AUDUSD', 'USD'), FX('NZDUSD', 'USD'),
  FX('USDJPY', 'JPY', 0.01), FX('USDCHF', 'CHF'), FX('USDCAD', 'CAD'),
  FX('EURGBP', 'GBP'), FX('EURJPY', 'JPY', 0.01), FX('GBPJPY', 'JPY', 0.01), FX('EURCHF', 'CHF'), FX('AUDJPY', 'JPY', 0.01),
  { sym: 'XAUUSD', label: 'Or (XAU/USD)', group: 'Métaux', quote: 'USD', pip: 0.1, contract: 100, unit: 'pips (0,10 $)' },
  { sym: 'XAGUSD', label: 'Argent (XAG/USD)', group: 'Métaux', quote: 'USD', pip: 0.01, contract: 5000, unit: 'pips (0,01 $)' },
  // Indices / crypto : la valeur d'un point pour 1 lot dépend du broker → modifiable (champ « Avancé »)
  { sym: 'US30', label: 'Dow Jones (US30)', group: 'Indices', quote: 'USD', pip: 1, contract: 1, unit: 'points' },
  { sym: 'NAS100', label: 'Nasdaq 100 (NAS100)', group: 'Indices', quote: 'USD', pip: 1, contract: 1, unit: 'points' },
  { sym: 'US500', label: 'S&P 500 (US500)', group: 'Indices', quote: 'USD', pip: 1, contract: 1, unit: 'points' },
  { sym: 'GER40', label: 'DAX (GER40)', group: 'Indices', quote: 'EUR', pip: 1, contract: 1, unit: 'points' },
  { sym: 'FRA40', label: 'CAC 40 (FRA40)', group: 'Indices', quote: 'EUR', pip: 1, contract: 1, unit: 'points' },
  { sym: 'UK100', label: 'FTSE 100 (UK100)', group: 'Indices', quote: 'GBP', pip: 1, contract: 1, unit: 'points' },
  { sym: 'BTCUSD', label: 'Bitcoin (BTC/USD)', group: 'Crypto', quote: 'USD', pip: 1, contract: 1, unit: 'points (1 $)' },
];

const CALC_DEFAULTS = {
  account: 'EUR', capital: 10000, riskMode: 'pct', risk: 1, sym: 'EURUSD', stop: 20, tp: '', step: 0.01,
  overrides: {},   // valeur d'1 pip/point pour 1 lot (devise du compte), par instrument, saisie à la main
  manualRates: {}, // taux saisis à la main si le serveur ne répond pas : { 'EUR>USD': 1.08 }
};

let calc = null;          // valeurs du formulaire
let calcRates = null;     // { base, rates, date, stale }

const nf = (n, d = 2) => new Intl.NumberFormat('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
const num = v => { const n = parseFloat(String(v).replace(',', '.').replace(/\s/g, '')); return Number.isFinite(n) ? n : NaN; };

function calcFormHTML() {
  const groups = [...new Set(INSTRUMENTS.map(i => i.group))];
  return `
  <form class="calc" id="calcForm" autocomplete="off">
    <div class="calc-grid">
      <label>Capital
        <div class="in-unit"><input id="cCapital" inputmode="decimal"><select id="cAccount" aria-label="Devise du compte">
          ${ACCOUNT_CCYS.map(c => `<option>${c}</option>`).join('')}</select></div>
      </label>
      <label>Risque
        <div class="in-unit"><input id="cRisk" inputmode="decimal"><select id="cRiskMode" aria-label="Type de risque">
          <option value="pct">%</option><option value="amount">montant</option></select></div>
      </label>
      <label class="wide">Instrument
        <select id="cSym">${groups.map(g => `<optgroup label="${g}">${INSTRUMENTS.filter(i => i.group === g)
          .map(i => `<option value="${i.sym}">${esc(i.label)}</option>`).join('')}</optgroup>`).join('')}</select>
      </label>
      <label>Stop loss <small id="cUnit1"></small><input id="cStop" inputmode="decimal"></label>
      <label>Take profit <small id="cUnit2"></small><input id="cTp" inputmode="decimal" placeholder="facultatif"></label>
    </div>

    <div class="calc-out" id="calcOut" aria-live="polite"></div>

    <details class="calc-adv">
      <summary>Avancé</summary>
      <label>Valeur d'1 <span id="cUnit3">pip</span> pour 1 lot (<span class="cAcc"></span>)
        <input id="cPipValue" inputmode="decimal"><small id="cPipHint"></small></label>
      <label id="cRateRow">Taux de change <small id="cRateHint"></small><input id="cRate" inputmode="decimal"></label>
      <label>Pas de taille du broker (lots)<input id="cStep" inputmode="decimal"></label>
    </details>
    <p class="calc-note">Vérifie toujours la taille de contrat chez ton broker (surtout indices et métaux). Outil de calcul, pas un conseil en investissement.</p>
  </form>`;
}

async function loadRates(base) {
  if (calcRates?.base === base) return;
  const res = await chrome.runtime.sendMessage({ target: 'bg', type: 'rates', base }).catch(() => null);
  calcRates = res?.ok ? { base, rates: res.rates || {}, date: res.date, stale: !!res.stale } : { base, rates: {}, error: res?.error || 'indisponible' };
}

function instrument() { return INSTRUMENTS.find(i => i.sym === calc.sym) || INSTRUMENTS[0]; }

// Combien de devise de cotation pour 1 unité de devise du compte
function quotePerAccount(quote) {
  if (quote === calc.account) return { rate: 1, src: 'same' };
  const manual = calc.manualRates[`${calc.account}>${quote}`];
  if (manual) return { rate: manual, src: 'manual' };
  const r = calcRates?.rates?.[quote];
  if (r) return { rate: r, src: 'ecb' };
  return { rate: NaN, src: 'missing' };
}

function compute() {
  const ins = instrument();
  const capital = num(calc.capital), risk = num(calc.risk), stop = num(calc.stop), tp = num(calc.tp), step = num(calc.step) || 0.01;
  const fx = quotePerAccount(ins.quote);
  const autoPipValue = (ins.pip * ins.contract) / fx.rate; // en devise du compte
  const override = num(calc.overrides[ins.sym]);
  const pipValue = Number.isFinite(override) && override > 0 ? override : autoPipValue;
  const riskAmount = calc.riskMode === 'pct' ? capital * risk / 100 : risk;
  const lotsRaw = riskAmount / (stop * pipValue);
  const lots = Math.floor(lotsRaw / step + 1e-9) * step;
  return {
    ins, fx, autoPipValue, pipValue, riskAmount, lotsRaw, lots, step,
    realRisk: lots * stop * pipValue,
    gain: Number.isFinite(tp) && tp > 0 ? lots * tp * pipValue : NaN,
    rr: Number.isFinite(tp) && tp > 0 ? tp / stop : NaN,
    valid: capital > 0 && risk > 0 && stop > 0 && Number.isFinite(pipValue) && pipValue > 0,
  };
}

function renderCalcOutput() {
  const r = compute();
  const acc = calc.account;
  const decimals = Math.max(0, -Math.floor(Math.log10(r.step) + 1e-9));
  const $ = id => document.getElementById(id);
  $('cUnit1').textContent = `(${r.ins.unit})`;
  $('cUnit2').textContent = `(${r.ins.unit})`;
  $('cUnit3').textContent = r.ins.unit.startsWith('points') ? 'point' : 'pip';
  document.querySelectorAll('.cAcc').forEach(el => { el.textContent = acc; });
  $('cPipHint').textContent = Number.isFinite(r.autoPipValue)
    ? `Calculé : ${nf(r.autoPipValue)} ${acc} (1 lot = ${new Intl.NumberFormat('fr-FR').format(r.ins.contract)} unités). Laisse vide pour la valeur calculée.`
    : 'Saisis la valeur donnée par ton broker.';
  $('cPipValue').placeholder = Number.isFinite(r.autoPipValue) ? nf(r.autoPipValue) : '';

  const needRate = r.ins.quote !== acc;
  $('cRateRow').hidden = !needRate;
  if (needRate) {
    $('cRateHint').textContent = r.fx.src === 'ecb'
      ? `1 ${acc} = ${nf(r.fx.rate, 4)} ${r.ins.quote} (BCE${calcRates?.date ? ` du ${calcRates.date}` : ''}${calcRates?.stale ? ', ancien' : ''})`
      : r.fx.src === 'manual' ? `1 ${acc} = ? ${r.ins.quote} (saisi à la main)` : `1 ${acc} = ? ${r.ins.quote} — taux indisponible, saisis-le`;
    $('cRate').placeholder = r.fx.src === 'ecb' ? nf(r.fx.rate, 4) : '';
  }

  const out = $('calcOut');
  if (!r.valid) {
    out.innerHTML = `<div class="calc-empty">${r.fx.src === 'missing' && !(num(calc.overrides[r.ins.sym]) > 0)
      ? `Taux ${acc} → ${r.ins.quote} indisponible : saisis-le dans « Avancé ».`
      : 'Renseigne capital, risque et stop.'}</div>`;
    return;
  }
  const tooSmall = r.lots < r.step;
  out.innerHTML = `
    <div class="calc-main ${tooSmall ? 'warn' : ''}">
      <span>Taille de position</span>
      <b class="num">${tooSmall ? '—' : nf(r.lots, decimals)} <small>lot${r.lots >= 2 ? 's' : ''}</small></b>
      ${tooSmall ? `<em>Stop trop large pour ce risque : même ${nf(r.step, decimals)} lot dépasse ${nf(r.riskAmount)} ${acc}.</em>`
        : r.ins.group === 'Forex' ? `<em class="num">${new Intl.NumberFormat('fr-FR').format(Math.round(r.lots * r.ins.contract))} unités</em>` : ''}
    </div>
    <dl class="calc-kv">
      <div><dt>Montant risqué</dt><dd class="num">${nf(tooSmall ? r.riskAmount : r.realRisk)} ${acc}${!tooSmall && r.realRisk < r.riskAmount - 0.005
        ? ` <small>(visé ${nf(r.riskAmount)})</small>` : ''}</dd></div>
      <div><dt>Valeur d'1 ${r.ins.unit.startsWith('points') ? 'point' : 'pip'}</dt><dd class="num">${nf(tooSmall ? r.pipValue * r.step : r.pipValue * r.lots)} ${acc}</dd></div>
      ${Number.isFinite(r.gain) ? `
      <div><dt>Gain potentiel</dt><dd class="num act-up">${tooSmall ? '—' : `${nf(r.gain)} ${acc}`}</dd></div>
      <div><dt>Ratio R:R</dt><dd class="num">1 : ${nf(r.rr)}</dd></div>` : ''}
    </dl>`;
}

function fillCalcForm() {
  const $ = id => document.getElementById(id);
  $('cCapital').value = calc.capital;
  $('cAccount').value = calc.account;
  $('cRisk').value = calc.risk;
  $('cRiskMode').value = calc.riskMode;
  $('cSym').value = calc.sym;
  $('cStop').value = calc.stop;
  $('cTp').value = calc.tp;
  $('cStep').value = calc.step;
  $('cPipValue').value = calc.overrides[calc.sym] ?? '';
  $('cRate').value = calc.manualRates[`${calc.account}>${instrument().quote}`] ?? '';
}

let saveTimer = null;
function saveCalc() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => chrome.storage.local.set({ calc }), 300);
}

function bindCalc() {
  const form = document.getElementById('calcForm');
  form.addEventListener('submit', ev => ev.preventDefault()); // Entrée ne recharge pas le popup
  form.addEventListener('input', async ev => {
    const id = ev.target.id, v = ev.target.value;
    const ins = instrument();
    switch (id) {
      case 'cCapital': calc.capital = v; break;
      case 'cRisk': calc.risk = v; break;
      case 'cRiskMode': calc.riskMode = v; break;
      case 'cStop': calc.stop = v; break;
      case 'cTp': calc.tp = v; break;
      case 'cStep': calc.step = v; break;
      case 'cPipValue':
        if (num(v) > 0) calc.overrides[ins.sym] = v; else delete calc.overrides[ins.sym];
        break;
      case 'cRate':
        if (num(v) > 0) calc.manualRates[`${calc.account}>${ins.quote}`] = num(v); else delete calc.manualRates[`${calc.account}>${ins.quote}`];
        break;
      case 'cSym': calc.sym = v; fillCalcForm(); break;
      case 'cAccount': calc.account = v; await loadRates(v); fillCalcForm(); break;
    }
    renderCalcOutput();
    saveCalc();
  });
}

// Construit le calculateur une seule fois, à l'ouverture du popup
async function initCalc() {
  const root = document.getElementById('tab-calc');
  const { calc: saved } = await chrome.storage.local.get('calc');
  calc = { ...CALC_DEFAULTS, ...(saved || {}) };
  calc.overrides = { ...(saved?.overrides || {}) };
  calc.manualRates = { ...(saved?.manualRates || {}) };
  root.innerHTML = calcFormHTML();
  fillCalcForm();
  bindCalc();
  renderCalcOutput();
  await loadRates(calc.account);
  renderCalcOutput();
}
initCalc();
