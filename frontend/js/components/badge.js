import { h } from '../util.js';

export const STATE_LABEL = { ok: 'Sin incidencias', incidencia: 'Incidencia', pendiente: 'Pendiente de validar' };
const SEVERITY = { media: ['incidencia', 'Media'], baja: ['neutral', 'Baja'], info: ['pendiente', 'Informativa'] };

/** kind: ok | incidencia | pendiente | neutral. La forma del punto distingue el estado sin depender solo del color. */
export const badge = (kind, text) => h('span', { class: `badge badge--${kind}` }, text ?? STATE_LABEL[kind]);

/** Severidad PROPUESTA de una jornada (la más alta entre sus tipos). */
export function severityBadge(sev) {
  if (!sev) return h('span', { class: 'muted' }, '—');
  const [kind, label] = SEVERITY[sev];
  return badge(kind, label);
}

/** Origen y gestión: detectada por el sistema, o revisada por una persona (sin usuarios registrados todavía). */
export const managementBadge = (revision) => (revision ? badge('ok', 'Revisada por una persona') : badge('neutral', 'Detectada automáticamente'));

export function typeTags(tipos, meta) {
  const byKey = Object.fromEntries(meta.incidencias.map((t) => [t.key, t]));
  return tipos.length
    ? tipos.map((k) => h('span', { class: `tag${byKey[k].estado === 'pendiente' ? ' tag--pendiente' : ''}` }, byKey[k].label))
    : h('span', { class: 'muted' }, '—');
}

export const times = (horas) => h('span', { style: { whiteSpace: 'nowrap' } }, ...horas.map((t) => h('span', { class: 'time' }, t.slice(0, 5))));
