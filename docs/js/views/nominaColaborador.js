import { h, fmtInt, fmtDate, fmtMoney } from '../util.js';
import { icon } from '../icons.js';
import { get } from '../api.js';
import { getState } from '../state.js';
import { pageHead } from '../components/layout.js';
import { badge } from '../components/badge.js';
import { dataTable } from '../components/dataTable.js';
import { kpiCard } from '../components/kpiCard.js';
import { openDrawer } from '../components/drawer.js';

const STATE_BADGE = { cuadra: 'ok', verificar: 'pendiente', diferencia: 'incidencia' };
const periodLabel = (p) => `${fmtDate(p.desde)} – ${fmtDate(p.hasta)}`;
const money = (n) => fmtMoney(n, true);

/** Diferencia de importe: positivo = pagado de más, negativo = pagado de menos. */
const diffCell = (n) => (Math.abs(n) < 0.005
  ? h('span', { class: 'muted' }, '—')
  : h('strong', { style: { color: n > 0 ? 'var(--warn)' : 'var(--navy-800)', whiteSpace: 'nowrap' } }, money(n)));

async function openDetail(id, nombres) {
  const dr = openDrawer({ title: 'Cálculo de la conciliación', subtitle: 'Nómina simulada frente a los fichajes de IBIX' });
  dr.body.append(h('div', { class: 'loading' }, 'Cargando…'));
  try {
    const d = await get('nomina/detalle', { id, nombres: nombres ? 1 : '' });
    const n = d.nomina;
    const fmtV = (c, v) => (c.unidad === '$' ? fmtMoney(v) : `${fmtInt(Math.round(v * 100) / 100)}${c.unidad && c.unidad !== '$' ? ` ${c.unidad}` : ''}`);
    dr.body.replaceChildren(...[
      h('div', { class: 'banner banner--warn' }, icon('info', 'icon--sm'), h('span', {}, 'Nómina simulada para la demo. No es un recibo real de PATE.')),
      h('dl', { class: 'dl' },
        h('dt', {}, 'Colaborador'), h('dd', {}, `${n.nombre} (ID ${n.trabajador})`),
        h('dt', {}, 'Departamento'), h('dd', {}, n.depto),
        h('dt', {}, 'Periodo'), h('dd', {}, periodLabel(n)),
        h('dt', {}, 'Entrada supuesta'), h('dd', {}, `${n.entrada_habitual} (habitual del colaborador)`),
        h('dt', {}, 'Tarifa por hora'), h('dd', {}, fmtMoney(n.tarifa_hora)),
        h('dt', {}, 'Resultado'), h('dd', {}, badge(STATE_BADGE[n.estado], n.estado_label))),
      h('div', {}, h('h3', { class: 'card__title', style: { marginBottom: '8px' } }, 'Nómina frente a fichajes'),
        h('table', { class: 'table' },
          h('thead', {}, h('tr', {}, ...['Concepto', 'Nómina', 'Según fichajes', 'Diferencia'].map((t, i) => h('th', { class: i > 0 ? 'r' : '' }, t)))),
          h('tbody', {}, ...d.conceptos.map((c) => h('tr', {},
            h('td', {}, c.label), h('td', { class: 'r num' }, fmtV(c, c.nomina)), h('td', { class: 'r num' }, fmtV(c, c.fichajes)),
            h('td', { class: 'r num' }, c.ok && !c.diferencia ? h('span', { class: 'muted' }, 'Coincide')
              : h('strong', { style: { color: c.ok ? 'inherit' : 'var(--warn)' } }, (c.diferencia > 0 ? '+' : '') + fmtV(c, c.diferencia)))))),
          h('tfoot', {}, h('tr', {}, h('td', {}, h('strong', {}, 'Neto')), h('td', { class: 'r num' }, fmtMoney(n.neto)),
            h('td', { class: 'r num' }, fmtMoney(n.neto_esperado)), h('td', { class: 'r num' }, diffCell(n.diferencia_importe)))))),
      n.sin_salida ? h('div', { class: 'note-box' }, `${n.sin_salida} jornada(s) con un solo fichaje: no se pueden calcular sus horas. La simulación las paga completas y quedan a verificar.`) : null,
      h('div', {}, h('h3', { class: 'card__title', style: { marginBottom: '8px' } }, 'Jornada por jornada'),
        h('table', { class: 'table' },
          h('thead', {}, h('tr', {}, ...['Fecha', 'Fichajes', 'Horas netas', 'Entrada'].map((t, i) => h('th', { class: i === 2 ? 'r' : '' }, t)))),
          h('tbody', {}, ...d.dias.map((x) => h('tr', {},
            h('td', {}, fmtDate(x.fecha)),
            h('td', { class: 'mono' }, x.horas.map((t) => t.slice(0, 5)).join(' ')),
            h('td', { class: 'r num' }, x.computable ? `${x.neto_h.toLocaleString('es-MX', { maximumFractionDigits: 1 })} h` : badge('pendiente', 'Sin salida')),
            h('td', {}, !x.computable ? '—' : (x.retardo ? badge('incidencia', `Retardo · ${x.retardo_min} min`) : badge('ok', 'A tiempo')))))))),
      h('details', { class: 'note-box' }, h('summary', { style: { cursor: 'pointer', fontWeight: '600' } }, 'Supuestos de la simulación'),
        h('ul', { style: { margin: '8px 0 0', paddingLeft: '18px' } }, ...d.supuestos.map((t) => h('li', {}, t))))].filter(Boolean));
  } catch (e) {
    dr.body.replaceChildren(h('div', { class: 'error' }, e.message));
  }
}

export async function render(host) {
  const { nombres } = getState();
  const first = await get('nomina/conciliacion', { pageSize: 1 });
  const head = pageHead({ title: 'Nómina y conciliación', subtitle: 'Cruce de la nómina con las horas fichadas, los retardos y los bonos de cada colaborador · haz clic en una fila para ver el cálculo' });

  if (!first.hay_datos) {
    host.replaceChildren(head, h('div', { class: 'card' }, h('div', { class: 'table-state' },
      'Todavía no hay nóminas simuladas. Ejecuta “python run.py nominas” para generarlas.')));
    return;
  }

  let periodo = '';
  const kpiHost = h('section', { class: 'grid', 'aria-label': 'Resultado de la conciliación' });
  const impactHost = h('section', { class: 'grid', 'aria-label': 'Impacto económico de las diferencias' });
  const paintImpact = (k) => {
    const max = Math.max(1, ...k.impacto_conceptos.map((x) => Math.abs(x.importe)));
    const rows = k.impacto_conceptos.map((x) => {
      const w = `${(Math.abs(x.importe) / max) * 50}%`;
      return h('div', { class: 'impact' }, h('span', {}, x.label),
        h('span', { class: 'impact__track' }, h('span', { class: 'impact__zero', style: { left: '50%' } }),
          Math.abs(x.importe) < 0.005 ? null : h('span', { class: `impact__fill${x.importe < 0 ? ' impact__fill--neg' : ''}`,
            style: x.importe < 0 ? { right: '50%', width: w } : { left: '50%', width: w } })),
        h('strong', { class: 'num', style: { textAlign: 'right' } }, fmtMoney(x.importe, true)));
    });
    const deps = k.impacto_deptos.filter((x) => x.de_mas + x.de_menos >= 0.005).slice(0, 6);
    impactHost.replaceChildren(
      h('div', { class: 'card col-6' },
        h('div', { class: 'card__head' }, h('div', {}, h('h2', { class: 'card__title' }, 'Impacto por concepto'),
          h('p', { class: 'card__sub' }, 'Suma de las diferencias entre lo pagado y lo esperado según fichajes. A la derecha, pagado de más; a la izquierda, de menos.'))),
        ...rows),
      h('div', { class: 'card col-6' },
        h('div', { class: 'card__head' }, h('div', {}, h('h2', { class: 'card__title' }, 'Impacto por departamento'),
          h('p', { class: 'card__sub' }, 'Los seis con mayor diferencia acumulada.'))),
        deps.length ? h('table', { class: 'table' },
          h('thead', {}, h('tr', {}, ...['Departamento', 'Nóminas', 'Con diferencia', 'De más', 'De menos'].map((t, i) => h('th', { class: i ? 'r' : '' }, t)))),
          h('tbody', {}, ...deps.map((x) => h('tr', {}, h('td', {}, x.depto), h('td', { class: 'r num' }, fmtInt(x.nominas)),
            h('td', { class: 'r num' }, fmtInt(x.con_diferencia)), h('td', { class: 'r num' }, fmtMoney(x.de_mas)), h('td', { class: 'r num' }, fmtMoney(x.de_menos))))))
          : h('div', { class: 'table-state' }, 'Sin diferencias en este periodo.')));
  };
  const paintKpis = async () => {
    const r = await get('nomina/conciliacion', { periodo, pageSize: 1 });
    const k = r.kpis;
    paintImpact(k);
    kpiHost.replaceChildren(
      h('div', { class: 'col-3' }, kpiCard({ label: 'Nóminas revisadas', value: k.nominas, foot: periodo === '' ? `${first.periodos.length} periodos` : periodLabel(first.periodos[Number(periodo)]),
        info: 'Una nómina es un colaborador en un periodo. La muestra tiene 40 colaboradores.' })),
      h('div', { class: 'col-3' }, kpiCard({ label: 'Cuadran con los fichajes', value: k.cuadra + k.verificar,
        foot: [`${fmtInt(k.cuadra)} sin ninguna reserva`, `${fmtInt(k.verificar)} con jornadas a verificar`],
        info: '“A verificar”: hay jornadas con un solo fichaje, cuyas horas no se pueden calcular. El resto de conceptos coincide.' })),
      h('div', { class: 'col-3' }, kpiCard({ label: 'Con diferencias', value: k.diferencia,
        foot: [`${fmtInt(k.colaboradores_con_diferencia)} colaboradores afectados`, 'horas, retardos, bono o días'],
        info: 'Alguno de los conceptos de la nómina no coincide con lo que indican los fichajes. Son casos para revisar, no errores confirmados.' })),
      h('div', { class: 'col-3' }, kpiCard({ label: 'Pagado de más (MXN)', value: Math.round(k.pagado_de_mas),
        foot: [`Pagado de menos: ${fmtMoney(k.pagado_de_menos)}`], info: 'Suma de las diferencias de neto entre la nómina y lo esperado según los fichajes.' })));
  };

  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Periodo de nómina' });
  const paintSeg = () => seg.replaceChildren(
    ...[['', 'Todos los periodos'], ...first.periodos.map((p, i) => [String(i), periodLabel(p)])].map(([v, label]) =>
      h('button', { type: 'button', 'aria-pressed': String(periodo === v), onclick: () => { periodo = v; paintSeg(); paintKpis(); table.reload(); } }, label)));

  const table = dataTable({
    searchPlaceholder: nombres ? 'Buscar por ID o nombre…' : 'Buscar por ID…',
    sort: { key: 'diferencia', dir: 'desc' },
    filters: [{ key: 'estado', label: 'Resultado', options: [{ value: '', label: 'Todos' },
      ...Object.entries(first.estados).map(([value, label]) => ({ value, label }))] }],
    onRowClick: (r) => openDetail(r.id, nombres),
    columns: [
      { key: 'estado', label: 'Resultado', sortable: true, render: (r) => badge(STATE_BADGE[r.estado], r.estado_label) },
      { key: 'periodo', label: 'Periodo', sortable: true, render: (r) => h('span', { style: { whiteSpace: 'nowrap' } }, `${fmtDate(r.desde).slice(0, 5)} – ${fmtDate(r.hasta).slice(0, 5)}`) },
      { key: 'trabajador', label: 'ID', sortable: true, render: (r) => h('span', { class: 'num' }, String(r.trabajador)) },
      { key: 'nombre', label: 'Colaborador', render: (r) => r.nombre },
      { key: 'depto', label: 'Departamento', sortable: true },
      { key: 'neto', label: 'Neto pagado', sortable: true, align: 'right', render: (r) => fmtMoney(r.neto) },
      { key: 'esperado', label: 'Neto esperado', align: 'right', render: (r) => fmtMoney(r.neto_esperado) },
      { key: 'diferencia', label: 'Diferencia', sortable: true, align: 'right', render: (r) => diffCell(r.diferencia_importe) },
      { key: 'que', label: 'Qué difiere', render: (r) => (r.discrepancias.length
        ? h('div', {}, ...r.discrepancias.map((t) => h('span', { class: 'tag' }, t)))
        : (r.sin_salida ? h('span', { class: 'muted' }, `${r.sin_salida} jornada(s) sin salida`) : h('span', { class: 'muted' }, '—'))) },
    ],
    load: (p) => get('nomina/conciliacion', { ...p, periodo }),
    empty: 'No hay nóminas con estos filtros.',
  });

  // Fuente real (fase 2): se conserva el estado de la conexión a MongoDB, sin cifras.
  const real = h('div', { class: 'card', style: { marginTop: '12px' } });
  const paintReal = (e) => real.replaceChildren(
    h('div', { class: 'card__head' }, h('div', {}, h('h2', { class: 'card__title' }, 'Fuente real de nómina (fase 2)'),
      h('p', { class: 'card__sub' }, 'Base MongoDB con los recibos timbrados (CFDI, comprobante fiscal digital) de PATE.')), badge('pendiente', 'Sin conectar')),
    h('p', { style: { margin: '8px 0 12px' } }, e.motivo),
    h('ul', { class: 'check' }, ...e.requisitos.map((r) => h('li', {},
      h('span', { class: `mark ${r.ok ? 'mark--ok' : 'mark--no'}` }, r.ok ? icon('check', 'icon--sm') : null), h('span', {}, r.label)))),
    h('div', { style: { marginTop: '12px' } }, h('button', { class: 'btn', type: 'button',
      onclick: async (ev) => { ev.currentTarget.disabled = true; try { paintReal(await get('nomina/estado')); } finally { ev.currentTarget.disabled = false; } } },
    icon('refresh', 'icon--sm'), 'Comprobar configuración')));
  paintReal(await get('nomina/estado'));

  const note = h('div', { class: 'banner banner--warn', role: 'note' }, icon('info', 'icon--sm'),
    h('span', {}, h('strong', {}, 'Datos simulados para la demostración. '), 'Las nóminas, tarifas y periodos son inventados; los fichajes sí son los reales de IBIX desde el 21/09. ',
      h('button', { class: 'linkbtn', type: 'button', onclick: () => {
        const dr = openDrawer({ title: 'Supuestos de la simulación', subtitle: 'Pendientes de validar con PATE' });
        dr.body.append(h('ul', { class: 'check' }, ...first.supuestos.map((t) => h('li', {}, h('span', { class: 'mark mark--no' }), h('span', {}, t)))));
      } }, 'Ver supuestos')));

  host.replaceChildren(head, note, h('div', { style: { marginBottom: '12px' } }, seg), kpiHost,
    h('div', { style: { height: '12px' } }), impactHost, h('div', { style: { height: '12px' } }),
    h('h2', { class: 'card__title', style: { margin: '4px 0 8px' } }, 'Detalle por colaborador'), table.el, real);
  paintSeg();
  await paintKpis();
}
