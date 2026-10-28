import { h, fmtInt, fmtDate } from '../util.js';
import { get } from '../api.js';
import { getState, filterParams } from '../state.js';
import { pageHead } from '../components/layout.js';
import { kpiCard } from '../components/kpiCard.js';
import { calendar } from '../components/charts.js';
import { badge, typeTags, times } from '../components/badge.js';
import { dataTable } from '../components/dataTable.js';
import { openJornada } from '../components/jornadaDrawer.js';

export async function render(host, ctx) {
  const id = Number(ctx.route.id);
  const { desde, hasta, nombres } = filterParams();
  const d = await get(`colaboradores/${id}`, { desde, hasta, nombres });
  const { meta } = getState();
  const k = d.kpis;

  host.replaceChildren(pageHead({
    back: { href: '#/resumen', label: 'Resumen ejecutivo' },
    title: `${d.colaborador.nombre}`,
    subtitle: `ID ${id} · ${d.colaborador.depto} · ${fmtDate(desde)} – ${fmtDate(hasta)}`,
  }));

  host.append(h('section', { class: 'grid' },
    h('div', { class: 'col-4 kpi-stack' },
      kpiCard({ label: 'Fichajes de asistencia', value: k.fichajes }),
      kpiCard({ label: 'Días con fichajes', value: k.dias }),
      kpiCard({ label: 'Jornadas con incidencia', value: k.incidencias }),
      kpiCard({ label: 'Comedor excluido', value: k.comedor_excluidos, foot: 'Terminales 3 y 4' })),
    h('div', { class: 'card col-8' },
      h('div', { class: 'card__head' }, h('div', {}, h('h2', { class: 'card__title' }, 'Calendario de jornadas'),
        h('p', { class: 'card__sub' }, 'Cada celda es un día. Pasa el cursor para ver las horas de fichaje.'))),
      calendar({ days: d.dias, desde, hasta, gaps: d.huecos }))));

  const table = dataTable({
    sort: { key: 'fecha', dir: 'desc' },
    filters: [{ key: 'estado', label: 'Estado', value: '', options: [
      { value: '', label: 'Todos' }, { value: 'ok', label: 'Sin incidencias' }, { value: 'incidencia', label: 'Incidencia' }] }],
    onRowClick: (r) => openJornada({ trabajador: r.trabajador, fecha: r.fecha }),
    columns: [
      { key: 'fecha', label: 'Fecha', sortable: true, render: (r) => fmtDate(r.fecha) },
      { key: 'n', label: 'Fichajes', sortable: true, align: 'right' },
      { key: 'horas', label: 'Horas', render: (r) => times(r.horas) },
      { key: 'terminales', label: 'Terminal', render: (r) => r.terminales.join(', ') },
      { key: 'tipos', label: 'Observaciones', render: (r) => typeTags(r.tipos, meta) },
      { key: 'estado', label: 'Estado', sortable: true, render: (r) => badge(r.estado) },
    ],
    load: (p) => get('jornadas', { desde, hasta, trabajador: id, nombres, ...p }),
  });
  host.append(h('section', {}, h('div', { class: 'card__head', style: { marginBottom: '10px' } }, h('h2', { class: 'card__title' }, 'Jornadas')), table.el));
}
