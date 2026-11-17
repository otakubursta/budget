const APP = 'Budget';
const PUBLIC = new Set(['/manifest.webmanifest', '/apple-touch-icon.png', '/icon-192.png', '/icon-512.png']);
const J = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });
const CURS = ['USD', 'EUR', 'CHF'];
const int = v => v === null || v === undefined || v === '' || !Number.isFinite(+v) ? null : Math.trunc(+v);
const clean = t => ({
  id: Math.trunc(+t.id), date: String(t.date), amount: +t.amount, place: String(t.place ?? '').slice(0, 200), cat: String(t.cat ?? '').slice(0, 60), cur: CURS.includes(t.cur) ? t.cur : 'USD',
  note: t.note ? String(t.note).slice(0, 500) : null, type: t.type === 'tr' ? 'tr' : null, link: t.type === 'tr' ? int(t.link) : null
});
const valid = t => Number.isFinite(t.id) && Number.isFinite(t.amount) && /^\d{4}-\d{2}-\d{2}$/.test(t.date);
const BASE_COLS = ['id', 'date', 'amount', 'place', 'cat', 'cur'];
const NEW_COLS = { note: 'TEXT', type: 'TEXT', link: 'INTEGER' };
let COLS = null;
/* Автомиграция: добавляем недостающие колонки (note, type, link). Если ALTER не прошёл — работаем со старыми колонками. */
async function cols(env) {
  if (COLS) return COLS;
  const { results } = await env.DB.prepare('PRAGMA table_info(tx)').all();
  const have = new Set(results.map(r => r.name));
  for (const [c, ty] of Object.entries(NEW_COLS)) {
    if (have.has(c)) continue;
    try { await env.DB.prepare(`ALTER TABLE tx ADD COLUMN ${c} ${ty}`).run(); have.add(c); } catch (e) { if (/duplicate column/i.test(String(e && e.message))) have.add(c); }
  }
  return (COLS = [...BASE_COLS, ...Object.keys(NEW_COLS)].filter(c => have.has(c)));
}
const insert = (env, C, t) => env.DB.prepare(`INSERT OR REPLACE INTO tx (${C}) VALUES (${C.map(() => '?')})`).bind(...C.map(c => t[c] ?? null));
async function body(request) { try { return await request.json(); } catch { return undefined; } }

const enc = new TextEncoder();
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const same = (a, b) => a.length === b.length && crypto.subtle.timingSafeEqual(enc.encode(a), enc.encode(b));
async function sign(msg, key) {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
}
const page = err => new Response(`<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${APP}</title><link rel="manifest" href="/manifest.webmanifest"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="${APP}"><meta name="apple-mobile-web-app-status-bar-style" content="black"><meta name="theme-color" content="#060608">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(520px 360px at 50% -60px,rgba(255,255,255,.16),transparent 70%),#000;color:#f4f4f7;font:16px Inter,system-ui,sans-serif}
form{width:min(340px,88vw);background:linear-gradient(135deg,rgba(255,255,255,.11),rgba(255,255,255,.035));backdrop-filter:blur(30px);border:1px solid rgba(255,255,255,.15);box-shadow:inset 0 1px 0 rgba(255,255,255,.32),0 24px 50px rgba(0,0,0,.55);border-radius:26px;padding:28px;display:flex;flex-direction:column;gap:14px}
h1{margin:0 0 4px;font-size:20px}input{background:#0f0f14;color:#f4f4f7;border:1px solid #1a1a20;border-radius:12px;padding:13px;font:inherit}
button{background:linear-gradient(#b9c1d2,#9aa3b8);border:0;border-radius:12px;padding:13px;font:600 16px Inter,system-ui;color:#0a0a0c}.e{color:#ff6b6b;font-size:14px}</style></head>
<body><form method="POST" action="/login"><h1>${APP}</h1>
<input name="username" value="admin" autocomplete="username" style="position:absolute;opacity:0;height:0;width:0;padding:0;border:0" tabindex="-1">
<input type="password" name="password" placeholder="Пароль" autocomplete="current-password" autofocus required>
${err ? '<div class="e">Неверный пароль</div>' : ''}<button>Войти</button></form></body></html>`,
  { status: err ? 401 : 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
async function gate(request, env, url) {
  const pw = env.APP_PASSWORD || env.JOURNAL_PASSWORD;
  if (!pw) return new Response('Пароль не настроен', { status: 503 });
  if (url.pathname === '/logout') return new Response(null, { status: 303, headers: { Location: '/', 'Set-Cookie': 'sess=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax' } });
  if (url.pathname === '/login' && request.method === 'POST') {
    const f = await request.formData();
    if (same(await sign('pw', String(f.get('password') || '')), await sign('pw', pw))) {
      const exp = Date.now() + 180 * 864e5;
      return new Response(null, { status: 303, headers: { Location: '/', 'Set-Cookie': `sess=${exp}.${await sign(String(exp), pw)}; Path=/; Max-Age=${180 * 86400}; HttpOnly; Secure; SameSite=Lax` } });
    }
    await new Promise(r => setTimeout(r, 1000));
    return page(true);
  }
  const m = (request.headers.get('Cookie') || '').match(/(?:^|; )sess=(\d+)\.([0-9a-f]{64})/);
  if (m && +m[1] > Date.now() && same(await sign(m[1], pw), m[2])) return null;
  if (url.pathname.startsWith('/api/')) return new Response('{"error":"auth"}', { status: 401, headers: { 'Content-Type': 'application/json' } });
  return page(false);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url), m = request.method, p = url.pathname;
    if (m === 'GET' && PUBLIC.has(p)) return env.ASSETS.fetch(request);
    const blocked = await gate(request, env, url); if (blocked) return blocked;

    if (p.startsWith('/api/')) {
      try { return await api(request, env, url, m, p); }
      catch (e) { return J({ error: 'server', detail: String(e && e.message || e).slice(0, 200) }, 500); }
    }
    return env.ASSETS.fetch(request);
  }
};

async function api(request, env, url, m, p) {
  const C = await cols(env);
  if (p === '/api/state' && m === 'GET') {
    const { results } = await env.DB.prepare(`SELECT ${C} FROM tx ORDER BY date,id`).all();
    const s = await env.DB.prepare("SELECT value FROM kv WHERE key='settings'").first();
    let settings = null; try { settings = s ? JSON.parse(s.value) : null; } catch { settings = null; }
    return new Response(JSON.stringify({ tx: results, settings }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  }
  if (p === '/api/tx' && m === 'POST') {
    const b = await body(request);
    if (b === undefined || b === null) return J({ error: 'bad json' }, 400);
    const rows = (Array.isArray(b) ? b : [b]).map(clean);
    if (!rows.length || rows.length > 500 || !rows.every(valid)) return J({ error: 'bad data' }, 400);
    await env.DB.batch(rows.map(t => insert(env, C, t)));
    return J({ ok: 1, count: rows.length });
  }
  if (p === '/api/tx' && m === 'DELETE') {
    const ids = [...(url.searchParams.get('ids') || '').split(','), ...url.searchParams.getAll('id')].map(int).filter(v => v !== null);
    if (!ids.length || ids.length > 500) return J({ error: 'bad ids' }, 400);
    await env.DB.batch(ids.map(id => env.DB.prepare('DELETE FROM tx WHERE id=?').bind(id)));
    return J({ ok: 1 });
  }
  if (p === '/api/settings' && m === 'PUT') {
    const txt = await request.text();
    if (txt.length > 500000) return J({ error: 'too big' }, 413);
    let v; try { v = JSON.parse(txt); } catch { return J({ error: 'bad json' }, 400); }
    if (!v || typeof v !== 'object' || Array.isArray(v)) return J({ error: 'bad data' }, 400);
    await env.DB.prepare("INSERT OR REPLACE INTO kv (key,value) VALUES ('settings',?)").bind(txt).run();
    return J({ ok: 1 });
  }
  if (p === '/api/import' && m === 'POST') {
    const b = await body(request);
    if (!b || typeof b !== 'object' || !Array.isArray(b.tx)) return J({ error: 'bad json' }, 400);
    const rows = b.tx.map(clean).filter(valid);
    const st = [env.DB.prepare('DELETE FROM tx')];
    for (let i = 0; i < rows.length; i += 200) {
      st.push(env.DB.prepare(`INSERT OR REPLACE INTO tx (${C}) SELECT ${C.map(c => `json_extract(value,'$.${c}')`)} FROM json_each(?)`).bind(JSON.stringify(rows.slice(i, i + 200))));
    }
    if (b.settings && typeof b.settings === 'object') st.push(env.DB.prepare("INSERT OR REPLACE INTO kv (key,value) VALUES ('settings',?)").bind(JSON.stringify(b.settings)));
    await env.DB.batch(st);
    return J({ ok: 1, count: rows.length });
  }
  return J({ error: 'not found' }, 404);
}
