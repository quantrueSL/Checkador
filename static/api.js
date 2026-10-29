/**
 * Versión publicada (GitHub Pages): sustituye a frontend/js/api.js. No hay servidor: los datos viajan cifrados en
 * data.enc y se descifran en el navegador con usuario y contraseña. Sin ellos el archivo es ilegible.
 */
const SESSION_KEY = 'pate.sesion';
const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

let bundle = null;
let resolveReady;
const ready = new Promise((r) => { resolveReady = r; });

async function decrypt(blob, user, pass) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(`${user}:${pass}`), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64(blob.salt), iterations: blob.iter, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(blob.iv) }, key, b64(blob.ct));
  return JSON.parse(new TextDecoder().decode(plain));
}

// ---- pantalla de acceso -------------------------------------------------------------------------------------------
function injectStyles() {
  const st = document.createElement('style');
  st.textContent = `
    #filters, .activebar { display: none !important; }
    .gate { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 16px;
      background: #0b2545; font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; }
    .gate__card { width: 100%; max-width: 360px; background: #fff; border-radius: 14px; padding: 28px 24px; box-shadow: 0 20px 50px rgba(0,0,0,.35); }
    .gate__logo { width: 40px; height: 40px; border-radius: 9px; background: #0b2545; color: #1fb5b5; font-weight: 800; font-size: 22px;
      display: flex; align-items: center; justify-content: center; margin-bottom: 14px; }
    .gate h1 { margin: 0 0 4px; font-size: 20px; color: #0b2545; }
    .gate p { margin: 0 0 18px; font-size: 14px; color: #5b6b7c; }
    .gate label { display: block; font-size: 12px; font-weight: 600; color: #0b2545; margin: 12px 0 4px; }
    .gate input { width: 100%; box-sizing: border-box; padding: 10px 12px; font-size: 16px; border: 1px solid #c8d3de; border-radius: 8px; }
    .gate input:focus { outline: 2px solid #1fb5b5; border-color: #1fb5b5; }
    .gate button { width: 100%; margin-top: 18px; padding: 11px; font-size: 15px; font-weight: 600; color: #fff; background: #0b2545;
      border: 0; border-radius: 8px; cursor: pointer; }
    .gate button:disabled { opacity: .6; cursor: wait; }
    .gate__err { min-height: 18px; margin-top: 10px; font-size: 13px; color: #b4491a; }`;
  document.head.append(st);
}

function showGate(blob) {
  const el = (tag, props = {}, ...kids) => {
    const n = Object.assign(document.createElement(tag), props);
    n.append(...kids);
    return n;
  };
  const user = el('input', { id: 'gate-user', type: 'text', autocomplete: 'username', autocapitalize: 'none', spellcheck: false });
  const pass = el('input', { id: 'gate-pass', type: 'password', autocomplete: 'current-password' });
  const err = el('div', { className: 'gate__err', role: 'alert' });
  const btn = el('button', { type: 'submit' }, 'Entrar');
  const form = el('form', {}, el('label', { htmlFor: 'gate-user' }, 'Usuario'), user, el('label', { htmlFor: 'gate-pass' }, 'Contraseña'), pass, err, btn);
  const gate = el('div', { className: 'gate' }, el('div', { className: 'gate__card' },
    el('div', { className: 'gate__logo' }, 'P'), el('h1', {}, 'PATE Workforce Intelligence'),
    el('p', {}, 'Demo de acceso restringido. Introduce el usuario y la contraseña que te han facilitado.'), form));
  document.body.append(gate);
  user.focus();
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    btn.disabled = true; err.textContent = '';
    try {
      bundle = await decrypt(blob, user.value.trim(), pass.value);
      try { sessionStorage.setItem(SESSION_KEY, JSON.stringify([user.value.trim(), pass.value])); } catch { /* sin almacenamiento */ }
      gate.remove();
      resolveReady();
    } catch {
      err.textContent = 'Usuario o contraseña incorrectos.';
      btn.disabled = false; pass.select();
    }
  });
}

async function boot() {
  injectStyles();
  const blob = await (await fetch('data.enc', { cache: 'no-cache' })).json();
  try {
    const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
    if (saved) { bundle = await decrypt(blob, saved[0], saved[1]); resolveReady(); return; }
  } catch { /* sesión caducada o credenciales cambiadas: se vuelve a pedir */ }
  showGate(blob);
}
boot().catch((e) => { document.body.textContent = `No se pudo cargar la demo: ${e.message}`; });

// ---- "servidor" en el navegador -----------------------------------------------------------------------------------
const SORT = { importe: 'importe_sin_pagar', horas: 'horas_sin_pagar', trabajador: 'trabajador', depto: 'depto', mes: 'mes', fichajes: 'horas_fichajes' };

function casos(p) {
  const base = bundle.casos[p.mes || ''];
  if (!base) throw new Error('Mes no disponible en la demo');
  const q = String(p.q || '').trim();
  let rows = base.rows.filter((x) => (!p.depto || x.depto === p.depto) && (!p.motivo || x.motivo === p.motivo) && (!q || String(x.trabajador).includes(q)));
  const key = SORT[p.sort] || SORT.importe, sign = p.dir === 'asc' ? 1 : -1;
  rows = [...rows].sort((a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0) * sign);
  const size = Math.min(100, Math.max(1, Number(p.pageSize) || 25)), page = Math.max(1, Number(p.page) || 1);
  return { hay_datos: base.hay_datos, rows: rows.slice((page - 1) * size, page * size), total: rows.length, kpis: base.kpis,
    meses: base.meses, deptos: base.deptos, motivos: base.motivos };
}

function route(path, p) {
  if (path === 'meta') return bundle.meta;
  if (path === 'resumen') return bundle.resumen[String(Number(p.comida) || 1)] || bundle.resumen['1'];
  if (path === 'horas_extra') return bundle.horas_extra[String(Number(p.comida) || 1)] || bundle.horas_extra['1'];
  if (path === 'nomina/extras') return bundle.extras[p.mes || ''];
  if (path === 'nomina/casos') return casos(p);
  if (path === 'nomina/detalle') {
    const d = bundle.detalle[String(p.id)];
    if (!d) throw new Error('Caso no disponible en la demo');
    return d;
  }
  throw new Error('Esta pantalla no está disponible en la versión publicada de la demo.');
}

export const get = async (path, params) => { await ready; return route(path, params || {}); };
export const post = async () => { throw new Error('No disponible en la versión publicada de la demo.'); };
export const postFile = post;
export const exportUrl = () => '#';
export const STATIC = true;
