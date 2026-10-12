const $ = s => document.querySelector(s);
const ld = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
let remote = false, notes = ld('bd_notes', []);
const CUR = { USD: '$', EUR: '€', CHF: 'CHF ' };
const _s = ld('bd_start', 0);
let tx = ld('bd_tx', []).map(t => ({ cur: 'USD', ...t })), start = typeof _s === 'number' ? { USD: _s, EUR: 0, CHF: 0 } : _s,
  rates = ld('bd_rates', { USD: 1, EUR: 0.92, CHF: 0.8, ts: null }), base = ld('bd_base', 'USD'), lastCur = ld('bd_cur', ld('bd_base', 'USD')),
  cats = ld('bd_cats', { exp: ['Еда', 'Транспорт', 'Жильё', 'Покупки', 'Развлечения', 'Здоровье', 'Подписки', 'Другое'], inc: ['Зарплата', 'Подработка', 'Подарок', 'Другое'] }),
  kind = '-', tab = 'overview', editId = null, hm = new Date(), sel = {};
const save = () => {
  if (remote) return persistSettings();
  try { localStorage.setItem('bd_tx', JSON.stringify(tx)); localStorage.setItem('bd_start', JSON.stringify(start)); localStorage.setItem('bd_cats', JSON.stringify(cats)); localStorage.setItem('bd_rates', JSON.stringify(rates)); localStorage.setItem('bd_base', JSON.stringify(base)); localStorage.setItem('bd_cur', JSON.stringify(lastCur)); localStorage.setItem('bd_notes', JSON.stringify(notes)); }
  catch (e) { alert('Не удалось сохранить данные в браузере'); }
};
const call = async (path, method, body) => {
  try {
    const r = await fetch('/api/' + path, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!r.ok) throw new Error(r.status); return r;
  } catch (e) { alert('Не удалось сохранить на сервере. Обновите страницу и попробуйте снова.'); }
};
const settingsObj = () => ({ start, cats, rates, base, lastCur, notes });
const persistSettings = () => call('settings', 'PUT', settingsObj());
const persistTx = t => remote && call('tx', 'POST', t);
const persistDel = id => remote && call('tx?id=' + id, 'DELETE');
const persistAll = () => remote && call('import', 'POST', { tx, settings: settingsObj() });
const today = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = (v, s, c = base) => (v < 0 ? '−' : s && v > 0 ? '+' : '') + CUR[c] + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cls = v => v > 0 ? 'pos' : v < 0 ? 'neg' : '';
const conv = (a, c) => a / rates[c] * rates[base];
const val = t => conv(t.amount, t.cur || 'USD');
const sum = a => a.reduce((s, t) => s + val(t), 0);
const wal = c => start[c] + tx.filter(t => t.cur === c).reduce((a, t) => a + t.amount, 0);
const totalBal = () => Object.keys(CUR).reduce((s, c) => s + conv(wal(c), c), 0);
const inc = a => sum(a.filter(t => t.amount > 0)), exp = a => -sum(a.filter(t => t.amount < 0));
const col = i => `hsl(240 6% ${Math.max(28, 94 - i * 9)}%)`;
const key = (d, m) => m === 'm' ? d.slice(0, 7) : m === 'q' ? d.slice(0, 4) + ' Q' + Math.ceil(+d.slice(5, 7) / 3) : d.slice(0, 4);
const lbl = (k, m) => m === 'm' ? new Date(k + '-01').toLocaleString('ru', { month: 'long', year: 'numeric' }) : k;
const ymOf = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const byCat = a => { const g = {}; a.filter(t => t.amount < 0).forEach(t => g[t.cat] = (g[t.cat] || 0) - val(t)); return Object.entries(g).map(([name, v]) => ({ name, v })).sort((x, y) => y.v - x.v); };

/* ---------- форма ---------- */
function fillCat(v) {
  $('#cat').innerHTML = (kind === '-' ? cats.exp : cats.inc).map(c => `<option>${esc(c)}</option>`).join('') + '<option value="__new">+ Новая категория…</option>';
  if (v) $('#cat').value = v;
}
function setKind(k) { kind = k; document.querySelectorAll('#kind button').forEach(b => b.classList.toggle('on', b.dataset.k === k)); fillCat(); }
$('#kind').onclick = e => { if (e.target.dataset.k) { setKind(e.target.dataset.k); $('#amt').focus(); } };
$('#amt').oninput = e => { const c = e.target.value[0]; if ((c === '+' || c === '-') && c !== kind) setKind(c); };
$('#cat').onchange = e => {
  if (e.target.value !== '__new') return;
  const n = (prompt('Название категории:') || '').trim(), L = kind === '-' ? cats.exp : cats.inc;
  if (n && !L.includes(n)) { L.push(n); save(); }
  fillCat(n || L[0]);
};
$('#place').onchange = e => {
  if (editId) return;
  const p = e.target.value.trim().toLowerCase(), t = [...tx].reverse().find(x => (x.place || '').toLowerCase() === p);
  if (t) { setKind(t.amount < 0 ? '-' : '+'); fillCat(t.cat); $('#cur').value = t.cur || 'USD'; }
};
$('#qa').onsubmit = e => {
  e.preventDefault();
  const s = $('#amt').value.trim().replace(',', '.'), n = Math.abs(parseFloat(s.replace(/[^0-9.]/g, '')));
  if (!n || $('#cat').value === '__new') { $('#qa').classList.add('flash'); setTimeout(() => $('#qa').classList.remove('flash'), 500); return; }
  const sg = s[0] === '+' ? 1 : s[0] === '-' ? -1 : kind === '+' ? 1 : -1;
  const t = { id: editId || Date.now(), date: $('#dt').value, amount: +(sg * n).toFixed(2), place: $('#place').value.trim(), cat: $('#cat').value, cur: $('#cur').value };
  if (editId) tx = tx.map(x => x.id === editId ? t : x); else tx.push(t);
  persistTx(t);
  editId = null; $('#sub').textContent = 'Добавить';
  $('#amt').value = ''; $('#place').value = '';
  save(); render(); $('#amt').focus();
};
document.addEventListener('keydown', e => { if (e.key === 'Escape' && editId) { editId = null; $('#sub').textContent = 'Добавить'; $('#amt').value = ''; $('#place').value = ''; } });
function edit(id) {
  const t = tx.find(x => x.id === id); if (!t) return;
  editId = id; setKind(t.amount < 0 ? '-' : '+'); fillCat(t.cat);
  $('#amt').value = Math.abs(t.amount); $('#place').value = t.place || ''; $('#dt').value = t.date; $('#cur').value = t.cur || 'USD';
  $('#sub').textContent = 'Сохранить'; scrollTo({ top: 0, behavior: 'smooth' }); $('#amt').focus();
}
function del(id) { if (confirm('Удалить операцию?')) { tx = tx.filter(x => x.id !== id); persistDel(id); save(); render(); } }
function setStart() {
  const v = prompt('Стартовые суммы: USD EUR CHF (через пробел)', `${start.USD} ${start.EUR} ${start.CHF}`); if (v === null) return;
  const n = v.replace(/,/g, '.').trim().split(/\s+/).map(parseFloat);
  if (n.length === 3 && n.every(x => !isNaN(x))) { start = { USD: n[0], EUR: n[1], CHF: n[2] }; save(); render(); } else alert('Введите три числа: USD EUR CHF');
}
async function fetchRates(manual) {
  try {
    const d = await (await fetch('https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR,CHF')).json();
    if (!d.rates || !d.rates.EUR || !d.rates.CHF) throw 0;
    rates = { USD: 1, EUR: d.rates.EUR, CHF: d.rates.CHF, ts: Date.now() }; save(); render();
  } catch (e) { if (manual) alert('Не удалось загрузить курсы. Можно ввести вручную.'); }
}
function setRates() {
  const v = prompt('Сколько EUR и CHF за 1 USD? (например 0.92 0.80)', `${rates.EUR} ${rates.CHF}`); if (v === null) return;
  const n = v.replace(/,/g, '.').trim().split(/\s+/).map(parseFloat);
  if (n.length === 2 && n.every(x => x > 0)) { rates = { USD: 1, EUR: n[0], CHF: n[1], ts: Date.now(), man: true }; save(); render(); } else alert('Введите два числа');
}
const ratesLine = () => `<div class="mu rt">Курсы: 1 USD = ${rates.EUR.toFixed(4)} EUR · ${rates.CHF.toFixed(4)} CHF · ${rates.ts ? (rates.man ? 'введены вручную' : 'обновлено ' + new Date(rates.ts).toLocaleString('ru', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })) : 'примерные, нажмите «Обновить»'} · <button class="link" onclick="rates.man=false;fetchRates(true)">Обновить</button> · <button class="link" onclick="setRates()">Вручную</button><br>Итоги пересчитываются в выбранную валюту по текущему курсу.</div>`;

/* ---------- графики ---------- */
function donut(items) {
  const T = items.reduce((s, i) => s + i.v, 0);
  if (!T) return '<div class="mu empty">Нет расходов</div>';
  const C = 2 * Math.PI * 70; let o = 0;
  const arcs = items.map((it, i) => { const l = it.v / T * C, s = `<circle r="70" cx="100" cy="100" fill="none" stroke="${col(i)}" stroke-width="26" stroke-dasharray="${l} ${C - l}" stroke-dashoffset="${-o}" transform="rotate(-90 100 100)"/>`; o += l; return s; }).join('');
  return `<div class="dn"><svg viewBox="0 0 200 200" width="200" height="200">${arcs}<text x="100" y="96" text-anchor="middle" fill="#80808c" font-size="11">РАСХОДЫ</text><text x="100" y="118" text-anchor="middle" fill="#f4f4f7" font-size="16" font-family="JetBrains Mono" font-weight="600">${money(T)}</text></svg>
  <div class="lg">${items.map((it, i) => `<div><i style="background:${col(i)}"></i><span style="text-align:left;font-size:14px;color:var(--tx)">${esc(it.name)}</span><b>${money(it.v)}</b><span class="mu">${(it.v / T * 100).toFixed(0)}%</span></div>`).join('')}</div></div>`;
}
function bars(rows) {
  const W = 800, H = 200, mx = Math.max(1, ...rows.flatMap(r => [r.i, r.e])), bw = W / rows.length;
  return `<svg viewBox="0 0 ${W} ${H + 26}" width="100%">${rows.map((r, j) => { const h1 = r.i / mx * H, h2 = r.e / mx * H, w = Math.min(bw * .3, 36), x = j * bw + bw / 2 - w - 1; return `<rect x="${x}" y="${H - h1}" width="${w}" height="${h1}" rx="4" fill="#5fe0a8"/><rect x="${x + w + 2}" y="${H - h2}" width="${w}" height="${h2}" rx="4" fill="#ff6b6b"/><text x="${j * bw + bw / 2}" y="${H + 18}" text-anchor="middle" fill="#6e6e7a" font-size="11" font-family="JetBrains Mono">${r.lb}</text>`; }).join('')}</svg>
  <div class="mu" style="font-size:12px;margin-top:6px"><span class="pos">■</span> доходы &nbsp; <span class="neg">■</span> расходы</div>`;
}
function balPts() {
  if (!tx.length) return [];
  const by = {}; tx.forEach(t => by[t.date] = (by[t.date] || 0) + val(t));
  const ds = Object.keys(by).sort(), end = new Date(today()); let d = new Date(ds[0]), b = Object.keys(CUR).reduce((a, c) => a + conv(start[c], c), 0), p = [];
  for (; d <= end; d.setUTCDate(d.getUTCDate() + 1)) { const k = d.toISOString().slice(0, 10); b += by[k] || 0; p.push({ l: k, v: b }); }
  return p;
}
function lineHTML(p, W, anim) {
  if (!p.length) return '<div class="mu empty">Добавьте первую операцию</div>';
  const H = 300, L = 72, R = 16, Tm = 12, B = 30, ph = H - Tm - B, n = p.length;
  let mn = Math.min(...p.map(x => x.v)), mx = Math.max(...p.map(x => x.v)); if (mx === mn) { mx++; mn--; }
  const pad = (mx - mn) * .1, lo = mn - pad, hi = mx + pad;
  const X = i => L + (n > 1 ? i / (n - 1) : .5) * (W - L - R), Y = v => Tm + (hi - v) / (hi - lo) * ph;
  let g = '', xl = '';
  for (let k = 0; k < 4; k++) { const v = lo + (hi - lo) * k / 3; g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="#1c1c22" stroke-dasharray="2 5"/><text x="0" y="${Y(v) + 4}" fill="#6e6e7a" font-size="11" font-family="JetBrains Mono">$${Math.round(v).toLocaleString('en-US')}</text>`; }
  for (let k = 0; k < 6 && n > 1; k++) { const i = Math.round(k * (n - 1) / 5); xl += `<text x="${X(i)}" y="${H - 8}" fill="#6e6e7a" font-size="11" text-anchor="middle" font-family="JetBrains Mono">${p[i].l.slice(5)}</text>`; }
  const pts = p.map((x, i) => `${X(i)},${Y(x.v)}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>${g}${xl}
  <polygon class="${anim ? 'fade' : ''}" points="${X(0)},${Y(lo)} ${pts} ${X(n - 1)},${Y(lo)}" fill="url(#g)"/><polyline class="${anim ? 'draw' : ''}" pathLength="1" points="${pts}" fill="none" stroke="#e6e6ee" stroke-width="2" stroke-linejoin="round"/></svg>`;
}
function drawBal(anim) { const e = $('#bal'); if (e) e.innerHTML = lineHTML(balPts(), Math.floor(e.clientWidth) || 1000, anim); }
addEventListener('resize', () => { if (tab === 'overview') drawBal(false); });

/* ---------- экраны ---------- */
const row = (t, showDate) => `<tr>${showDate ? `<td class="mu mono">${t.date.slice(5).replace('-', '.')}</td>` : ''}<td>${esc(t.place) || '<span class="mu">—</span>'}</td><td><span class="mp">${esc(t.cat)}</span></td><td class="r mono ${cls(t.amount)}">${money(t.amount, 1, t.cur)}</td><td class="r"><button class="act" onclick="edit(${t.id})">✎</button><button class="act" onclick="del(${t.id})">🗑</button></td></tr>`;
const recent = n => [...tx].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id).slice(0, n);

function overview() {
  const b = totalBal(), cm = tx.filter(t => t.date.startsWith(ymOf(new Date()))), mname = new Date().toLocaleString('ru', { month: 'long' });
  const k = (l, v, s, c = '') => `<div class="kpi"><small>${l}</small><b class="${c}">${v}</b><div class="sub">${s}</div></div>`;
  return `<div class="kpis">${k('Баланс', money(b), Object.keys(CUR).map(c => money(wal(c), 0, c)).join(' · ') + ' · <button class="link" onclick="setStart()">стартовые</button>')}${k('Доходы · ' + mname, money(inc(cm), 1), cm.filter(t => t.amount > 0).length + ' операций', 'pos')}${k('Расходы · ' + mname, money(-exp(cm), 1), cm.filter(t => t.amount < 0).length + ' операций', 'neg')}</div>
  ${notesHTML()}<div class="card"><div class="top"><h3>Динамика баланса</h3><span>${tx.length} операций</span></div><div id="bal"></div></div>
  <div class="two"><div class="card"><h3>Расходы · ${mname}</h3>${donut(byCat(cm))}</div>
  <div class="card"><h3>Последние операции</h3>${tx.length ? `<div class="tw" style="border:0;margin:0"><table>${recent(8).map(t => row(t, 1)).join('')}</table></div>` : '<div class="mu empty">Пока пусто</div>'}</div></div>`;
}

function history() {
  const y = hm.getFullYear(), m = hm.getMonth(), L = tx.filter(t => t.date.startsWith(ymOf(hm))), days = [...new Set(L.map(t => t.date))].sort().reverse();
  return `<div class="cm"><button class="chip" onclick="hm=new Date(${y},${m - 1},1);render()">←</button><h3>${hm.toLocaleString('ru', { month: 'long', year: 'numeric' })}</h3><button class="chip" onclick="hm=new Date(${y},${m + 1},1);render()">→</button>
  <span class="mono pos">${money(inc(L), 1)}</span><span class="mono neg">${money(-exp(L), 1)}</span></div>
  ${days.map(d => { const a = L.filter(t => t.date === d).sort((x, z) => z.id - x.id); return `<div class="dh">${new Date(d).toLocaleDateString('ru', { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'UTC' })}<span class="${cls(sum(a))}">${money(sum(a), 1)}</span></div><div class="tw"><table>${a.map(t => row(t)).join('')}</table></div>`; }).join('') || '<div class="mu empty">В этом месяце операций нет</div>'}`;
}

function review(m) {
  const g = {}; tx.forEach(t => (g[key(t.date, m)] ||= []).push(t));
  const ks = Object.keys(g).sort();
  if (!ks.length) return '<div class="mu empty">Нет данных</div>';
  const cur = g[sel[m]] ? sel[m] : ks[ks.length - 1], a = g[cur], sl = k => m === 'm' ? k.slice(5) + '.' + k.slice(2, 4) : k;
  const kp = (l, v, c) => `<div class="kpi sm"><small>${l}</small><b class="${c}">${v}</b></div>`;
  return `<div class="card"><div class="top"><h3>Доходы и расходы</h3></div>${bars(ks.slice(-12).map(k => ({ lb: sl(k), i: inc(g[k]), e: exp(g[k]) })))}</div>
  <div class="two"><div class="card"><h3 style="text-transform:capitalize">Расходы · ${lbl(cur, m)}</h3>${donut(byCat(a))}</div>
  <div class="card"><h3 style="text-transform:capitalize">Итоги · ${lbl(cur, m)}</h3><div class="pair">${kp('Доходы', money(inc(a), 1), 'pos')}${kp('Расходы', money(-exp(a), 1), 'neg')}${kp('Итого', money(sum(a), 1), cls(sum(a)))}${kp('Операций', a.length, '')}</div></div></div>
  <h4>Все периоды</h4><div class="tw"><table><thead><tr><th>Период<th class="r">Доходы<th class="r">Расходы<th class="r">Итого</tr></thead><tbody>
  ${[...ks].reverse().map(k => `<tr class="clk ${k === cur ? 'cur' : ''}" onclick="sel['${m}']='${k}';render()"><td style="text-transform:capitalize">${lbl(k, m)}<td class="r mono pos">${money(inc(g[k]))}<td class="r mono neg">${money(exp(g[k]))}<td class="r mono ${cls(sum(g[k]))}">${money(sum(g[k]), 1)}`).join('')}</tbody></table></div>`;
}

function render() {
  $('#place').nextElementSibling;
  $('#places').innerHTML = [...new Set(tx.map(t => t.place).filter(Boolean))].map(p => `<option value="${esc(p)}">`).join('');
  $('#view').innerHTML = tab === 'overview' ? overview() : tab === 'history' ? history() : review(tab);
  if (tab === 'overview') { $('#view').insertAdjacentHTML('beforeend', ratesLine()); drawBal(true); }
}
$('#tabs').onclick = e => {
  if (!e.target.dataset.t) return;
  tab = e.target.dataset.t;
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b === e.target));
  render();
};

/* ---------- экспорт / импорт / демо ---------- */
function exp_() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify({ tx, start, cats, rates, base, notes }, null, 1)], { type: 'application/json' }));
  a.download = 'budget-' + today() + '.json'; a.click();
}
$('#imp').onchange = async e => {
  try {
    const d = JSON.parse(await e.target.files[0].text());
    if (!Array.isArray(d.tx)) throw 0;
    if (!confirm('Заменить текущие данные импортированными?')) return;
    tx = d.tx.map(t => ({ cur: 'USD', ...t })); start = typeof d.start === 'number' ? { USD: d.start, EUR: 0, CHF: 0 } : (d.start || { USD: 0, EUR: 0, CHF: 0 }); cats = d.cats || cats; rates = d.rates || rates; base = d.base || base; notes = d.notes || notes; $('#base').value = base; persistAll(); save(); fillCat(); render();
  } catch { alert('Не удалось прочитать файл'); }
  e.target.value = '';
};
function demo() {
  if (tx.length && !confirm('Заменить текущие данные демо-данными?')) return;
  const P = [['Магазин', 'Еда', 5, 45], ['Кафе', 'Еда', 4, 22], ['Такси', 'Транспорт', 6, 18], ['Одежда', 'Покупки', 30, 120], ['Кино', 'Развлечения', 10, 25], ['Аптека', 'Здоровье', 8, 30]];
  tx = []; start = { USD: 1500, EUR: 500, CHF: 300 }; let id = 1;
  for (let i = 100; i >= 0; i--) {
    const d = new Date(Date.now() - i * 864e5), ds = new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
    if (d.getDate() === 1) tx.push({ id: id++, date: ds, amount: 2400, place: 'Зарплата', cat: 'Зарплата', cur: 'USD' });
    if (d.getDate() === 5) tx.push({ id: id++, date: ds, amount: -650, place: 'Аренда', cat: 'Жильё', cur: 'USD' });
    for (let j = 0; j < 1 + Math.floor(Math.random() * 3); j++) { const p = P[Math.floor(Math.random() * P.length)]; tx.push({ id: id++, date: ds, amount: -+(p[2] + Math.random() * p[3]).toFixed(2), place: p[0], cat: p[1], cur: ['USD', 'USD', 'EUR', 'CHF'][Math.floor(Math.random() * 4)] }); }
  }
  persistAll(); save(); render();
}

const co = Object.keys(CUR).map(c => `<option>${c}</option>`).join('');
$('#cur').innerHTML = co; $('#cur').value = lastCur; $('#base').innerHTML = co; $('#base').value = base;
$('#cur').onchange = e => { lastCur = e.target.value; save(); };
$('#base').onchange = e => { base = e.target.value; save(); render(); };
const notesHTML = () => `<div class="notes"><div class="nh"><h4>Стикеры</h4><span class="mu">напоминания, на баланс не влияют</span></div>
  <form class="nf" onsubmit="addNote(event)"><input id="nt" placeholder="Например: Саша должен вернуть" maxlength="120" required autocomplete="off"><input id="na" placeholder="Сумма (необязательно)" inputmode="decimal" autocomplete="off"><select id="nc">${Object.keys(CUR).map(c => `<option ${c === lastCur ? 'selected' : ''}>${c}</option>`).join('')}</select><button class="chip">Добавить</button></form>
  <div class="sg">${notes.map(n => `<div class="st" style="--r:${(n.id % 5) - 2}deg"><button class="x" onclick="delNote(${n.id})" title="Выбросить">×</button><div class="stt">${esc(n.text)}</div>${n.amount ? `<div class="sta">${money(n.amount, 1, n.cur)}</div>` : ''}<div class="std">${new Date(n.id).toLocaleDateString('ru', { day: 'numeric', month: 'short' })}</div></div>`).join('') || '<div class="mu">Пока нет стикеров</div>'}</div></div>`;
function addNote(e) {
  e.preventDefault();
  const a = parseFloat($('#na').value.replace(',', '.').replace(/[^0-9.\-+]/g, ''));
  notes.unshift({ id: Date.now(), text: $('#nt').value.trim(), amount: isNaN(a) ? 0 : a, cur: $('#nc').value });
  save(); render(); $('#nt').focus();
}
function delNote(id) { notes = notes.filter(n => n.id !== id); save(); render(); }

async function init() {
  try {
    const r = await fetch('/api/state');
    if (r.ok && (r.headers.get('content-type') || '').includes('json')) {
      const d = await r.json(); remote = true;
      tx = d.tx.map(t => ({ ...t, cur: t.cur || 'USD' }));
      if (d.settings) { start = d.settings.start || start; cats = d.settings.cats || cats; rates = d.settings.rates || rates; base = d.settings.base || base; lastCur = d.settings.lastCur || lastCur; notes = d.settings.notes || []; }
      else persistSettings();
      $('#cur').value = lastCur; $('#base').value = base;
    }
  } catch (e) {}
  $('#bn').hidden = remote;
  fillCat(); render();
  if (!rates.man && (!rates.ts || Date.now() - rates.ts > 432e5)) fetchRates(false);
}
$('#dt').value = today(); init();
