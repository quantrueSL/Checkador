/**
 * Horas extra · ranking de colaboradores con horas extra (de mayor a menor), filtrable por departamento.
 * El servidor entrega todos los departamentos del periodo; el filtro por departamento se aplica aquí, en el navegador.
 */
import { h, fmtInt, fmtPct, fmtDate } from '../util.js';
import { icon } from '../icons.js';
import { get, STATIC } from '../api.js';
import { getState, setState, filterParams } from '../state.js';
import { pageHead } from '../components/layout.js';
import { kpiCard } from '../components/kpiCard.js';
import { dataTable } from '../components/dataTable.js';
import { attachTip } from '../components/tooltip.js';

const TOP_N = 10;
const num1 = (n) => (Math.round(n * 10) / 10).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
const hh = (n) => `${num1(n)} h`;
const SORT = { puesto: 'extra', trabajador: 'trabajador', depto: 'depto', extra: 'extra', dobles: 'dobles', triples: 'triples',
  dias_extra: 'dias_extra', max_dia: 'max_dia', pct_extra: 'pct_extra' };

export async function render(host, ctx) {
  const st = getState();
  const d = await get('horas_extra', { ...filterParams(), trabajador: '', depto: '', comida: st.comida });
  const as = d.supuestos;
  const sel = d.departamentos.some((p) => p.depto === st.depto) ? st.depto : '';

  const all = d.rows;                                   // ya viene de mayor a menor
  const rows = sel ? all.filter((r) => r.depto === sel) : all;
  const rank = new Map(rows.map((r, i) => [r.trabajador, i + 1]));
  const horasBase = sel ? (d.departamentos.find((p) => p.depto === sel) || { horas: 0 }).horas : d.departamentos.reduce((a, p) => a + p.horas, 0);
  const depsSel = sel ? d.departamentos.filter((p) => p.depto === sel) : d.departamentos;   // totales exactos por departamento
  const total = depsSel.reduce((a, p) => a + p.extras, 0);
  const dobles = depsSel.reduce((a, p) => a + p.dobles, 0), triples = depsSel.reduce((a, p) => a + p.triples, 0);
  const top = rows.slice(0, TOP_N).reduce((a, r) => a + r.extra, 0);
  const universo = sel ? (d.departamentos.find((p) => p.depto === sel) || { colaboradores: 0 }).colaboradores : d.colaboradores;
  const max = Math.max(1, ...rows.map((r) => r.extra));

  host.replaceChildren(pageHead({
    title: 'Horas extra',
    subtitle: `Quién hace horas extra, del ${fmtDate(d.periodo.desde)} al ${fmtDate(d.periodo.hasta)} · de mayor a menor · solo terminales de asistencia`,
  }));

  // --- filtro por departamento ---
  const select = h('select', { class: 'select', 'aria-label': 'Departamento', value: sel, onchange: (e) => setState({ depto: e.target.value }) },
    h('option', { value: '' }, 'Todos los departamentos'),
    ...[...d.departamentos].sort((a, b) => b.extras - a.extras).map((p) => h('option', { value: p.depto }, p.depto)));
  host.append(h('div', { class: 'xtoolbar' },
    h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Departamento'), select),
    sel ? h('button', { class: 'linkbtn', type: 'button', onclick: () => setState({ depto: '' }) }, 'Ver todos') : null,
    h('span', { class: 'muted' }, `${fmtInt(rows.length)} de ${fmtInt(universo)} colaboradores con jornadas calculables han hecho horas extra`)));

  if (!all.length) {
    host.append(h('div', { class: 'card' }, h('div', { class: 'table-state' }, 'Sin horas extra en el periodo.')));
    return;
  }

  // --- indicadores ---
  host.append(h('section', { class: 'grid', 'aria-label': 'Indicadores de horas extra' },
    h('div', { class: 'col-3 tone tone--navy' }, kpiCard({ label: 'Colaboradores con horas extra', value: rows.length,
      foot: [universo ? `${fmtPct(rows.length / universo * 100)} de ${fmtInt(universo)} colaboradores` : ''].filter(Boolean),
      info: 'Personas con al menos una jornada (con entrada y salida) por encima de la jornada ordinaria.' })),
    h('div', { class: 'col-3 tone tone--teal' }, kpiCard({ label: 'Horas extra', value: Math.round(total), unit: 'h',
      foot: [`${fmtInt(Math.round(dobles))} h dobles · ${fmtInt(Math.round(triples))} h triples`], info: `Dobles hasta ${as.tope_doble_semana_h} h por colaborador y semana; el resto, triples (referencia de la LFT, pendiente de validar con PATE).` })),
    h('div', { class: 'col-3 tone tone--warn' }, kpiCard({ label: 'Peso sobre las horas trabajadas', value: horasBase ? Math.round(total / horasBase * 1000) / 10 : null, unit: '%',
      foot: [`${fmtInt(horasBase)} h trabajadas en total`] })),
    h('div', { class: 'col-3 tone tone--navy' }, kpiCard({ label: `Concentración: top ${Math.min(TOP_N, rows.length)}`, value: total ? Math.round(top / total * 1000) / 10 : null, unit: '%',
      foot: [`de las horas extra las hacen ${Math.min(TOP_N, rows.length)} personas`], info: 'Cuanto más alto, más concentradas están las horas extra en pocas personas.' }))));

  // --- por departamento ---
  const deps = d.departamentos.filter((p) => p.extras > 0).sort((a, b) => b.extras - a.extras);
  const dmax = Math.max(1, ...deps.map((p) => p.extras));
  const barsHost = h('div', { class: 'hbars hbars--wide' }, ...deps.map((p) => {
    const b = h('button', { class: 'hbar', type: 'button', 'aria-pressed': String(sel === p.depto), onclick: () => setState({ depto: sel === p.depto ? '' : p.depto }) },
      h('span', { class: 'hbar__name' }, p.depto),
      h('span', { class: 'hbar__track' }, h('span', { class: 'xstack', style: { width: `${p.extras / dmax * 100}%` } },
        h('span', { class: 'xbar__d', style: { width: `${p.dobles / p.extras * 100}%` } }), h('span', { class: 'xbar__t', style: { width: `${p.triples / p.extras * 100}%` } }))),
      h('span', { class: 'hbar__val num' }, hh(p.extras)));
    attachTip(b, () => [h('strong', {}, p.depto), `${hh(p.extras)} extra · ${fmtInt(p.con_extra)} de ${fmtInt(p.colaboradores)} colaboradores`,
      h('span', { style: { display: 'block' } }, `${hh(p.dobles)} dobles · ${hh(p.triples)} triples (${fmtPct(p.triples / p.extras * 100)} triples)`),
      h('span', { style: { display: 'block' } }, p.horas ? `${fmtPct(p.extras / p.horas * 100)} de sus ${fmtInt(p.horas)} h trabajadas` : ''),
      h('span', { style: { display: 'block' } }, sel === p.depto ? 'Clic para quitar el filtro' : 'Clic para filtrar por este departamento')]);
    return b;
  }));
  // --- podio: los 5 mayores ---
  const podium = rows.slice(0, 5);
  const podiumHost = h('ol', { class: 'podium' }, ...podium.map((r, i) => h('li', {},
    h('span', { class: 'podium__n num' }, String(i + 1)),
    h('span', { class: 'podium__who' }, h('strong', {}, r.nombre), h('small', {}, ` ID ${r.trabajador} · ${r.depto}`)),
    h('span', { class: 'podium__val num' }, hh(r.extra)))));
  host.append(h('section', { class: 'grid' },
    h('div', { class: 'card col-7' },
      h('div', { class: 'card__head' }, h('div', {}, h('h2', { class: 'card__title' }, 'Dobles y triples por departamento'),
        h('p', { class: 'card__sub' }, 'De mayor a menor. Las triples se pagan más caras. Clic en una barra para filtrar el listado por ese departamento.'))),
      h('div', { class: 'legend' }, h('span', {}, h('i', { class: 'l-ord' }), 'Dobles'), h('span', {}, h('i', { class: 'l-extra' }), 'Triples')),
      deps.length ? barsHost : h('div', { class: 'table-state' }, 'Sin horas extra.')),
    h('div', { class: 'card col-5' },
      h('div', { class: 'card__head' }, h('div', {}, h('h2', { class: 'card__title' }, 'Quién más horas extra acumula'),
        h('p', { class: 'card__sub' }, sel ? `Los 5 primeros de ${sel}.` : 'Los 5 primeros de toda la plantilla.'))),
      podiumHost)));

  // --- listado completo ---
  const table = dataTable({
    searchPlaceholder: st.nombres ? 'Buscar por ID o nombre…' : 'Buscar por ID…',
    sort: { key: 'extra', dir: 'desc' },
    pageSizes: [10, 25, 50, 100],
    onRowClick: STATIC ? undefined : (r) => ctx.navigate(`colaborador/${r.trabajador}`),
    columns: [
      { key: 'puesto', label: '#', sortable: true, render: (r) => h('span', { class: 'muted num' }, String(rank.get(r.trabajador))) },
      { key: 'trabajador', label: 'Colaborador', sortable: true, render: (r) => h('span', { style: { whiteSpace: 'nowrap' } }, h('span', { class: 'num' }, `${r.trabajador} `), r.nombre) },
      { key: 'depto', label: 'Departamento', sortable: true },
      { key: 'barra', label: 'Dobles y triples', render: (r) => {
        const bar = h('span', { class: 'xbar', 'aria-hidden': 'true' },
          h('span', { class: 'xbar__d', style: { width: `${r.dobles / max * 100}%` } }), h('span', { class: 'xbar__t', style: { width: `${r.triples / max * 100}%` } }));
        attachTip(bar, () => [h('strong', {}, r.nombre), `${hh(r.dobles)} dobles · ${hh(r.triples)} triples`]);
        return bar;
      } },
      { key: 'extra', label: 'Horas extra', sortable: true, align: 'right', render: (r) => h('strong', {}, hh(r.extra)) },
      { key: 'dobles', label: 'Dobles', sortable: true, align: 'right', render: (r) => hh(r.dobles) },
      { key: 'triples', label: 'Triples', sortable: true, align: 'right', render: (r) => hh(r.triples) },
      { key: 'dias_extra', label: 'Días extra', sortable: true, align: 'right', render: (r) => `${r.dias_extra} de ${r.dias}` },
      { key: 'max_dia', label: 'Máx. día', sortable: true, align: 'right', render: (r) => hh(r.max_dia) },
      { key: 'pct_extra', label: '% s/ horas', sortable: true, align: 'right', render: (r) => fmtPct(r.pct_extra) },
    ],
    load: async (p) => {
      const q = String(p.q || '').trim().toUpperCase();
      let list = q ? rows.filter((r) => String(r.trabajador).includes(q) || (st.nombres && r.nombre.toUpperCase().includes(q))) : [...rows];
      const key = SORT[p.sort] || 'extra', sign = p.dir === 'asc' ? 1 : -1;
      list.sort((a, b) => ((a[key] ?? -1) < (b[key] ?? -1) ? -1 : (a[key] ?? -1) > (b[key] ?? -1) ? 1 : 0) * sign);
      return { rows: list.slice((p.page - 1) * p.pageSize, p.page * p.pageSize), total: list.length };
    },
    empty: 'Ningún colaborador coincide con la búsqueda.',
  });
  host.append(h('div', { class: 'card' },
    h('div', { class: 'card__head' }, h('div', {}, h('h2', { class: 'card__title' }, 'Listado de colaboradores con horas extra'),
      h('p', { class: 'card__sub' }, STATIC ? 'Ordena por cualquier columna.' : 'Ordena por cualquier columna. Clic en una fila para ver la ficha del colaborador.'))),
    table.el));

  host.append(h('div', { class: 'assume' }, icon('info', 'icon--sm'), h('strong', {}, 'Cómo se cuentan:'),
    h('span', {}, `horas por encima de una jornada de ${as.jornada_h} h (con ${as.comida_h} h de comida descontada)`),
    h('span', {}, `dobles hasta ${as.tope_doble_semana_h} h por semana y colaborador, triples el resto`),
    h('span', {}, 'solo jornadas con entrada y salida · supuestos de demo, pendientes de validar con PATE')));
}
