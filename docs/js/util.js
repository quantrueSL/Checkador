const SVG_NS = 'http://www.w3.org/2000/svg';

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
}

function applyProps(el, props, svg) {
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.setAttribute('class', v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (!svg && (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected')) el[k] = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
}

/** Crea un elemento HTML. Los hijos de tipo texto nunca se interpretan como HTML. */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  applyProps(el, props, false);
  append(el, children);
  if (props && props.value != null) el.value = props.value; // los <select> necesitan sus <option> antes
  return el;
}

export function s(tag, props, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  applyProps(el, props, true);
  append(el, children);
  return el;
}

// ---- fechas (siempre ISO yyyy-mm-dd, calculadas en UTC para evitar desfases de zona horaria) ----
export const parseISO = (d) => new Date(d + 'T00:00:00Z');
export const toISO = (dt) => dt.toISOString().slice(0, 10);
export const addDays = (d, n) => { const dt = parseISO(d); dt.setUTCDate(dt.getUTCDate() + n); return toISO(dt); };
export const diffDays = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 864e5);
export const dow = (d) => (parseISO(d).getUTCDay() + 6) % 7; // 0 = lunes
export const fmtDate = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '—');
export const fmtShort = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const monthName = (ym) => { const m = MONTHS[Number(ym.slice(5, 7)) - 1]; return m[0].toUpperCase() + m.slice(1); };
export const monthLabel = (ym) => `${monthName(ym)} ${ym.slice(0, 4)}`;
export const monthShort = (ym) => monthName(ym).slice(0, 3);

const nf = new Intl.NumberFormat('es-MX');
export const fmtInt = (n) => (n == null ? '—' : nf.format(n));
export const fmtMoney = (n, signed = false) => (n == null ? '—' : `${signed && n > 0 ? '+' : n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
export const fmtPct = (n, digits = 1) => (n == null ? '—' : `${n.toLocaleString('es-MX', { minimumFractionDigits: digits, maximumFractionDigits: digits })} %`);

export function debounce(fn, ms = 250) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function toast(msg) {
  const el = h('div', { class: 'toast', role: 'status' }, msg);
  document.body.append(el);
  setTimeout(() => el.remove(), 3200);
}
