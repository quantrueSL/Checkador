/** Estado global: periodo y filtros compartidos por todas las pantallas. */
import { addDays, monthLabel } from './util.js';

const KEY = 'pate.filtros.v1';
const listeners = new Set();

const state = { meta: null, period: { preset: 'todo', desde: null, hasta: null }, depto: '', trabajador: null, nombres: false, comida: 1 };

try {
  const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (saved) Object.assign(state, { period: saved.period || state.period, depto: saved.depto || '', trabajador: saved.trabajador || null, comida: saved.comida || 1 });
} catch { /* almacenamiento no disponible: se parte de cero */ }

export const getState = () => state;
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export function setState(patch) {
  Object.assign(state, patch);
  try { localStorage.setItem(KEY, JSON.stringify({ period: state.period, depto: state.depto, trabajador: state.trabajador, comida: state.comida })); } catch { /* ignorar */ }
  listeners.forEach((fn) => fn(state));
}

/** Lista de periodos disponibles según el rango real de datos. */
export function periodOptions(meta) {
  const opts = [
    { value: 'todo', label: 'Todo el periodo' },
    { value: '7d', label: 'Últimos 7 días' },
    { value: '30d', label: 'Últimos 30 días' },
  ];
  for (let ym = meta.desde.slice(0, 7); ym <= meta.hasta.slice(0, 7);) {
    opts.push({ value: ym, label: monthLabel(ym) });
    const [y, m] = ym.split('-').map(Number);
    ym = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  }
  opts.push({ value: 'custom', label: 'Personalizado…' });
  return opts;
}

/** Traduce el periodo elegido a un rango de fechas. "Últimos N días" se cuenta desde el último dato, no desde hoy. */
export function resolvePeriod(meta, p = state.period) {
  const { desde: lo, hasta: hi } = meta;
  const clamp = (a, b) => ({ desde: a < lo ? lo : a, hasta: b > hi ? hi : b });
  if (p.preset === '7d') return clamp(addDays(hi, -6), hi);
  if (p.preset === '30d') return clamp(addDays(hi, -29), hi);
  if (p.preset === 'custom' && p.desde && p.hasta && p.desde <= p.hasta) return clamp(p.desde, p.hasta);
  if (/^\d{4}-\d{2}$/.test(p.preset)) {
    const [y, m] = p.preset.split('-').map(Number);
    return clamp(`${p.preset}-01`, `${p.preset}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`);
  }
  return { desde: lo, hasta: hi };
}

/** Parámetros comunes de consulta derivados de los filtros globales. */
export function filterParams(extra = {}) {
  const { desde, hasta } = resolvePeriod(state.meta);
  return { desde, hasta, depto: state.depto, trabajador: state.trabajador && state.trabajador.id, nombres: state.nombres ? 1 : '', ...extra };
}
