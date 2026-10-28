/**
 * Horas extra sin pagar · casos concretos: nóminas simuladas en las que las horas extra que indican los fichajes
 * no se pagaron (total o parcialmente), con el detalle día a día de cada caso.
 */
import { h, fmtInt, fmtDate, fmtShort, fmtMoney, monthName } from '../util.js';
import { icon } from '../icons.js';
import { get } from '../api.js';
import { getState } from '../state.js';
import { pageHead } from '../components/layout.js';
import { badge } from '../components/badge.js';
import { dataTable } from '../components/dataTable.js';
import { kpiCard } from '../components/kpiCard.js';
import { openDrawer } from '../components/drawer.js';
import { simNotice } from '../components/simNotice.js';

const hh = (n) => `${(Math.round(n * 10) / 10).toLocaleString('es-MX')} h`;
const MOTIVO_KIND = { sin_pagar: 'incidencia', parcial: 'pendiente', triples: 'neutral' };

async function openCase(id, nombres) {
  const dr = openDrawer({ title: 'Caso de horas extra sin pagar', subtitle: 'Nómina simulada frente a los fichajes de IBIX' });
  dr.body.append(h('div', { class: 'loading' }, 'Cargando…'));
  try {
    const d = await get('nomina/detalle', { id, nombres: nombres ? 1 : '' });
    const n = d.nomina;
    const con = Object.fromEntries(d.conceptos.map((c) => [c.key, c]));
    const dob = con.horas_extra, tri = con.horas_triples;
    const esperadas = dob.fichajes + tri.fichajes, pagadas = dob.nomina + tri.nomina;
    const dias = d.dias.filter((x) => x.computable && x.extra_h > 0);
    const hhmm = (t) => t.slice(0, 5);
    const frase = (x) => `El ${fmtDate(x.fecha)} fichó de ${hhmm(x.horas[0])} a ${hhmm(x.horas.at(-1))}: ${hh(x.neto_h)} netas, ${hh(x.extra_h)} por encima de la jornada de 8 h.`;

    dr.body.replaceChildren(...[
      h('div', { class: 'banner banner--warn' }, icon('info', 'icon--sm'), h('span', {}, 'Nómina simulada para la demo. No es un recibo real de PATE.')),
      h('dl', { class: 'dl' },
        h('dt', {}, 'Colaborador'), h('dd', {}, `${n.nombre} (ID ${n.trabajador})`),
        h('dt', {}, 'Departamento'), h('dd', {}, n.depto),
        h('dt', {}, 'Periodo'), h('dd', {}, `${fmtDate(n.desde)} – ${fmtDate(n.hasta)}`),
        h('dt', {}, 'Tarifa por hora'), h('dd', {}, fmtMoney(n.tarifa_hora))),
      h('div', { class: 'note-box' }, h('strong', {}, 'Qué pasó: '),
        pagadas < 0.05 ? `Los fichajes indican ${hh(esperadas)} de horas extra y la nómina no paga ninguna.`
          : `Los fichajes indican ${hh(esperadas)} de horas extra y la nómina paga ${hh(pagadas)}.`),
      h('div', {}, h('h3', { class: 'card__title', style: { marginBottom: '8px' } }, 'Horas extra: nómina frente a fichajes'),
        h('table', { class: 'table' },
          h('thead', {}, h('tr', {}, ...['Tipo', 'Nómina', 'Fichajes', 'Dif.'].map((t, i) => h('th', { class: i ? 'r' : '' }, t)))),
          h('tbody', {}, ...[['Dobles', dob], ['Triples', tri]].map(([lbl, c]) => h('tr', {},
            h('td', {}, lbl), h('td', { class: 'r num' }, hh(c.nomina)), h('td', { class: 'r num' }, hh(c.fichajes)),
            h('td', { class: 'r num' }, Math.abs(c.diferencia) < 0.05 ? h('span', { class: 'muted' }, '—') : h('strong', { style: { color: c.diferencia < 0 ? 'var(--navy-800)' : 'var(--warn)' } }, `${c.diferencia > 0 ? '+' : '−'}${hh(Math.abs(c.diferencia))}`))))),
          h('tfoot', {}, h('tr', {}, h('td', {}, h('strong', {}, 'Importe de la diferencia')), h('td', {}), h('td', {}),
            h('td', { class: 'r num' }, h('strong', {}, fmtMoney((dob.diferencia * 2 + tri.diferencia * 3) * n.tarifa_hora, true))))))),
      h('div', {}, h('h3', { class: 'card__title', style: { marginBottom: '4px' } }, `Días con horas extra (${dias.length})`),
        h('p', { class: 'muted', style: { marginBottom: '8px' } }, 'Jornadas en las que los fichajes superan las 8 h. El tope de horas dobles es de 9 h por semana; lo que pasa de ahí se cuenta como triple.'),
        h('table', { class: 'table' },
          h('thead', {}, h('tr', {}, ...['Fecha', 'Fichajes', 'Netas', 'Extra', 'Tipo'].map((t, i) => h('th', { class: i === 2 || i === 3 ? 'r' : '' }, t)))),
          h('tbody', {}, ...dias.map((x) => h('tr', { title: frase(x) },
            h('td', {}, fmtDate(x.fecha)), h('td', { class: 'mono', style: { whiteSpace: 'nowrap' } }, `${hhmm(x.horas[0])}–${hhmm(x.horas.at(-1))}`),
            h('td', { class: 'r num' }, hh(x.neto_h)), h('td', { class: 'r num' }, h('strong', {}, hh(x.extra_h))),
            h('td', {}, x.extra_triples > 0 && x.extra_dobles > 0 ? 'Doble y triple' : x.extra_triples > 0 ? 'Triple' : 'Doble')))))),
      dias[0] ? h('div', { class: 'note-box' }, h('strong', {}, 'Ejemplo: '), frase(dias.reduce((a, b) => (b.extra_h > a.extra_h ? b : a)))) : null,
    ].filter(Boolean));
  } catch (e) {
    dr.body.replaceChildren(h('div', { class: 'error' }, e.message));
  }
}

export async function render(host) {
  const { nombres } = getState();
  const first = await get('nomina/casos', { pageSize: 1 });
  const head = pageHead({ title: 'Horas extra sin pagar', subtitle: 'Casos concretos en los que las horas extra que indican los fichajes no se pagaron en la nómina' });
  if (!first.hay_datos) {
    host.replaceChildren(head, h('div', { class: 'card' }, h('div', { class: 'table-state' }, 'Todavía no hay nóminas simuladas. Ejecuta “python run.py nominas” para generarlas.')));
    return;
  }

  let mes = '';
  const monthLabel = (m) => `${monthName(m)}`;
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Mes' });
  const kpiHost = h('section', { class: 'grid', 'aria-label': 'Resumen de casos' });

  const paintKpis = async () => {
    const k = (await get('nomina/casos', { mes, pageSize: 1 })).kpis;
    kpiHost.replaceChildren(
      h('div', { class: 'col-3 tone tone--warn' }, kpiCard({ label: 'Casos con horas extra sin pagar', value: k.casos, foot: ['nóminas afectadas'],
        info: 'Nóminas en las que las horas extra de los fichajes no se pagaron del todo.' })),
      h('div', { class: 'col-3 tone tone--navy' }, kpiCard({ label: 'Colaboradores afectados', value: k.colaboradores, foot: ['con al menos un caso'] })),
      h('div', { class: 'col-3 tone tone--teal' }, kpiCard({ label: 'Horas extra sin pagar', value: Math.round(k.horas_sin_pagar), unit: 'h', foot: ['fichadas y no pagadas'] })),
      h('div', { class: 'col-3 tone tone--warn' }, kpiCard({ label: 'Importe sin pagar', value: Math.round(k.importe_sin_pagar), unit: 'MXN', foot: ['a tarifa doble o triple según corresponda'],
        info: 'Lo que debería haberse pagado por esas horas extra según los fichajes y no figura en la nómina.' })));
  };
  const paintSeg = () => seg.replaceChildren(
    ...[['', 'Todos los meses'], ...first.meses.map((m) => [m, monthLabel(m)])].map(([v, label]) =>
      h('button', { type: 'button', 'aria-pressed': String(mes === v), onclick: () => { mes = v; paintSeg(); paintKpis(); table.reload(); } }, label)));

  const table = dataTable({
    searchPlaceholder: nombres ? 'Buscar por ID o nombre…' : 'Buscar por ID…',
    sort: { key: 'importe', dir: 'desc' },
    filters: [
      { key: 'depto', label: 'Departamento', options: [{ value: '', label: 'Todos' }, ...first.deptos.map((x) => ({ value: x, label: x }))] },
      { key: 'motivo', label: 'Motivo', options: [{ value: '', label: 'Todos' }, ...Object.entries(first.motivos).map(([value, label]) => ({ value, label }))] },
    ],
    onRowClick: (r) => openCase(r.id, nombres),
    columns: [
      { key: 'depto', label: 'Departamento', sortable: true },
      { key: 'trabajador', label: 'Colaborador', sortable: true, render: (r) => h('span', {}, h('span', { class: 'num' }, `${r.trabajador} `), r.nombre) },
      { key: 'mes', label: 'Mes', sortable: true, render: (r) => `${monthName(r.mes)} (${fmtShort(r.desde)} – ${fmtShort(r.hasta)})` },
      { key: 'fichajes', label: 'Según fichajes', sortable: true, align: 'right', render: (r) => hh(r.horas_fichajes) },
      { key: 'pagadas', label: 'Pagadas', align: 'right', render: (r) => hh(r.horas_pagadas) },
      { key: 'horas', label: 'Sin pagar', sortable: true, align: 'right', render: (r) => h('strong', {}, hh(r.horas_sin_pagar)) },
      { key: 'importe', label: 'Importe sin pagar', sortable: true, align: 'right', render: (r) => h('strong', { style: { color: 'var(--warn)' } }, fmtMoney(r.importe_sin_pagar)) },
      { key: 'motivo', label: 'Qué pasó', render: (r) => badge(MOTIVO_KIND[r.motivo], r.motivo_label) },
    ],
    load: (p) => get('nomina/casos', { ...p, mes }),
    empty: 'No hay casos con estos filtros.',
  });

  const note = simNotice({ text: 'Las nóminas son inventadas; los fichajes son los reales de IBIX. Haz clic en un caso de la tabla para ver el detalle día a día.' });

  host.replaceChildren(head, note, h('div', { style: { marginBottom: '12px' } }, seg), kpiHost, h('div', { style: { height: '12px' } }), table.el);
  paintSeg();
  await paintKpis();
}
