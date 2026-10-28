import { h, fmtInt, fmtDate } from '../util.js';
import { icon } from '../icons.js';
import { get, exportUrl } from '../api.js';
import { getState, filterParams } from '../state.js';
import { pageHead } from '../components/layout.js';
import { badge, severityBadge, managementBadge } from '../components/badge.js';
import { dataTable } from '../components/dataTable.js';
import { openJornada } from '../components/jornadaDrawer.js';

export async function render(host, ctx) {
  const { meta, nombres } = getState();
  const params = filterParams();
  const res = await get('resumen', params);
  const tipo = meta.incidencias.some((t) => t.key === ctx.route.query.tipo) ? ctx.route.query.tipo : '';
  const counts = Object.fromEntries(res.incidencias.map((t) => [t.key, t.jornadas]));
  const labels = Object.fromEntries(meta.incidencias.map((t) => [t.key, t.label]));

  host.replaceChildren(pageHead({
    title: 'Incidencias',
    subtitle: `Alertas que necesitan revisión, no errores confirmados · ${fmtDate(res.periodo.desde)} – ${fmtDate(res.periodo.hasta)}`,
  }));

  const pills = h('div', { class: 'pills', role: 'group', 'aria-label': 'Tipo de incidencia' },
    h('button', { class: 'pill', type: 'button', 'aria-pressed': String(!tipo), onclick: () => ctx.navigate('incidencias') },
      'Todas', h('span', { class: 'pill__n num' }, fmtInt(res.kpis.incidencia + res.kpis.pendiente))),
    ...meta.incidencias.map((t) => h('button', { class: 'pill', type: 'button', 'aria-pressed': String(tipo === t.key), onclick: () => ctx.navigate('incidencias', { tipo: t.key }) },
      t.label, h('span', { class: 'pill__n num' }, fmtInt(counts[t.key])))));

  const open = (r) => openJornada({ trabajador: r.trabajador, fecha: r.fecha, review: true, onChange: () => table.reload(),
    onOpenWorker: (id) => ctx.navigate(`colaborador/${id}`) });

  const table = dataTable({
    searchPlaceholder: nombres ? 'Buscar por ID o nombre…' : 'Buscar por ID…',
    sort: { key: 'fecha', dir: 'desc' },
    filters: [
      { key: 'revision', label: 'Gestión', value: 'pendiente', options: [
        { value: 'pendiente', label: 'Por revisar' }, { value: 'revisada', label: 'Revisadas por una persona' }, { value: '', label: 'Todas' }] },
      { key: 'severidad', label: 'Severidad (propuesta)', options: [{ value: '', label: 'Todas' },
        ...Object.entries(meta.severidades).map(([value, label]) => ({ value, label }))] },
    ],
    exportHref: (p) => exportUrl('incidencias', { ...params, tipo, ...p }),
    onRowClick: open,
    columns: [
      { key: 'severidad', label: 'Severidad', render: (r) => severityBadge(r.severidad) },
      { key: 'fecha', label: 'Fecha', sortable: true, render: (r) => fmtDate(r.fecha) },
      { key: 'id', label: 'ID', sortable: true, render: (r) => h('span', { class: 'num' }, String(r.trabajador)) },
      { key: 'nombre', label: 'Colaborador', sortable: nombres, render: (r) => r.nombre },
      { key: 'depto', label: 'Departamento', sortable: true },
      { key: 'motivo', label: 'Motivo', render: (r) => h('div', {}, ...r.tipos.map((k) => h('div', { class: 'motive' }, h('strong', {}, `${labels[k]}: `), r.motivos[k]))) },
      { key: 'revision', label: 'Gestión', sortable: true, render: (r) => managementBadge(r.revision) },
      { key: 'acc', label: '', render: (r) => h('button', { class: 'btn btn--sm', type: 'button', onclick: (e) => { e.stopPropagation(); open(r); } }, 'Registros originales') },
    ],
    load: (p) => get('incidencias', { ...params, tipo, ...p }),
    empty: 'No hay incidencias con estos filtros.',
  });

  const defs = h('details', { class: 'card', style: { marginBottom: '12px' } },
    h('summary', { class: 'card__title', style: { cursor: 'pointer' } }, 'Cómo se detecta cada incidencia y qué severidad se propone (por validar con PATE)'),
    h('div', { class: 'plist', style: { marginTop: '12px' } }, ...meta.incidencias.map((t) => h('div', { class: 'prow' },
      h('div', { class: 'prow__top' }, h('strong', {}, t.label), h('span', {}, severityBadge(t.severidad), ' ', badge(t.estado))),
      h('p', {}, t.regla), h('p', {}, `Por validar: ${t.por_validar}`)))));

  host.append(pills, h('p', { class: 'muted', style: { marginBottom: '8px', fontSize: '12.5px' } },
    h('span', {}, icon('info', 'icon--sm'), ' La severidad es una propuesta. “Revisada por una persona” indica que alguien la marcó en esta herramienta; todavía no se registra quién.')),
  table.el, h('div', { style: { height: '12px' } }), defs);
}
