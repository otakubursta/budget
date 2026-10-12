const APP = 'Budget';
const PUBLIC = new Set(['/manifest.webmanifest', '/apple-touch-icon.png', '/icon-192.png', '/icon-512.png']);
const J = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });
const CURS = ['USD', 'EUR', 'CHF'];
const clean = t => ({ id: Math.trunc(+t.id), date: String(t.date), amount: +t.amount, place: String(t.place ?? '').slice(0, 200), cat: String(t.cat ?? '').slice(0, 60), cur: CURS.includes(t.cur) ? t.cur : 'USD' });
const valid = t => Number.isFinite(t.id) && Number.isFinite(t.amount) && /^\d{4}-\d{2}-\d{2}$/.test(t.date);
const INS = 'INSERT OR REPLACE INTO tx (id,date,amount,place,cat,cur) ';

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

    if (p === '/api/state' && m === 'GET') {
      const { results } = await env.DB.prepare('SELECT id,date,amount,place,cat,cur FROM tx ORDER BY date,id').all();
      const s = await env.DB.prepare("SELECT value FROM kv WHERE key='settings'").first();
      return J({ tx: results, settings: s ? JSON.parse(s.value) : null });
    }
    if (p === '/api/tx' && m === 'POST') {
      const t = clean(await request.json());
      if (!valid(t)) return J({ error: 'bad data' }, 400);
      await env.DB.prepare(INS + 'VALUES (?,?,?,?,?,?)').bind(t.id, t.date, t.amount, t.place, t.cat, t.cur).run();
      return J({ ok: 1 });
    }
    if (p === '/api/tx' && m === 'DELETE') {
      await env.DB.prepare('DELETE FROM tx WHERE id=?').bind(url.searchParams.get('id')).run();
      return J({ ok: 1 });
    }
    if (p === '/api/settings' && m === 'PUT') {
      const txt = await request.text();
      if (txt.length > 200000) return J({ error: 'too big' }, 413);
      JSON.parse(txt);
      await env.DB.prepare("INSERT OR REPLACE INTO kv (key,value) VALUES ('settings',?)").bind(txt).run();
      return J({ ok: 1 });
    }
    if (p === '/api/import' && m === 'POST') {
      const body = await request.json();
      const rows = (Array.isArray(body.tx) ? body.tx : []).map(clean).filter(valid);
      const st = [env.DB.prepare('DELETE FROM tx')];
      for (let i = 0; i < rows.length; i += 200) {
        st.push(env.DB.prepare(INS + "SELECT json_extract(value,'$.id'),json_extract(value,'$.date'),json_extract(value,'$.amount'),json_extract(value,'$.place'),json_extract(value,'$.cat'),json_extract(value,'$.cur') FROM json_each(?)").bind(JSON.stringify(rows.slice(i, i + 200))));
      }
      if (body.settings) st.push(env.DB.prepare("INSERT OR REPLACE INTO kv (key,value) VALUES ('settings',?)").bind(JSON.stringify(body.settings)));
      await env.DB.batch(st);
      return J({ ok: 1, count: rows.length });
    }
    if (p.startsWith('/api/')) return J({ error: 'not found' }, 404);
    return env.ASSETS.fetch(request);
  }
};
