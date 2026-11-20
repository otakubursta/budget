const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const ld = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const CUR = { USD: '$', EUR: '€', CHF: 'CHF ' };
const CURS = Object.keys(CUR);
const TR_CAT = 'Перевод';
let remote = false, demoMode = false, notes = ld('bd_notes', []);
const _s = ld('bd_start', 0);
let tx = [], start = normStart(_s),
  rates = ld('bd_rates', { USD: 1, EUR: 0.92, CHF: 0.8, ts: null }), base = ld('bd_base', 'USD'), lastCur = ld('bd_cur', ld('bd_base', 'USD')),
  cats = ld('bd_cats', { exp: ['Еда', 'Транспорт', 'Жильё', 'Покупки', 'Развлечения', 'Здоровье', 'Подписки', 'Другое'], inc: ['Зарплата', 'Подработка', 'Подарок', 'Другое'] }),
  limits = ld('bd_limits', {}), rec = ld('bd_rec', []), tpl = ld('bd_tpl', []),
  kind = '-', tab = 'overview', editIds = null, hm = new Date(), sel = {}, selCat = null, catTouched = false, amt2Touched = false,
  hf = { q: '', type: '', cat: '', cur: '', all: false };

/* ---------- утилиты ---------- */
function normStart(v) { const o = { USD: 0, EUR: 0, CHF: 0 }; if (typeof v === 'number') o.USD = v; else if (v && typeof v === 'object') CURS.forEach(c => { if (Number.isFinite(+v[c])) o[c] = +v[c]; }); return o; }
const pad2 = n => String(n).padStart(2, '0');
const isoOf = d => new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const today = () => isoOf(new Date());
const yesterday = () => isoOf(new Date(Date.now() - 864e5));
const okDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (v, s, c = base) => (v < 0 ? '−' : s && v > 0 ? '+' : '') + CUR[c] + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const short = (v, c = base) => CUR[c] + Math.round(v).toLocaleString('en-US');
const cls = v => v > 0 ? 'pos' : v < 0 ? 'neg' : '';
const rate = c => rates[c] || 1;
const conv = (a, c, to = base) => a / rate(c) * rate(to);
const val = t => conv(t.amount, t.cur || 'USD');
const isTr = t => t.type === 'tr';
const isRec = t => t.id >= 1e15;
const ops = (a = tx) => a.filter(t => !isTr(t));
const sum = a => ops(a).reduce((s, t) => s + val(t), 0);
const wal = c => start[c] + tx.filter(t => t.cur === c).reduce((a, t) => a + t.amount, 0);
const totalBal = () => CURS.reduce((s, c) => s + conv(wal(c), c), 0);
const inc = a => sum(ops(a).filter(t => t.amount > 0)), exp = a => -sum(ops(a).filter(t => t.amount < 0));
const col = i => `hsl(240 6% ${Math.max(28, 94 - i * 9)}%)`;
const key = (d, m) => m === 'm' ? d.slice(0, 7) : m === 'q' ? d.slice(0, 4) + ' Q' + Math.ceil(+d.slice(5, 7) / 3) : d.slice(0, 4);
const lbl = (k, m) => m === 'm' ? new Date(k + '-01').toLocaleString('ru', { month: 'long', year: 'numeric' }) : k;
const ymOf = d => d.getFullYear() + '-' + pad2(d.getMonth() + 1);
const daysIn = ym => new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate();
const nextYm = ym => { const y = +ym.slice(0, 4), m = +ym.slice(5, 7); return m === 12 ? (y + 1) + '-01' : y + '-' + pad2(m + 1); };
const prevYm = ym => { const y = +ym.slice(0, 4), m = +ym.slice(5, 7); return m === 1 ? (y - 1) + '-12' : y + '-' + pad2(m - 1); };
const byCat = a => { const g = {}; ops(a).filter(t => t.amount < 0).forEach(t => g[t.cat] = (g[t.cat] || 0) - val(t)); return Object.entries(g).map(([name, v]) => ({ name, v })).sort((x, y) => y.v - x.v); };
const byId = id => tx.find(t => t.id === id);
let _lid = 0; const uid = () => (_lid = Math.max(Date.now(), _lid + 1));
const ci = s => String(s || '').trim().toLowerCase();

/* Разбор суммы: 1'000.50 · 1 000,50 · 1.000,50 · 12,5 · 1,000.50 */
function parseAmt(s) {
  s = String(s ?? '').trim().replace(/[\s'’\u00a0\u202f]/g, '').replace(/^[+\-−–]/, '').replace(/[$€₣]|chf|usd|eur/gi, '');
  if (!s) return NaN;
  const lc = s.lastIndexOf(','), lp = s.lastIndexOf('.');
  if (lc >= 0 && lp >= 0) { const dec = lc > lp ? ',' : '.'; s = s.split(dec === ',' ? '.' : ',').join('').replace(dec, '.'); }
  else if (lc >= 0) s = s.split(',').length > 2 ? s.split(',').join('') : s.replace(',', '.');
  else if (lp >= 0 && s.split('.').length > 2) s = s.split('.').join('');
  return /^(\d+(\.\d*)?|\.\d+)$/.test(s) ? parseFloat(s) : NaN;
}
const CUR_W = [[/^(usd|\$|дол+\.?|доллар\S*|бакс\S*)$/i, 'USD'], [/^(eur|€|евро)$/i, 'EUR'], [/^(chf|₣|фр\.?|франк\S*)$/i, 'CHF']];
const curWord = w => (CUR_W.find(([r]) => r.test(w)) || [])[1];
/* Строка вида «-12.5 кофе chf», «+2000 зарплата», «€15 обед» */
function smartParse(s) {
  s = String(s || '').trim(); if (!s) return null;
  let cur = null;
  const pre = s.match(/^([+\-−–]?)\s*([$€₣])\s*/); if (pre) { cur = curWord(pre[2]); s = pre[1] + s.slice(pre[0].length); }
  const m = s.match(/^([+\-−–]?)\s*(\d{1,3}(?:[ '’\u00a0]\d{3})+(?:[.,]\d+)?|\d+(?:[.,'’]\d+)*)/);
  if (!m) return null;
  const n = parseAmt(m[2]); if (!(n > 0)) return null;
  const words = s.slice(m[0].length).trim().split(/\s+/).filter(Boolean).filter(w => { const c = curWord(w); if (c && !cur) { cur = c; return false; } return !c; });
  return { sign: m[1] === '+' ? 1 : m[1] ? -1 : 0, n, cur, rest: words.join(' ') };
}

/* ---------- toasts ---------- */
function toast(msg, o = {}) {
  const el = document.createElement('div'); el.className = 'toast' + (o.err ? ' err' : '');
  el.innerHTML = `<span>${esc(msg)}</span>`;
  if (o.act) { const b = document.createElement('button'); b.className = 'link'; b.textContent = o.act[0]; b.onclick = () => { el.remove(); o.act[1](); }; el.append(b); }
  const x = document.createElement('button'); x.className = 'tx'; x.textContent = '×'; x.title = 'Закрыть'; x.onclick = () => el.remove(); el.append(x);
  $('#toasts').append(el); while ($('#toasts').children.length > 3) $('#toasts').firstChild.remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, o.ms || (o.err ? 8000 : o.act ? 6000 : 3000));
}
const errMsg = e => e && e.message === 'auth' ? 'Сессия истекла — обновите страницу и войдите заново.' : 'Нет связи с сервером.';

/* ---------- сохранение ---------- */
const settingsObj = () => ({ start, cats, rates, base, lastCur, notes, limits, rec, tpl });
function saveLocal() {
  if (remote || demoMode) return;
  try { Object.entries({ bd_tx: tx, bd_start: start, bd_cats: cats, bd_rates: rates, bd_base: base, bd_cur: lastCur, bd_notes: notes, bd_limits: limits, bd_rec: rec, bd_tpl: tpl }).forEach(([k, v]) => localStorage.setItem(k, JSON.stringify(v))); }
  catch (e) { toast('Не удалось сохранить данные в браузере (переполнено хранилище?)', { err: 1 }); }
}
async function api(path, method, body) {
  const r = await fetch('/api/' + path, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (r.status === 401) throw new Error('auth');
  if (!r.ok) throw new Error(String(r.status));
  return r;
}
async function saveSettings() {
  if (demoMode) return true;
  if (!remote) { saveLocal(); return true; }
  try { await api('settings', 'PUT', settingsObj()); return true; }
  catch (e) { toast(errMsg(e) + ' Настройки не сохранены.', { err: 1, act: ['Повторить', saveSettings] }); return false; }
}
const save = saveSettings;
/* Применить изменения операций: сначала на экране, затем на сервере; при ошибке — откат. */
async function commit(put = [], del = [], o = {}) {
  const ids = new Set([...put.map(t => t.id), ...del]), before = tx.filter(t => ids.has(t.id));
  tx = tx.filter(t => !ids.has(t.id)).concat(put);
  if (!o.quiet) render();
  if (demoMode) return true;
  if (!remote) { saveLocal(); return true; }
  try {
    if (put.length) await api('tx', 'POST', put);
    if (del.length) await api('tx?ids=' + del.join(','), 'DELETE');
    return true;
  } catch (e) {
    tx = tx.filter(t => !ids.has(t.id)).concat(before); render();
    toast(errMsg(e) + ' Изменение отменено.', { err: 1, act: ['Повторить', () => commit(put, del, o)] });
    return false;
  }
}
const normTx = t => { const o = { ...t, cur: CURS.includes(t.cur) ? t.cur : 'USD' }; ['note', 'type', 'link'].forEach(k => { if (o[k] == null || o[k] === '') delete o[k]; }); return o; };

/* ---------- форма ---------- */
const catList = k => k === '+' ? cats.inc : cats.exp;
function sortedCats(k) {
  const L = catList(k), cnt = {}, last = {}, from = isoOf(new Date(Date.now() - 120 * 864e5));
  ops().forEach(t => { if ((t.amount < 0) === (k === '-') && t.date >= from) { cnt[t.cat] = (cnt[t.cat] || 0) + 1; if (!last[t.cat] || t.date > last[t.cat]) last[t.cat] = t.date; } });
  return [...L].sort((a, b) => (cnt[b] || 0) - (cnt[a] || 0) || (last[b] || '').localeCompare(last[a] || '') || L.indexOf(a) - L.indexOf(b));
}
function fillCat(v) {
  if (kind === 't') { $('#cats').innerHTML = ''; return; }
  const L = sortedCats(kind);
  if (v !== undefined) selCat = v;
  if (!L.includes(selCat)) selCat = L[0];
  $('#cats').innerHTML = L.map(c => `<button type="button" class="cg${c === selCat ? ' on' : ''}" data-c="${esc(c)}">${esc(c)}</button>`).join('') + '<button type="button" class="cg add" data-new="1">+ новая категория</button>';
}
$('#cats').onclick = e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.new) {
    const i = document.createElement('input'); i.className = 'cgi'; i.placeholder = 'Название…'; i.maxLength = 40; b.replaceWith(i); i.focus();
    let done = false;
    const fin = ok => {
      if (done) return; done = true; const n = i.value.trim(), L = catList(kind);
      if (ok && n) { if (!L.includes(n)) { L.push(n); save(); } selCat = n; catTouched = true; }
      fillCat(); if (ok) $('#amt').focus();
    };
    i.onkeydown = ev => { if (ev.key === 'Enter') { ev.preventDefault(); fin(true); } if (ev.key === 'Escape') { ev.stopPropagation(); fin(false); } };
    i.onblur = () => fin(true);
    return;
  }
  selCat = b.dataset.c; catTouched = true;
  $$('#cats .cg').forEach(x => x.classList.toggle('on', x === b));
  updHint();
};
function setKind(k, keepCat) {
  kind = k; $$('#kind button').forEach(b => b.classList.toggle('on', b.dataset.k === k));
  const t = k === 't'; $('#place').hidden = t; $('#trg').hidden = !t; $('#qa').classList.toggle('tr', t);
  $('#amt').placeholder = t ? 'Отдаю' : '-12.5 кофе chf';
  if (t && $('#cur2').value === $('#cur').value) $('#cur2').value = CURS.find(c => c !== $('#cur').value);
  if (!keepCat) catTouched = false;
  fillCat(); autoAmt2(); updHint();
}
$('#kind').onclick = e => { const k = e.target.closest('button')?.dataset.k; if (k) { setKind(k); $('#amt').focus(); } };

function suggest(text) {
  const p = ci(text); if (!p) return null;
  const L = [...ops()].reverse();
  let t = L.find(x => ci(x.place) === p);
  if (t) return { cat: t.cat, kind: t.amount < 0 ? '-' : '+', cur: t.cur };
  const c = cats.exp.find(x => ci(x) === p) ? ['-', cats.exp.find(x => ci(x) === p)] : cats.inc.find(x => ci(x) === p) ? ['+', cats.inc.find(x => ci(x) === p)] : null;
  if (c) return { cat: c[1], kind: c[0] };
  const w = p.split(/\s+/).filter(x => x.length >= 3);
  t = L.find(x => { const q = ci(x.place); return q && w.some(y => q.includes(y) || (q.length >= 3 && y.includes(q))); });
  if (t) return { cat: t.cat, kind: t.amount < 0 ? '-' : '+', cur: t.cur };
  return null;
}
function applySuggest(text, signGiven, curGiven) {
  if (editIds || kind === 't') return;
  const s = suggest(text); if (!s) return;
  if (!signGiven && s.kind !== kind) setKind(s.kind);
  if (!catTouched && catList(kind).includes(s.cat)) { selCat = s.cat; fillCat(); }
  if (!curGiven && s.cur) $('#cur').value = s.cur;
}
function liveParse(field) {
  const v = field.value, p = smartParse(v);
  if (field.id === 'amt') { const c = v.trim()[0]; if ((c === '+' || c === '-') && kind !== 't' && c !== kind) setKind(c, true); }
  if (!p || (field.id === 'place' && !p.rest && !p.cur)) return;
  if (p.cur) $('#cur').value = p.cur;
  if (p.sign && kind !== 't') { const k = p.sign > 0 ? '+' : '-'; if (k !== kind) setKind(k, true); }
  if (p.rest) applySuggest(p.rest, !!p.sign, !!p.cur);
}
let _sg; $('#amt').oninput = e => { liveParse(e.target); autoAmt2(); updHint(); };
$('#place').oninput = e => { liveParse(e.target); clearTimeout(_sg); _sg = setTimeout(() => { if (!smartParse(e.target.value)) applySuggest(e.target.value); updHint(); }, 250); updHint(); };
$('#place').onchange = e => { if (!smartParse(e.target.value)) applySuggest(e.target.value); updHint(); };
$('#cur').onchange = e => { lastCur = e.target.value; if (kind === 't' && $('#cur2').value === lastCur) $('#cur2').value = CURS.find(c => c !== lastCur); autoAmt2(); save(); updHint(); };
$('#cur2').onchange = () => { amt2Touched = false; autoAmt2(); };
$('#amt2').oninput = e => { amt2Touched = !!e.target.value.trim(); updHint(); };
function autoAmt2() {
  if (kind !== 't' || amt2Touched) return;
  const n = parseAmt($('#amt').value), c1 = $('#cur').value, c2 = $('#cur2').value;
  $('#amt2').value = n > 0 && c1 !== c2 ? +conv(n, c1, c2).toFixed(2) : '';
}
/* Что будет записано — разобранная форма */
function formData() {
  const a = $('#amt').value, pl = $('#place').value.trim();
  let p = smartParse(a), place = pl;
  if (p && p.rest) place = place || p.rest;
  if (!p && !a.trim() && smartParse(pl)) { p = smartParse(pl); place = p.rest; }
  if (!p) { const n = parseAmt(a); p = n > 0 ? { n, sign: 0, cur: null, rest: '' } : null; }
  return p && { n: p.n, sign: p.sign, cur: p.cur || $('#cur').value, place };
}
function updHint() {
  const h = $('#hint'); if (!h) return;
  if (kind === 't') {
    const n1 = parseAmt($('#amt').value), n2 = parseAmt($('#amt2').value), c1 = $('#cur').value, c2 = $('#cur2').value;
    h.textContent = n1 > 0 && n2 > 0 ? `${money(n1, 0, c1)} → ${money(n2, 0, c2)} · курс 1 ${c1} = ${(n2 / n1).toFixed(4)} ${c2} · в статистику не попадает` : 'Перевод между валютными кошельками: меняет балансы, но не доходы/расходы';
    return;
  }
  const f = formData();
  if (!f) { h.textContent = ''; return; }
  const sg = f.sign || (kind === '+' ? 1 : -1);
  h.innerHTML = `→ <span class="${sg > 0 ? 'pos' : 'neg'}">${money(sg * f.n, 1, f.cur)}</span> · ${esc(f.place || 'без описания')} · ${esc(selCat || '')}`;
}
function setDate(v) { $('#dt').value = v; markDate(); }
function markDate() { const v = $('#dt').value; $$('.dqb').forEach(b => b.classList.toggle('on', v === (b.dataset.d === '0' ? today() : yesterday()))); }
$$('.dqb').forEach(b => b.onclick = () => { setDate(b.dataset.d === '0' ? today() : yesterday()); $('#amt').focus(); });
$('#dt').onchange = markDate;
function flash(el) { $('#qa').classList.add('flash'); el?.classList.add('bad'); setTimeout(() => { $('#qa').classList.remove('flash'); el?.classList.remove('bad'); }, 700); el?.focus(); }
function resetForm() {
  editIds = null; catTouched = false; amt2Touched = false;
  ['#amt', '#place', '#note', '#amt2'].forEach(s => $(s).value = '');
  $('#sub').textContent = 'Добавить'; $('#eb').hidden = true; $('#qa').classList.remove('editing');
  updHint();
}
$('#qa').onsubmit = async e => {
  e.preventDefault();
  const date = okDate($('#dt').value) ? $('#dt').value : null; if (!date) return flash($('#dt'));
  const note = $('#note').value.trim(), old = editIds || [];
  let put;
  if (kind === 't') {
    const n1 = parseAmt($('#amt').value), n2 = parseAmt($('#amt2').value), c1 = $('#cur').value, c2 = $('#cur2').value;
    if (!(n1 > 0)) return flash($('#amt')); if (!(n2 > 0)) return flash($('#amt2')); if (c1 === c2) return flash($('#cur2'));
    const id1 = old[0] || uid(), id2 = old[1] || uid(), pl = `${c1} → ${c2}`;
    put = [{ id: id1, date, amount: -+n1.toFixed(2), place: pl, cat: TR_CAT, cur: c1, type: 'tr', link: id2 }, { id: id2, date, amount: +n2.toFixed(2), place: pl, cat: TR_CAT, cur: c2, type: 'tr', link: id1 }];
    if (note) put.forEach(t => t.note = note);
  } else {
    const f = formData(); if (!f) return flash($('#amt'));
    const sg = f.sign || (kind === '+' ? 1 : -1), k = sg > 0 ? '+' : '-';
    if (!catList(k).includes(selCat)) { if (k !== kind) setKind(k, true); if (!catList(k).includes(selCat)) return flash($('#cats')); }
    put = [{ id: old[0] || uid(), date, amount: +(sg * f.n).toFixed(2), place: f.place, cat: selCat, cur: f.cur }];
    if (note) put[0].note = note;
    if (f.cur !== lastCur) { lastCur = f.cur; }
  }
  const del = old.filter(id => !put.some(t => t.id === id)), wasEdit = !!editIds;
  resetForm(); $('#amt').focus();
  const ok = await commit(put, del);
  if (ok) toast(wasEdit ? 'Сохранено' : kind === 't' ? 'Перевод добавлен' : 'Добавлено: ' + money(put[0].amount, 1, put[0].cur), wasEdit ? {} : { act: ['Отменить', () => commit([], put.map(t => t.id))] });
};
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && editIds) { resetForm(); setKind(kind); toast('Редактирование отменено'); }
  if (e.key === '/' && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)) { e.preventDefault(); $('#amt').focus(); }
});
$('#ecancel').onclick = () => { resetForm(); setKind(kind); };
const pairOf = t => isTr(t) ? byId(t.link) : null;
const legs = t => { if (!isTr(t)) return [t]; const p = pairOf(t); if (!p) return [t]; return t.amount < 0 ? [t, p] : [p, t]; };
function edit(id) {
  const t = byId(id); if (!t) return;
  const L = legs(t); editIds = L.map(x => x.id);
  if (isTr(t)) {
    setKind('t'); $('#amt').value = Math.abs(L[0].amount); $('#cur').value = L[0].cur;
    if (L[1]) { $('#cur2').value = L[1].cur; $('#amt2').value = L[1].amount; amt2Touched = true; }
  } else {
    const k = t.amount < 0 ? '-' : '+'; if (t.cat && !catList(k).includes(t.cat)) catList(k).push(t.cat);
    setKind(k); fillCat(t.cat); catTouched = true;
    $('#amt').value = Math.abs(t.amount); $('#place').value = t.place || ''; $('#cur').value = t.cur || 'USD';
  }
  $('#note').value = t.note || ''; setDate(t.date);
  $('#sub').textContent = 'Сохранить'; $('#eb').hidden = false; $('#qa').classList.add('editing');
  updHint(); scrollTo({ top: 0, behavior: 'smooth' }); $('#amt').focus();
}
async function del(id) {
  const t = byId(id); if (!t) return;
  const L = legs(t);
  if (editIds && L.some(x => editIds.includes(x.id))) resetForm();
  if (await commit([], L.map(x => x.id))) toast('Операция удалена', { act: ['Вернуть', () => commit(L, [])] });
}
async function dup(id) {
  const t = byId(id); if (!t) return;
  const L = legs(t).map(x => ({ ...x, id: uid(), date: today() }));
  if (L.length === 2) { L[0].link = L[1].id; L[1].link = L[0].id; }
  if (await commit(L)) toast('Повторено сегодня: ' + (L[0].place || L[0].cat), { act: ['Отменить', () => commit([], L.map(x => x.id))] });
}

/* ---------- шаблоны ---------- */
const tplKey = t => [t.amount, t.cur, ci(t.place), t.cat].join('|');
function addTpl(t) {
  const o = { id: uid(), amount: t.amount, cur: t.cur, place: t.place || '', cat: t.cat };
  if (t.note) o.note = t.note;
  if (tpl.some(x => tplKey(x) === tplKey(o))) return toast('Такой шаблон уже есть');
  tpl.push(o); save(); renderTpl(); if (tab === 'plan') render(); toast('Шаблон сохранён: ' + (o.place || o.cat));
}
function tplFromRow(id) { const t = byId(id); if (t && !isTr(t)) addTpl(t); }
$('#mkTpl').onclick = () => {
  if (kind === 't') return toast('Переводы нельзя сохранить как шаблон');
  const f = formData(); if (!f) return flash($('#amt'));
  const sg = f.sign || (kind === '+' ? 1 : -1);
  addTpl({ amount: +(sg * f.n).toFixed(2), cur: f.cur, place: f.place, cat: selCat, note: $('#note').value.trim() });
};
async function useTpl(id) {
  const t = tpl.find(x => x.id === id); if (!t) return;
  const date = okDate($('#dt').value) ? $('#dt').value : today();
  const o = { id: uid(), date, amount: t.amount, place: t.place, cat: t.cat, cur: t.cur }; if (t.note) o.note = t.note;
  if (await commit([o])) toast(`Добавлено: ${t.place || t.cat} ${money(t.amount, 1, t.cur)}${date !== today() ? ' · ' + date.slice(5).split('-').reverse().join('.') : ''}`, { act: ['Отменить', () => commit([], [o.id])] });
}
function delTpl(id) { tpl = tpl.filter(x => x.id !== id); save(); renderTpl(); render(); }
function renderTpl() {
  $('#tpls').innerHTML = tpl.length ? `<span class="mu tl">Шаблоны</span>${tpl.map(t => `<button type="button" class="tp" onclick="useTpl(${t.id})" title="Добавить одним нажатием"><span>${esc(t.place || t.cat)}</span><b class="${cls(t.amount)}">${money(t.amount, 1, t.cur)}</b></button>`).join('')}` : '';
}

/* ---------- старт / курсы ---------- */
function setStart() {
  const sym = { USD: '$', EUR: '€', CHF: 'CHF' };
  const f = c => `<label style="display:flex;align-items:center;gap:10px"><span class="mu" style="width:42px">${sym[c] || c}</span><input id="sb_${c}" inputmode="decimal" autocomplete="off" value="${(Math.round(wal(c) * 100) / 100).toString()}" style="flex:1;padding:12px;border-radius:12px;color:var(--tx);font:inherit"></label>`;
  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;z-index:50;background:rgba(0,0,0,.6);display:grid;place-items:center;padding:16px';
  ov.innerHTML = `<form class="card" style="width:min(380px,100%);margin:0;display:flex;flex-direction:column;gap:12px"><h3 style="margin:0">Сколько у вас сейчас</h3><div class="mu" style="font-size:13px">Впишите реальный остаток по каждой валюте. Операции не изменятся, пересчитается только стартовая сумма.</div>${CURS.map(f).join('')}<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:4px"><button type="button" class="chip" data-x>Отмена</button><button class="btn">Сохранить</button></div></form>`;
  const close = () => ov.remove();
  ov.onclick = e => { if (e.target === ov || e.target.hasAttribute('data-x')) close(); };
  ov.querySelector('form').onsubmit = e => {
    e.preventDefault();
    const ns = { ...start };
    for (const c of CURS) {
      const raw = ov.querySelector('#sb_' + c).value.trim();
      const v = raw === '' ? 0 : (raw[0] === '-' ? -1 : 1) * parseAmt(raw);
      if (!Number.isFinite(v)) return toast('Не удалось прочитать сумму ' + c, { err: 1 });
      ns[c] = +(start[c] + (v - wal(c))).toFixed(2);
    }
    start = ns; save(); render(); close(); toast('Баланс обновлён');
  };
  document.body.appendChild(ov);
  ov.querySelector('input').focus();
}
async function fetchRates(manual) {
  try {
    const d = await (await fetch('https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR,CHF')).json();
    if (!d.rates || !d.rates.EUR || !d.rates.CHF) throw 0;
    rates = { USD: 1, EUR: d.rates.EUR, CHF: d.rates.CHF, ts: Date.now() }; save(); render();
    if (manual) toast('Курсы обновлены');
  } catch (e) { if (manual) toast('Не удалось загрузить курсы. Можно ввести вручную.', { err: 1 }); }
}
function setRates() {
  const v = prompt('Сколько EUR и CHF за 1 USD? (например 0.92 0.80)', `${rates.EUR} ${rates.CHF}`); if (v === null) return;
  const n = v.trim().split(/\s+/).map(parseAmt);
  if (n.length === 2 && n.every(x => x > 0)) { rates = { USD: 1, EUR: n[0], CHF: n[1], ts: Date.now(), man: true }; save(); render(); } else toast('Введите два числа, например 0.92 0.80', { err: 1 });
}
const ratesLine = () => `<div class="mu rt">Курсы: 1 USD = ${rates.EUR.toFixed(4)} EUR · ${rates.CHF.toFixed(4)} CHF · ${rates.ts ? (rates.man ? 'введены вручную' : 'обновлено ' + new Date(rates.ts).toLocaleString('ru', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })) : 'примерные, нажмите «Обновить»'} · <button class="link" onclick="rates.man=false;fetchRates(true)">Обновить</button> · <button class="link" onclick="setRates()">Вручную</button><br>Итоги пересчитываются в выбранную валюту по текущему курсу. Переводы между валютами не входят в доходы и расходы.</div>`;

/* ---------- графики ---------- */
function donut(items) {
  const T = items.reduce((s, i) => s + i.v, 0);
  if (!T) return '<div class="mu empty">Нет расходов</div>';
  const C = 2 * Math.PI * 70; let o = 0;
  const arcs = items.map((it, i) => { const l = it.v / T * C, s = `<circle r="70" cx="100" cy="100" fill="none" stroke="${col(i)}" stroke-width="26" stroke-dasharray="${l} ${C - l}" stroke-dashoffset="${-o}" transform="rotate(-90 100 100)"/>`; o += l; return s; }).join('');
  return `<div class="dn"><svg viewBox="0 0 200 200" width="200" height="200">${arcs}<text x="100" y="96" text-anchor="middle" fill="#80808c" font-size="11">РАСХОДЫ</text><text x="100" y="118" text-anchor="middle" fill="#f4f4f7" font-size="${money(T).length > 11 ? 13 : 16}" font-family="JetBrains Mono" font-weight="600">${money(T)}</text></svg>
  <div class="lg">${items.map((it, i) => `<div><i style="background:${col(i)}"></i><span style="text-align:left;font-size:14px;color:var(--tx)">${esc(it.name)}</span><b>${money(it.v)}</b><span class="mu">${(it.v / T * 100).toFixed(0)}%</span></div>`).join('')}</div></div>`;
}
function bars(rows) {
  const W = 800, H = 200, mx = Math.max(1, ...rows.flatMap(r => [r.i, r.e])), bw = W / rows.length;
  return `<svg viewBox="0 0 ${W} ${H + 26}" width="100%">${rows.map((r, j) => { const h1 = r.i / mx * H, h2 = r.e / mx * H, w = Math.min(bw * .3, 36), x = j * bw + bw / 2 - w - 1; return `<rect x="${x}" y="${H - h1}" width="${w}" height="${h1}" rx="4" fill="#5fe0a8"/><rect x="${x + w + 2}" y="${H - h2}" width="${w}" height="${h2}" rx="4" fill="#ff6b6b"/><text x="${j * bw + bw / 2}" y="${H + 18}" text-anchor="middle" fill="#6e6e7a" font-size="11" font-family="JetBrains Mono">${r.lb}</text>`; }).join('')}</svg>
  <div class="mu" style="font-size:12px;margin-top:6px"><span class="pos">■</span> доходы &nbsp; <span class="neg">■</span> расходы</div>`;
}
function balPts() {
  if (!tx.length) return [];
  const by = {}; tx.forEach(t => by[t.date] = (by[t.date] || 0) + conv(t.amount, t.cur));
  const ds = Object.keys(by).sort(), end = new Date(today()); let d = new Date(ds[0]), b = CURS.reduce((a, c) => a + conv(start[c], c), 0), p = [];
  for (; d <= end; d.setUTCDate(d.getUTCDate() + 1)) { const k = d.toISOString().slice(0, 10); b += by[k] || 0; p.push({ l: k, v: b }); }
  return p;
}
function lineHTML(p, W, anim) {
  if (!p.length) return '<div class="mu empty">Добавьте первую операцию</div>';
  const H = 300, L = 72, R = 16, Tm = 12, B = 30, ph = H - Tm - B, n = p.length;
  let mn = Math.min(...p.map(x => x.v)), mx = Math.max(...p.map(x => x.v)); if (mx === mn) { mx++; mn--; }
  const pad = (mx - mn) * .1, lo = mn - pad, hi = mx + pad;
  const X = i => L + (n > 1 ? i / (n - 1) : .5) * (W - L - R), Y = v => Tm + (hi - v) / (hi - lo) * ph;
  const ax = v => (v < 0 ? '−' : '') + CUR[base].trim() + (base === 'CHF' ? ' ' : '') + (Math.abs(v) >= 1e5 ? Math.round(Math.abs(v) / 1e3).toLocaleString('en-US') + 'k' : Math.round(Math.abs(v)).toLocaleString('en-US'));
  let g = '', xl = '';
  for (let k = 0; k < 4; k++) { const v = lo + (hi - lo) * k / 3; g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="#1c1c22" stroke-dasharray="2 5"/><text x="0" y="${Y(v) + 4}" fill="#6e6e7a" font-size="11" font-family="JetBrains Mono">${ax(v)}</text>`; }
  for (let k = 0; k < 6 && n > 1; k++) { const i = Math.round(k * (n - 1) / 5); xl += `<text x="${X(i)}" y="${H - 8}" fill="#6e6e7a" font-size="11" text-anchor="middle" font-family="JetBrains Mono">${p[i].l.slice(5)}</text>`; }
  const pts = p.map((x, i) => `${X(i)},${Y(x.v)}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>${g}${xl}
  <polygon class="${anim ? 'fade' : ''}" points="${X(0)},${Y(lo)} ${pts} ${X(n - 1)},${Y(lo)}" fill="url(#g)"/><polyline class="${anim ? 'draw' : ''}" pathLength="1" points="${pts}" fill="none" stroke="#e6e6ee" stroke-width="2" stroke-linejoin="round"/></svg>`;
}
function drawBal(anim) { const e = $('#bal'); if (e) e.innerHTML = lineHTML(balPts(), Math.floor(e.clientWidth) || 1000, anim); }
addEventListener('resize', () => { if (tab === 'overview') drawBal(false); });

/* ---------- строки операций ---------- */
/* скрываем входящую «ногу» перевода, если исходящая есть в том же списке */
const vis = a => { const ids = new Set(a.map(t => t.id)); return a.filter(t => !(isTr(t) && t.amount > 0 && ids.has(t.link) && byId(t.link)?.amount < 0)); };
const ACT = t => `<td class="r ac"><button class="act" onclick="edit(${t.id})" title="Изменить">✎</button><button class="act" onclick="dup(${t.id})" title="Повторить сегодня">↻</button>${isTr(t) ? '' : `<button class="act" onclick="tplFromRow(${t.id})" title="В шаблоны">☆</button>`}<button class="act" onclick="del(${t.id})" title="Удалить">🗑</button></td>`;
function row(t, showDate) {
  const d = showDate ? `<td class="mu mono">${t.date.slice(5).replace('-', '.')}</td>` : '';
  const nt = t.note ? `<div class="nt">${esc(t.note)}</div>` : '';
  if (isTr(t)) {
    const L = legs(t), a = L[0], b = L[1];
    return `<tr class="trr">${d}<td>${esc(a.place)}${nt}</td><td><span class="mp">⇄ ${TR_CAT}</span></td><td class="r mono">${money(a.amount, 1, a.cur)}${b ? ` <span class="mu">→</span> ${money(b.amount, 1, b.cur)}` : ''}</td>${ACT(t)}</tr>`;
  }
  return `<tr>${d}<td>${esc(t.place) || '<span class="mu">—</span>'}${isRec(t) ? ' <span class="mu" title="Регулярная операция">⟳</span>' : ''}${nt}</td><td><span class="mp">${esc(t.cat)}</span></td><td class="r mono ${cls(t.amount)}">${money(t.amount, 1, t.cur)}</td>${ACT(t)}</tr>`;
}
const recent = n => vis([...tx]).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id).slice(0, n);

/* ---------- прогноз, лимиты, регулярные ---------- */
function recNext(r) { // следующая дата, которая ещё не создана
  const m = r.last ? nextYm(r.last) : today().slice(0, 7);
  return m + '-' + pad2(Math.min(r.day, daysIn(m)));
}
function forecast() {
  const now = today(), ym = now.slice(0, 7), d = +now.slice(8), D = daysIn(ym), cm = ops(tx.filter(t => t.date.startsWith(ym)));
  /* «фиксированные» траты (регулярные или разовые ежемесячные, как аренда) не экстраполируем по темпу */
  const pm = ops(tx.filter(t => t.date.startsWith(prevYm(ym)))), cnt = (L, pl) => L.filter(t => t.amount < 0 && ci(t.place) === pl).length;
  const fixed = t => isRec(t) || (ci(t.place) && cnt(cm, ci(t.place)) === 1 && cnt(pm, ci(t.place)) === 1 && pm.some(x => x.amount < 0 && ci(x.place) === ci(t.place) && Math.abs(x.amount - t.amount) <= .15 * Math.abs(t.amount)));
  const spent = exp(cm), earned = inc(cm), varSpent = exp(cm.filter(t => !fixed(t))), pace = varSpent / d;
  let upExp = 0, upInc = 0;
  rec.filter(r => r.on !== false).forEach(r => { const nd = recNext(r); if (nd && nd.startsWith(ym) && nd > now) { const v = conv(r.amount, r.cur); if (v < 0) upExp -= v; else upInc += v; } });
  const projExp = spent + pace * (D - d) + upExp, projInc = earned + upInc;
  return { spent, earned, pace, projExp, projInc, upExp, upInc, rate: earned > 0 ? (earned - spent) / earned : null, projRate: projInc > 0 ? (projInc - projExp) / projInc : null, d, D };
}
const pct = v => v == null ? '—' : Math.round(v * 100) + '%';
function catSpent(cat, cur, ym = today().slice(0, 7)) { return -ops(tx).filter(t => t.cat === cat && t.amount < 0 && t.date.startsWith(ym)).reduce((s, t) => s + conv(t.amount, t.cur, cur), 0); }
function limitsHTML() {
  const L = Object.entries(limits).filter(([c, l]) => l && l.v > 0 && cats.exp.includes(c));
  if (!L.length) return `<div class="mu empty sm">Лимиты не заданы. <button class="link" onclick="goTab('plan')">Задать во вкладке «Планы»</button></div>`;
  const f = forecast(), k = f.d / f.D;
  return `<div class="lims">${L.map(([c, l]) => { const s = catSpent(c, l.cur), r = s / l.v, st = r >= 1 ? 'over' : r >= .85 || r > k + .15 ? 'warn' : '';
    return `<div class="lim ${st}"><div class="lh"><span>${esc(c)}</span><span class="mono">${short(s, l.cur)} / ${short(l.v, l.cur)}</span></div><div class="pb"><i style="width:${Math.min(100, r * 100).toFixed(1)}%"></i><s style="left:${(k * 100).toFixed(1)}%" title="Сегодня"></s></div><div class="ls mu">${r >= 1 ? `превышен на ${short(s - l.v, l.cur)}` : `осталось ${short(l.v - s, l.cur)}`} · ${Math.round(r * 100)}%</div></div>`; }).join('')}</div>`;
}
async function runRecurring() {
  const now = today(), ym = now.slice(0, 7), put = [], names = [], prev = rec.map(r => r.last);
  let changed = false;
  rec.forEach(r => {
    if (r.on === false) return;
    let m = r.last ? nextYm(r.last) : ym;
    for (let i = 0; i < 24 && m <= ym; i++, m = nextYm(m)) {
      const d = m + '-' + pad2(Math.min(r.day, daysIn(m)));
      if (d > now) break;
      const id = r.id * 1000 + (+m.slice(0, 4) * 12 + +m.slice(5, 7)) % 1000;
      if (!byId(id)) { const o = { id, date: d, amount: r.amount, place: r.place, cat: r.cat, cur: r.cur }; if (r.note) o.note = r.note; put.push(o); names.push(r.place || r.cat); }
      r.last = m; changed = true;
    }
  });
  if (!changed) return;
  if (put.length) {
    if (!(await commit(put))) { rec.forEach((r, i) => r.last = prev[i]); return; }
    toast('Добавлены регулярные: ' + [...new Set(names)].join(', '));
  }
  await save();
}

/* ---------- экраны ---------- */
function overview() {
  const now = new Date(), cm = ops(tx.filter(t => t.date.startsWith(ymOf(now)))), mname = now.toLocaleString('ru', { month: 'long' }), b = totalBal(), f = forecast();
  const k = (l, v, s, c = '') => `<div class="kpi"><small>${l}</small><b class="${c}">${v}</b><div class="sub">${s}</div></div>`;
  const kp = (l, v, c = '', s = '') => `<div class="kpi sm"><small>${l}</small><b class="${c}">${v}</b>${s ? `<div class="sub">${s}</div>` : ''}</div>`;
  return `<div class="kpis">${k('Баланс', money(b), CURS.map(c => money(wal(c), 0, c)).join(' · ') + ' · <button class="link" onclick="setStart()">изменить баланс</button>')}${k('Доходы · ' + mname, money(inc(cm), 1), cm.filter(t => t.amount > 0).length + ' операций', 'pos')}${k('Расходы · ' + mname, money(-exp(cm), 1), cm.filter(t => t.amount < 0).length + ' операций', 'neg')}</div>
  <div class="two"><div class="card"><div class="top"><h3>Прогноз · ${mname}</h3><span>день ${f.d} из ${f.D}</span></div><div class="pair">
    ${kp('Расходы к концу месяца', money(-f.projExp), 'neg', `сейчас ${money(f.spent)}${f.upExp ? ` · ещё регулярные ${money(f.upExp)}` : ''}`)}
    ${kp('Темп трат в день', money(f.pace), '', 'без регулярных и ежемесячных платежей')}
    ${kp('Норма сбережений', pct(f.rate), f.rate == null ? '' : cls(f.rate), f.projRate == null ? 'нет доходов в этом месяце' : 'прогноз ' + pct(f.projRate))}
    ${kp('Итог месяца (прогноз)', money(f.projInc - f.projExp, 1), cls(f.projInc - f.projExp), `доходы ${money(f.projInc)}`)}
  </div></div>
  <div class="card"><div class="top"><h3>Лимиты · ${mname}</h3><button class="link" onclick="goTab('plan')">настроить</button></div>${limitsHTML()}</div></div>
  ${notesHTML()}<div class="card"><div class="top"><h3>Динамика баланса</h3><span>${tx.length} операций</span></div><div id="bal"></div></div>
  <div class="two"><div class="card"><h3>Расходы · ${mname}</h3>${donut(byCat(cm))}</div>
  <div class="card"><h3>Последние операции</h3>${tx.length ? `<div class="tw" style="border:0;margin:0"><table>${recent(8).map(t => row(t, 1)).join('')}</table></div>` : '<div class="mu empty">Пока пусто</div>'}</div></div>`;
}

function history() {
  const y = hm.getFullYear(), m = hm.getMonth(), sel_ = (id, opts, v) => `<select id="${id}">${opts.map(([k, l]) => `<option value="${esc(k)}" ${k === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const allCats = [...new Set([...cats.exp, ...cats.inc, ...ops().map(t => t.cat)])].filter(Boolean);
  return `<div class="cm"><button class="chip" onclick="hm=new Date(${y},${m - 1},1);render()" ${hf.all ? 'disabled' : ''}>←</button><h3>${hf.all ? 'Все месяцы' : hm.toLocaleString('ru', { month: 'long', year: 'numeric' })}</h3><button class="chip" onclick="hm=new Date(${y},${m + 1},1);render()" ${hf.all ? 'disabled' : ''}>→</button><span id="htot"></span></div>
  <div class="hf"><input id="hq" placeholder="Поиск: описание, категория, комментарий, сумма" value="${esc(hf.q)}" type="search">
  ${sel_('hft', [['', 'Все типы'], ['-', 'Расходы'], ['+', 'Доходы'], ['t', 'Переводы']], hf.type)}
  ${sel_('hfc', [['', 'Все категории'], ...allCats.map(c => [c, c])], hf.cat)}
  ${sel_('hfu', [['', 'Все валюты'], ...CURS.map(c => [c, c])], hf.cur)}
  <label class="chk"><input type="checkbox" id="hfa" ${hf.all ? 'checked' : ''}> все месяцы</label>
  ${hf.q || hf.type || hf.cat || hf.cur || hf.all ? '<button class="link" id="hfx">сбросить</button>' : ''}</div><div id="hl"></div>`;
}
function histMatch(t) {
  if (hf.type === 't' ? !isTr(t) : hf.type ? isTr(t) || (hf.type === '-') !== (t.amount < 0) : false) return false;
  if (hf.cat && t.cat !== hf.cat) return false;
  if (hf.cur && !legs(t).some(x => x.cur === hf.cur)) return false;
  if (hf.q) {
    const q = ci(hf.q), num = parseAmt(hf.q);
    const hay = legs(t).map(x => [x.place, x.cat, x.note, Math.abs(x.amount).toFixed(2), x.cur].join(' ')).join(' ').toLowerCase();
    if (!hay.includes(q) && !(num > 0 && legs(t).some(x => Math.abs(Math.abs(x.amount) - num) < .005))) return false;
  }
  return true;
}
function fillHist() {
  const base_ = hf.all ? tx : tx.filter(t => t.date.startsWith(ymOf(hm)));
  const L = vis(base_).filter(histMatch), days = [...new Set(L.map(t => t.date))].sort().reverse(), flat = L.flatMap(legs);
  const filtered = hf.q || hf.type || hf.cat || hf.cur;
  $('#htot').innerHTML = `<span class="mono pos">${money(inc(flat), 1)}</span> <span class="mono neg">${money(-exp(flat), 1)}</span>${filtered ? ` <span class="mu">· найдено ${L.length}</span>` : ''}`;
  const lim = hf.all ? 120 : 1e9, D = days.slice(0, lim);
  $('#hl').innerHTML = D.map(d => { const a = L.filter(t => t.date === d).sort((x, z) => z.id - x.id); return `<div class="dh">${new Date(d).toLocaleDateString('ru', { weekday: 'short', day: 'numeric', month: 'long', year: hf.all ? 'numeric' : undefined, timeZone: 'UTC' })}<span class="${cls(sum(a.flatMap(legs)))}">${money(sum(a.flatMap(legs)), 1)}</span></div><div class="tw"><table>${a.map(t => row(t)).join('')}</table></div>`; }).join('')
    + (days.length > lim ? `<div class="mu empty sm">Показаны последние ${lim} дней — уточните поиск</div>` : '')
    || `<div class="mu empty">${filtered ? 'Ничего не найдено' : 'В этом месяце операций нет'}</div>`;
}
function bindHist() {
  const upd = () => { hf.q = $('#hq').value; hf.type = $('#hft').value; hf.cat = $('#hfc').value; hf.cur = $('#hfu').value; fillHist(); };
  $('#hq').oninput = upd; ['#hft', '#hfc', '#hfu'].forEach(s => $(s).onchange = () => { upd(); render(); $('#' + s.slice(1))?.focus(); });
  $('#hfa').onchange = e => { hf.all = e.target.checked; render(); };
  if ($('#hfx')) $('#hfx').onclick = () => { hf = { q: '', type: '', cat: '', cur: '', all: false }; render(); };
  $('#hq').onkeydown = e => { if (e.key === 'Escape' && $('#hq').value) { e.stopPropagation(); $('#hq').value = ''; upd(); } };
  fillHist();
}

function review(m) {
  const g = {}; ops().forEach(t => (g[key(t.date, m)] ||= []).push(t));
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

function allTime() {
  const all = ops([...tx]).sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  const income = inc(all), expenses = exp(all), balance = totalBal();
  const groups = {}; all.forEach(t => (groups[t.date.slice(0, 7)] ||= []).push(t));
  const months = Object.keys(groups).sort(), activeMonths = months.length;
  const averageExpenses = activeMonths ? expenses / activeMonths : 0, averageIncome = activeMonths ? income / activeMonths : 0;
  const k = (title, value, subtitle, color = '') => `<div class="kpi"><small>${title}</small><b class="${color}">${value}</b><div class="sub">${subtitle}</div></div>`;
  const kp = (title, value, color = '') => `<div class="kpi sm"><small>${title}</small><b class="${color}">${value}</b></div>`;
  const monthlyRows = [...months].reverse().map(month => { const o = groups[month]; return `<tr><td style="text-transform:capitalize">${lbl(month, 'm')}</td><td class="r mono pos">${money(inc(o))}</td><td class="r mono neg">${money(exp(o))}</td><td class="r mono ${cls(sum(o))}">${money(sum(o), 1)}</td><td class="r">${o.length}</td></tr>`; }).join('');
  const operationRows = vis([...tx]).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id).map(t => row(t, 1)).join('');
  return `<div class="kpis">${k('Баланс', money(balance), 'Текущий баланс всех счетов')}${k('Все доходы', money(income, 1), 'За всё время', 'pos')}${k('Все расходы', money(-expenses), 'За всё время', 'neg')}</div>
    <div class="two"><div class="card"><h3>Общая статистика</h3><div class="pair">
      ${kp('Разница доходов и расходов', money(income - expenses, 1), cls(income - expenses))}${kp('Всего операций', all.length)}${kp('Месяцев с операциями', activeMonths)}${kp('Средние расходы в месяц', money(averageExpenses))}${kp('Средний доход в месяц', money(averageIncome), 'pos')}${kp('Норма сбережений', pct(income > 0 ? (income - expenses) / income : null))}
    </div></div><div class="card"><h3>Расходы за всё время</h3>${donut(byCat(all))}</div></div>
    <div class="card"><div class="top"><h3>Динамика баланса за всё время</h3><span>${all.length} операций</span></div><div id="balAll"></div></div>
    <div class="card"><div class="top"><h3>Доходы и расходы по месяцам</h3><span>${activeMonths} мес.</span></div>${months.length ? bars(months.map(month => ({ lb: month.slice(5) + '.' + month.slice(2, 4), i: inc(groups[month]), e: exp(groups[month]) }))) : '<div class="mu empty">Пока нет операций</div>'}</div>
    <div class="card"><h3>Итоги по месяцам</h3><div class="tw"><table><thead><tr><th>Месяц</th><th class="r">Доходы</th><th class="r">Расходы</th><th class="r">Итого</th><th class="r">Операции</th></tr></thead><tbody>${monthlyRows || '<tr><td colspan="5" class="mu">Пока нет операций</td></tr>'}</tbody></table></div></div>
    <div class="card"><div class="top"><h3>Все операции</h3><span>${all.length} записей</span></div><div class="tw"><table><thead><tr><th>Дата</th><th>Описание</th><th>Категория</th><th class="r">Сумма</th><th></th></tr></thead><tbody>${operationRows || '<tr><td colspan="5" class="mu">Пока нет операций</td></tr>'}</tbody></table></div></div>`;
}

/* ---------- Планы: лимиты, регулярные, шаблоны ---------- */
const curSel = (id, v, attr = '') => `<select ${id ? `id="${id}"` : ''} ${attr}>${CURS.map(c => `<option ${c === v ? 'selected' : ''}>${c}</option>`).join('')}</select>`;
function plans() {
  const ym = today().slice(0, 7);
  const limRows = cats.exp.map(c => { const l = limits[c] || {}, lc = l.cur || base, s = catSpent(c, lc, ym);
    return `<tr><td>${esc(c)}</td><td class="r mono mu">${s ? short(s, lc) : '—'}</td><td class="li"><input data-lc="${esc(c)}" inputmode="decimal" placeholder="нет" value="${l.v || ''}"></td><td class="li2">${curSel('', lc, `data-lu="${esc(c)}"`)}</td></tr>`; }).join('');
  const rk = $('#rk')?.value || '-';
  const recRows = rec.map(r => `<tr class="${r.on === false ? 'off' : ''}"><td class="mono">${r.day}-го</td><td>${esc(r.place || '—')}${r.note ? `<div class="nt">${esc(r.note)}</div>` : ''}</td><td><span class="mp">${esc(r.cat)}</span></td><td class="r mono ${cls(r.amount)}">${money(r.amount, 1, r.cur)}</td><td class="mu mono">${r.on === false ? 'пауза' : 'след. ' + (recNext(r) || '—').slice(5).split('-').reverse().join('.')}</td><td class="r ac"><button class="act" onclick="toggleRec(${r.id})" title="${r.on === false ? 'Включить' : 'Пауза'}">${r.on === false ? '▶' : '⏸'}</button><button class="act" onclick="delRec(${r.id})" title="Удалить правило">🗑</button></td></tr>`).join('');
  return `<div class="two"><div class="card"><div class="top"><h3>Лимиты в месяц</h3><span>расходы · ${new Date().toLocaleString('ru', { month: 'long' })}</span></div>
    <div class="tw lt"><table><thead><tr><th>Категория</th><th class="r">Потрачено</th><th class="r">Лимит</th><th></th></tr></thead><tbody>${limRows}</tbody></table></div><div class="mu sm2">Пустое поле — без лимита. Прогресс виден на Overview.</div></div>
  <div class="card"><div class="top"><h3>Шаблоны</h3><span>${tpl.length}</span></div>
    ${tpl.length ? `<div class="tw"><table>${tpl.map(t => `<tr><td>${esc(t.place || '—')}${t.note ? `<div class="nt">${esc(t.note)}</div>` : ''}</td><td><span class="mp">${esc(t.cat)}</span></td><td class="r mono ${cls(t.amount)}">${money(t.amount, 1, t.cur)}</td><td class="r ac"><button class="act" onclick="useTpl(${t.id})" title="Добавить сейчас">＋</button><button class="act" onclick="delTpl(${t.id})" title="Удалить шаблон">🗑</button></td></tr>`).join('')}</table></div>` : '<div class="mu empty sm">Шаблонов пока нет</div>'}
    <div class="mu sm2">Сохраняйте частые операции кнопкой «☆ В шаблоны» в форме или ☆ в списке операций. Шаблоны появляются под формой — одно нажатие добавляет операцию на выбранную дату.</div></div></div>
  <div class="card"><div class="top"><h3>Регулярные операции</h3><span>создаются автоматически при открытии</span></div>
    ${rec.length ? `<div class="tw"><table><thead><tr><th>День</th><th>Описание</th><th>Категория</th><th class="r">Сумма</th><th>Следующая</th><th></th></tr></thead><tbody>${recRows}</tbody></table></div>` : '<div class="mu empty sm">Например: аренда 1-го числа, зарплата 25-го, подписки</div>'}
    <form class="rf" id="rf" onsubmit="addRec(event)" autocomplete="off">
      <div class="seg2 mini"><select id="rk"><option value="-" ${rk === '-' ? 'selected' : ''}>Расход</option><option value="+" ${rk === '+' ? 'selected' : ''}>Доход</option></select></div>
      <input id="ra" placeholder="Сумма" inputmode="decimal">${curSel('rc', lastCur)}
      <input id="rp" placeholder="Описание, напр. Аренда" maxlength="200">
      <select id="rcat">${catList(rk).map(c => `<option>${esc(c)}</option>`).join('')}</select>
      <input id="rd" type="number" min="1" max="31" inputmode="numeric" placeholder="День (1–31)">
      <button class="btn">Добавить правило</button>
      <label class="chk rfn"><input type="checkbox" id="rnow"> если день в этом месяце уже прошёл — создать и за этот месяц</label>
    </form></div>`;
}
function bindPlans() {
  $$('[data-lc]').forEach(i => i.onchange = () => {
    const c = i.dataset.lc, v = parseAmt(i.value), u = $(`[data-lu="${CSS.escape(c)}"]`).value;
    if (v > 0) limits[c] = { v: +v.toFixed(2), cur: u }; else { delete limits[c]; i.value = ''; }
    save(); toast(v > 0 ? `Лимит «${c}»: ${short(v, u)}` : `Лимит «${c}» снят`);
  });
  $$('[data-lu]').forEach(s => s.onchange = () => { const c = s.dataset.lu; if (limits[c]) { limits[c].cur = s.value; save(); render(); } });
  $('#rk').onchange = () => { $('#rcat').innerHTML = catList($('#rk').value).map(c => `<option>${esc(c)}</option>`).join(''); };
  $('#rp').onchange = () => { const s = suggest($('#rp').value); if (s && s.kind === $('#rk').value) $('#rcat').value = s.cat; };
}
async function addRec(e) {
  e.preventDefault();
  const n = parseAmt($('#ra').value), d = Math.trunc(+$('#rd').value), k = $('#rk').value;
  if (!(n > 0)) return flashEl($('#ra')); if (!(d >= 1 && d <= 31)) return flashEl($('#rd'));
  const now = today(), ym = now.slice(0, 7), thisD = ym + '-' + pad2(Math.min(d, daysIn(ym)));
  const r = { id: uid(), day: d, amount: +((k === '+' ? 1 : -1) * n).toFixed(2), cur: $('#rc').value, place: $('#rp').value.trim(), cat: $('#rcat').value, on: true,
    last: thisD < now && !$('#rnow').checked ? ym : prevYm(ym) };
  rec.push(r); await save(); await runRecurring(); render(); toast('Правило добавлено, следующая: ' + recNext(r).split('-').reverse().join('.'));
}
function flashEl(el) { el.classList.add('bad'); el.focus(); setTimeout(() => el.classList.remove('bad'), 700); }
function toggleRec(id) {
  const r = rec.find(x => x.id === id); if (!r) return;
  if (r.on === false) { r.on = true; if (r.last < prevYm(today().slice(0, 7))) r.last = prevYm(today().slice(0, 7)); } else r.on = false; // после паузы не досоздаём пропущенные месяцы
  save(); runRecurring(); render();
}
function delRec(id) { const r = rec.find(x => x.id === id); if (!r || !confirm(`Удалить регулярную операцию «${r.place || r.cat}»? Уже созданные записи останутся.`)) return; rec = rec.filter(x => x.id !== id); save(); render(); }

function goTab(t) { tab = t; $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t)); render(); scrollTo({ top: 0, behavior: 'smooth' }); }
function render() {
  $('#places').innerHTML = [...new Set(ops().map(t => t.place).filter(Boolean))].map(p => `<option value="${esc(p)}">`).join('');
  $('#view').innerHTML = tab === 'overview' ? overview() : tab === 'history' ? history() : tab === 'all' ? allTime() : tab === 'plan' ? plans() : review(tab);
  if (tab === 'overview') { $('#view').insertAdjacentHTML('beforeend', ratesLine()); drawBal(true); }
  if (tab === 'all') { const e = $('#balAll'); if (e) e.innerHTML = lineHTML(balPts(), Math.floor(e.clientWidth) || 1000, true); }
  if (tab === 'history') bindHist();
  if (tab === 'plan') bindPlans();
  if (!catTouched && !editIds) fillCat(); renderTpl();
}
$('#tabs').onclick = e => { const t = e.target.closest('button')?.dataset.t; if (t) goTab(t); };

/* ---------- экспорт / импорт / демо ---------- */
function download(name, data, type) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type })); a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function exp_() { download('budget-' + today() + '.json', JSON.stringify({ tx, ...settingsObj(), version: 2 }, null, 1), 'application/json'); }
function expCSV() {
  const q = v => { const s = String(v ?? ''); return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const head = ['Дата', 'Тип', 'Сумма', 'Валюта', 'Описание', 'Категория', 'Комментарий', 'Сумма в ' + base, 'ID'];
  const rows = [...tx].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id).map(t => [t.date, isTr(t) ? 'Перевод' : t.amount < 0 ? 'Расход' : 'Доход', t.amount.toFixed(2), t.cur, t.place, t.cat, t.note, val(t).toFixed(2), t.id].map(q).join(';'));
  download('budget-' + today() + '.csv', '\ufeff' + [head.join(';'), ...rows].join('\r\n'), 'text/csv;charset=utf-8');
}
function validateImport(d) {
  if (!d || !Array.isArray(d.tx)) throw new Error('В файле нет списка операций (tx)');
  const seen = new Set(), good = [], bad = [];
  d.tx.forEach((t, i) => {
    if (!t || typeof t !== 'object') return bad.push(i + 1);
    let amount = typeof t.amount === 'number' ? t.amount : (String(t.amount ?? '').trim()[0] === '-' ? -1 : 1) * parseAmt(t.amount);
    let id = Math.trunc(+t.id); if (!Number.isFinite(id) || id <= 0 || seen.has(id)) id = uid();
    if (!okDate(t.date) || !Number.isFinite(amount)) return bad.push(i + 1);
    seen.add(id);
    const o = { id, date: t.date, amount: +amount.toFixed(2), place: String(t.place ?? '').slice(0, 200), cat: String(t.cat ?? 'Другое').slice(0, 60) || 'Другое', cur: CURS.includes(t.cur) ? t.cur : 'USD' };
    if (t.note) o.note = String(t.note).slice(0, 500);
    if (t.type === 'tr' && Number.isFinite(+t.link)) { o.type = 'tr'; o.link = Math.trunc(+t.link); }
    good.push(o);
  });
  const arr = (v, f) => Array.isArray(v) ? v.filter(f) : [];
  const st = {
    start: normStart(d.start ?? 0),
    cats: d.cats && Array.isArray(d.cats.exp) && Array.isArray(d.cats.inc) ? { exp: d.cats.exp.map(String), inc: d.cats.inc.map(String) } : cats,
    rates: d.rates && CURS.every(c => d.rates[c] > 0) ? d.rates : rates,
    base: CURS.includes(d.base) ? d.base : base,
    notes: arr(d.notes, n => n && n.text), limits: d.limits && typeof d.limits === 'object' ? d.limits : {},
    rec: arr(d.rec, r => r && r.id && r.day >= 1 && r.day <= 31 && Number.isFinite(+r.amount)), tpl: arr(d.tpl, t => t && t.id && Number.isFinite(+t.amount))
  };
  return { good, bad, st };
}
$('#imp').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  let v;
  try { v = validateImport(JSON.parse(await f.text())); } catch (err) { return toast('Не удалось прочитать файл: ' + (err.message || 'неверный JSON'), { err: 1 }); }
  if (!v.good.length && !confirm('В файле нет корректных операций. Всё равно заменить данные (останутся пустыми)?')) return;
  if (!confirm(`Заменить текущие данные импортированными?\nОпераций: ${v.good.length}${v.bad.length ? `\nПропущено с ошибками (строки ${v.bad.slice(0, 10).join(', ')}${v.bad.length > 10 ? '…' : ''}): ${v.bad.length}` : ''}`)) return;
  const snap = { tx, ...settingsObj() };
  tx = v.good; ({ start, cats, rates, base, notes, limits, rec, tpl } = { ...settingsObj(), ...v.st });
  $('#base').value = base; render();
  if (demoMode) return;
  if (remote) {
    try { await api('import', 'POST', { tx, settings: settingsObj() }); }
    catch (err) { ({ tx, start, cats, rates, base, notes, limits, rec, tpl } = snap); $('#base').value = base; render(); return toast(errMsg(err) + ' Импорт отменён.', { err: 1 }); }
  } else saveLocal();
  toast(`Импортировано операций: ${v.good.length}${v.bad.length ? ', пропущено: ' + v.bad.length : ''}`);
};
function demo() {
  if (demoMode) return;
  if (!confirm('Показать демо-данные? Ваши данные не изменятся: демо работает только на экране, ничего не сохраняется. Выход — кнопка «Выйти из демо» или обновление страницы.')) return;
  demoMode = true; $('#dm').hidden = false; $('#bn').hidden = true; $('#demoBtn').disabled = true;
  const P = [['Магазин', 'Еда', 5, 45], ['Кафе', 'Еда', 4, 22], ['Такси', 'Транспорт', 6, 18], ['Одежда', 'Покупки', 30, 120], ['Кино', 'Развлечения', 10, 25], ['Аптека', 'Здоровье', 8, 30]];
  tx = []; start = { USD: 1500, EUR: 500, CHF: 300 }; let id = 1;
  for (let i = 100; i >= 0; i--) {
    const d = new Date(Date.now() - i * 864e5), ds = isoOf(d);
    if (d.getDate() === 1) tx.push({ id: id++, date: ds, amount: 2400, place: 'Зарплата', cat: 'Зарплата', cur: 'USD' });
    if (d.getDate() === 5) tx.push({ id: id++, date: ds, amount: -650, place: 'Аренда', cat: 'Жильё', cur: 'USD' });
    if (d.getDate() === 10) { tx.push({ id: id, date: ds, amount: -300, place: 'USD → CHF', cat: TR_CAT, cur: 'USD', type: 'tr', link: id + 1 }, { id: id + 1, date: ds, amount: +conv(300, 'USD', 'CHF').toFixed(2), place: 'USD → CHF', cat: TR_CAT, cur: 'CHF', type: 'tr', link: id }); id += 2; }
    for (let j = 0; j < 1 + Math.floor(Math.random() * 3); j++) { const p = P[Math.floor(Math.random() * P.length)]; tx.push({ id: id++, date: ds, amount: -+(p[2] + Math.random() * p[3]).toFixed(2), place: p[0], cat: p[1], cur: ['USD', 'USD', 'EUR', 'CHF'][Math.floor(Math.random() * 4)] }); }
  }
  limits = { 'Еда': { v: 500, cur: base }, 'Транспорт': { v: 150, cur: base }, 'Покупки': { v: 200, cur: base } };
  tpl = [{ id: 11, amount: -4.5, cur: 'CHF', place: 'Кафе', cat: 'Еда' }, { id: 12, amount: -3.6, cur: 'CHF', place: 'Такси', cat: 'Транспорт' }];
  rec = [{ id: 21, day: 28, amount: -12.9, cur: 'CHF', place: 'Spotify', cat: 'Подписки', on: true, last: prevYm(today().slice(0, 7)) }];
  catTouched = false; render();
}

/* ---------- стикеры ---------- */
const notesHTML = () => `<div class="notes"><div class="nh"><h4>Стикеры</h4><span class="mu">напоминания, на баланс не влияют</span></div>
  <form class="nf" onsubmit="addNote(event)"><input id="nt" placeholder="Например: Саша должен вернуть" maxlength="120" required autocomplete="off"><input id="na" placeholder="Сумма (необязательно)" inputmode="decimal" autocomplete="off"><select id="nc">${CURS.map(c => `<option ${c === lastCur ? 'selected' : ''}>${c}</option>`).join('')}</select><button class="chip">Добавить</button></form>
  <div class="sg">${notes.map(n => `<div class="st" style="--r:${(n.id % 5) - 2}deg"><button class="x" onclick="delNote(${n.id})" title="Выбросить">×</button><div class="stt">${esc(n.text)}</div>${n.amount ? `<div class="sta">${money(n.amount, 1, n.cur)}</div>` : ''}<div class="std">${new Date(n.id).toLocaleDateString('ru', { day: 'numeric', month: 'short' })}</div></div>`).join('') || '<div class="mu">Пока нет стикеров</div>'}</div></div>`;
function addNote(e) {
  e.preventDefault();
  const raw = $('#na').value.trim(), a = (raw[0] === '-' || raw[0] === '−' ? -1 : 1) * parseAmt(raw);
  notes.unshift({ id: uid(), text: $('#nt').value.trim(), amount: isNaN(a) ? 0 : a, cur: $('#nc').value });
  save(); render(); $('#nt').focus();
}
function delNote(id) { notes = notes.filter(n => n.id !== id); save(); render(); }

/* ---------- запуск ---------- */
const co = CURS.map(c => `<option>${c}</option>`).join('');
$('#cur').innerHTML = co; $('#cur2').innerHTML = co; $('#base').innerHTML = co;
$('#base').onchange = e => { base = e.target.value; save(); render(); };
async function init() {
  tx = ld('bd_tx', []).map(normTx);
  try {
    const r = await fetch('/api/state', { cache: 'no-store' });
    if (r.ok && (r.headers.get('content-type') || '').includes('json')) {
      const d = await r.json(); remote = true;
      tx = d.tx.map(normTx);
      if (d.settings) { const s = d.settings; start = normStart(s.start ?? start); cats = s.cats || cats; rates = s.rates || rates; base = s.base || base; lastCur = s.lastCur || lastCur; notes = s.notes || []; limits = s.limits || {}; rec = s.rec || []; tpl = s.tpl || []; }
      else saveSettings();
    }
  } catch (e) {}
  $('#cur').value = lastCur; $('#cur2').value = CURS.find(c => c !== lastCur); $('#base').value = base;
  $('#bn').hidden = remote;
  setDate(today()); setKind('-'); render();
  runRecurring();
  if (!rates.man && (!rates.ts || Date.now() - rates.ts > 432e5)) fetchRates(false);
}
init();
