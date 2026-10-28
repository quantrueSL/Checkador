import { h, fmtInt, fmtPct, fmtDate, fmtShort, fmtMoney, addDays, dow } from '../util.js';
import { icon } from '../icons.js';
import { get } from '../api.js';
import { getState, setState, filterParams, periodOptions } from '../state.js';
import { pageHead } from '../components/layout.js';
import { kpiCard } from '../components/kpiCard.js';
import { stackedBars } from '../components/charts.js';
import { attachTip } from '../components/tooltip.js';
import { badge } from '../components/badge.js';
import { openDrawer } from '../components/drawer.js';

const MIN_JORNADAS_PCT = 30;   // por debajo, un porcentaje por departamento no es representativo
const hh = (n) => `${fmtInt(n)} h`;

export async function render(host, ctx) {
  const st = getState();
  const { meta } = st;
  const [d, nom] = await Promise.all([get('resumen', { ...filterParams(), comida: st.comida }), get('nomina/extras')]);
  const k = d.kpis, ind = d.indicadores_supuestos, as = ind.supuestos;

  host.replaceChildren(pageHead({
    title: 'Resumen ejecutivo',
    subtitle: `Horas, horas extra y retardos del ${fmtDate(d.periodo.desde)} al ${fmtDate(d.periodo.hasta)} · solo terminales de asistencia`,
  }));

  // --- filtros activos ---
  const chips = [];
  if (st.period.preset !== 'todo') {
    const o = periodOptions(meta).find((x) => x.value === st.period.preset);
    chips.push([o && st.period.preset !== 'custom' ? o.label : `${fmtDate(d.periodo.desde)} – ${fmtDate(d.periodo.hasta)}`, () => setState({ period: { preset: 'todo', desde: null, hasta: null } })]);
  }
  if (st.depto) chips.push([`Departamento: ${st.depto}`, () => setState({ depto: '' })]);
  if (st.trabajador) chips.push([`Colaborador ID ${st.trabajador.id}`, () => setState({ trabajador: null })]);
  if (chips.length) {
    host.append(h('div', { class: 'activebar', role: 'status' }, 'Filtros activos:',
      ...chips.map(([t, clear]) => h('span', { class: 'chip' }, t, h('button', { type: 'button', 'aria-label': `Quitar filtro ${t}`, onclick: clear }, icon('x', 'icon--sm')))),
      h('button', { class: 'linkbtn', type: 'button', onclick: () => setState({ period: { preset: 'todo', desde: null, hasta: null }, depto: '', trabajador: null }) }, 'Limpiar todos')));
  }

  if (d.huecos.length) {
    host.append(h('div', { class: 'banner banner--warn', role: 'note' }, icon('info'),
      h('div', {}, h('strong', {}, 'Cobertura de datos incompleta. '),
        `No hay registros de asistencia entre ${d.huecos.map((g) => `${fmtDate(g.desde)} y ${fmtDate(g.hasta)}`).join(' y entre ')}. Esos días no se interpretan como ausencias.`)));
  }

  // volumen: una línea de contexto, no un indicador de resultado
  const stat = (n, label) => h('span', { class: 'stat' }, h('strong', { class: 'num' }, fmtInt(n)), label);
  host.append(h('div', { class: 'stats' },
    stat(k.fichajes, 'fichajes'), stat(k.jornadas, 'jornadas'), stat(k.colaboradores, 'colaboradores'),
    h('span', { class: 'stat', title: 'Terminales 3 y 4: no cuentan como asistencia' }, h('strong', { class: 'num' }, fmtInt(k.excluidos)), 'de comedor excluidos')));

  // --- KPIs ---
  const c = nom.hay_datos ? nom.kpis : null;
  host.append(h('section', { class: 'grid', 'aria-label': 'Indicadores principales' },
    h('div', { class: 'col-3' }, kpiCard({ label: 'Horas trabajadas', value: ind.horas.total, unit: 'h',
      foot: [ind.horas.promedio == null ? 'Sin jornadas calculables' : `${ind.horas.promedio.toLocaleString('es-MX')} h por jornada`,
        `${fmtInt(ind.horas.jornadas)} jornadas con entrada y salida`],
      info: `Horas netas entre el primer y el último fichaje de cada jornada, con ${as.comida_h} h de comida descontada. Las ${fmtInt(ind.horas.sin_salida)} jornadas con un solo fichaje no se pueden calcular.` })),
    h('div', { class: 'col-3' }, kpiCard({ label: 'Horas extra', value: ind.extras.horas, unit: 'h',
      foot: [ind.extras.pct == null ? '' : `${fmtPct(ind.extras.pct)} de las horas trabajadas`, `${hh(ind.extras.dobles)} dobles · ${hh(ind.extras.triples)} triples`].filter(Boolean),
      info: `Horas por encima de una jornada de ${as.jornada_h} h. Se cuentan dobles hasta ${as.tope_doble_semana_h} h por colaborador y semana, y triples el resto (referencia de los arts. 67 y 68 de la Ley Federal del Trabajo, pendiente de validar con PATE).` })),
    h('div', { class: 'col-3' }, kpiCard({ label: 'Retardos', value: ind.puntualidad.retardos,
      foot: [ind.puntualidad.pct == null ? '' : `${fmtPct(ind.puntualidad.pct)} de las jornadas`, `más de ${as.tolerancia_min} min sobre la entrada habitual`].filter(Boolean),
      info: `Jornadas en las que el primer fichaje llega más de ${as.tolerancia_min} min después de la hora de entrada habitual del colaborador (suposición de demo, sin horarios validados).` })),
    h('div', { class: 'col-3' }, kpiCard({ label: 'Nómina vs. fichajes (horas extra)', value: c ? Math.round(c.neto) : null, unit: c ? 'MXN' : '',
      foot: c ? [c.neto > 0.005 ? 'se pagó de más' : c.neto < -0.005 ? 'se pagó de menos' : 'sin diferencia', 'en horas extra · nómina simulada'] : ['Sin nóminas cargadas'],
      onClick: () => ctx.navigate('nomina'),
      info: 'Importe pagado por horas extra en las nóminas simuladas menos el que indican los fichajes. Positivo: se pagó de más. Negativo: se pagó de menos. Clic para ver el detalle.' }))));

  // lista de validaciones pendientes con PATE (se abre desde la barra de supuestos)
  const t1 = d.terminales_inicio['1'];
  const needs = [
    'Horarios y turnos por departamento, incluidos los nocturnos, y sus tolerancias.',
    'Qué fichaje es entrada y cuál salida cuando hay más de dos.',
    'Descanso de comida real, y criterio de horas extra validado por PATE (la cifra de extras depende de él).',
    'Calendario laboral: descansos, festivos y vacaciones. Sin él no se calculan ausencias.',
    `Umbral de doble pulsación (propuesto: ${meta.umbrales.doble_pulsacion_s} s) y severidad de cada tipo de alerta.`,
    t1 ? `Origen de los datos anteriores al ${fmtDate(meta.desde)}, descartados de esta demo (la terminal 1 empieza el ${fmtDate(t1)}).` : null,
    'Acceso y estructura de la nómina timbrada en MongoDB (fase 2).',
  ].filter(Boolean);
  const showNeeds = () => {
    const dr = openDrawer({ title: '¿Qué necesitamos de PATE?', subtitle: 'Validaciones para convertir los supuestos en reglas' });
    dr.body.append(h('ul', { class: 'check' }, ...needs.map((t) => h('li', {}, h('span', { class: 'mark mark--no' }), h('span', {}, t)))));
  };

  // --- supuestos visibles y editables ---
  host.append(h('div', { class: 'assume' }, icon('info', 'icon--sm'), h('strong', {}, 'Supuestos de la demo, por validar con PATE:'),
    h('span', {}, `jornada de ${as.jornada_h} h`), h('span', {}, `retardo: más de ${as.tolerancia_min} min sobre la entrada habitual`),
    h('label', {}, 'comida descontada: ', h('select', { class: 'select', 'aria-label': 'Horas de comida descontadas',
      onchange: (e) => setState({ comida: Number(e.target.value) }) },
    ...as.comida_opciones.map((v) => h('option', { value: String(v), selected: v === as.comida_h }, `${v.toLocaleString('es-MX')} h`)))),
    h('span', {}, `extras dobles hasta ${as.tope_doble_semana_h} h por semana, triples después`),
    h('button', { class: 'linkbtn', type: 'button', onclick: () => showNeeds() }, '¿Qué necesitamos de PATE?')));

  // --- horas por semana ---
  const partialWeeks = new Set(d.serie.filter((p) => p.terminales_sin_iniciar.length).map((p) => addDays(p.fecha, -dow(p.fecha))));
  const pts = ind.semanal.map((w) => {
    const cov = partialWeeks.has(w.semana);
    return { tick: fmtShort(w.desde), label: `Semana del ${fmtDate(w.desde)} al ${fmtDate(w.hasta)}`, a: w.ordinarias, b: w.extra, partial: w.parcial || cov,
      note: [w.parcial ? `Semana incompleta: ${w.dias} de 7 días` : null, cov ? 'Cobertura parcial: la terminal 1 empieza el 22/09, a las 09:03' : null].filter(Boolean),
      pick: { desde: w.desde, hasta: w.hasta } };
  });
  const chartHost = h('div', { class: 'chart-host' });
  const anyPartial = pts.some((p) => p.partial);
  const chartCard = h('div', { class: 'card col-7' },
    h('div', { class: 'card__head' }, h('div', {}, h('h2', { class: 'card__title' }, 'Horas por semana'),
      h('p', { class: 'card__sub' }, 'Ordinarias y extra. Pasa el cursor para ver el detalle; clic para filtrar por esa semana.'))),
    h('div', { class: 'legend' }, h('span', {}, h('i', { class: 'l-ord' }), 'Horas ordinarias'), h('span', {}, h('i', { class: 'l-extra' }), 'Horas extra'),
      anyPartial ? h('span', {}, h('i', { class: 'l-partial' }), 'Semana incompleta o con cobertura parcial') : null),
    pts.length ? chartHost : h('div', { class: 'table-state' }, 'Sin jornadas calculables en el periodo.'));

  // --- por departamento ---
  const METRICS = {
    extras: { label: 'Horas extra', val: (r) => r.extras, txt: (r) => hh(r.extras), ok: () => true },
    pct: { label: '% de extra', val: (r) => r.pct_extra, txt: (r) => fmtPct(r.pct_extra), ok: (r) => r.jornadas >= MIN_JORNADAS_PCT && r.pct_extra != null },
    retardos: { label: 'Retardos', val: (r) => r.retardos, txt: (r) => fmtInt(r.retardos), ok: () => true },
  };
  let metric = 'extras';
  const sel = st.depto;
  const barsHost = h('div', { class: 'hbars hbars--wide' });
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Indicador por departamento' });
  const drawDepts = () => {
    const M = METRICS[metric];
    const rows = ind.departamentos.filter(M.ok).sort((a, b) => M.val(b) - M.val(a));
    const max = Math.max(1, ...rows.map(M.val));
    [...seg.children].forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.m === metric)));
    barsHost.replaceChildren(...(rows.length ? rows.map((r) => {
      const b = h('button', { class: 'hbar', type: 'button', 'aria-pressed': String(sel === r.depto), onclick: () => setState({ depto: sel === r.depto ? '' : r.depto }) },
        h('span', { class: 'hbar__name' }, r.depto),
        h('span', { class: 'hbar__track' }, h('span', { class: 'hbar__fill', style: { width: `${(M.val(r) / max) * 100}%` } })),
        h('span', { class: 'hbar__val num' }, M.txt(r)));
      attachTip(b, () => [h('strong', {}, r.depto), `${hh(r.horas)} trabajadas · ${hh(r.extras)} extra${r.pct_extra == null ? '' : ` (${fmtPct(r.pct_extra)})`}`,
        h('span', { style: { display: 'block' } }, `${fmtInt(r.retardos)} retardos${r.pct_retardos == null ? '' : ` (${fmtPct(r.pct_retardos)} de ${fmtInt(r.jornadas)} jornadas)`}`),
        h('span', { style: { display: 'block' } }, sel === r.depto ? 'Clic para quitar el filtro' : 'Clic para filtrar por este departamento')]);
      return b;
    }) : [h('div', { class: 'table-state' }, 'Sin departamentos con datos suficientes.')]));
  };
  seg.append(...Object.entries(METRICS).map(([m, v]) => h('button', { type: 'button', 'data-m': m, onclick: () => { metric = m; drawDepts(); } }, v.label)));
  const deptCard = h('div', { class: 'card col-5' },
    h('div', { class: 'card__head' }, h('div', {}, h('h2', { class: 'card__title' }, 'Por departamento'),
      h('p', { class: 'card__sub' }, `Clic para filtrar. Los porcentajes solo incluyen departamentos con al menos ${MIN_JORNADAS_PCT} jornadas.`)), seg),
    barsHost);

  host.append(h('section', { class: 'grid' }, chartCard, deptCard));
  if (pts.length) stackedBars(chartHost, { points: pts, aLabel: 'Ordinarias', bLabel: 'Extra', unit: 'h',
    onPick: (r) => setState({ period: { preset: 'custom', desde: r.desde, hasta: r.hasta } }) });
  drawDepts();

  // --- calidad del dato ---
  const pctIncid = k.jornadas ? (k.incidencia + k.pendiente) / k.jornadas * 100 : null;
  const qRows = d.incidencias.map((t) => {
    const r = h('div', { class: 'qrow' },
      h('span', { class: 'qrow__name' }, t.label), h('span', { class: 'qrow__n num' }, fmtInt(t.jornadas)),
      h('span', { class: 'muted num', style: { textAlign: 'right' } }, t.pct_jornadas == null ? '' : fmtPct(t.pct_jornadas)));
    attachTip(r, () => [h('strong', {}, t.label), t.regla]);
    return r;
  });
  const qualityCard = h('div', { class: 'card col-5' },
    h('div', { class: 'card__head' }, h('div', {}, h('h2', { class: 'card__title' }, 'Calidad del dato'),
      h('p', { class: 'card__sub' }, 'Alertas en los fichajes que conviene revisar. No son errores confirmados.'))),
    h('div', { style: { display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '8px' } },
      h('span', { class: 'bigpct num' }, pctIncid == null ? '—' : fmtPct(pctIncid)), h('span', { class: 'muted' }, `de las ${fmtInt(k.jornadas)} jornadas tiene alguna alerta`)),
    h('div', { class: 'mini-list' }, ...qRows));

  // --- mapa de calor: departamento x tipo de alerta (% de las jornadas del departamento) ---
  const keys = d.incidencias.map((t) => t.key);
  const typeLabel = Object.fromEntries(d.incidencias.map((t) => [t.key, t.label]));
  const heat = d.incidencias_por_depto.filter((r) => r.jornadas >= MIN_JORNADAS_PCT)
    .map((r) => ({ ...r, total: keys.reduce((a, k) => a + r[k], 0) })).filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total).slice(0, 10);
  const pctOf = (r, k) => (r.jornadas ? (r[k] / r.jornadas) * 100 : 0);
  const maxP = Math.max(1, ...heat.flatMap((r) => keys.map((k) => pctOf(r, k))));
  const heatStyle = (p) => { const a = p / maxP; return { background: `rgba(18,51,95,${(0.06 + 0.86 * a).toFixed(2)})`, color: a > 0.5 ? '#fff' : 'var(--navy-900)' }; };
  const splitCard = h('div', { class: 'card col-7' },
    h('div', { class: 'card__head' }, h('div', {}, h('h2', { class: 'card__title' }, 'Dónde se concentran las alertas'),
      h('p', { class: 'card__sub' }, `Cada celda es el % de las jornadas del departamento con ese tipo de alerta; más oscuro, más frecuente. Solo departamentos con al menos ${MIN_JORNADAS_PCT} jornadas.`))),
    heat.length ? h('table', { class: 'heat' },
      h('thead', {}, h('tr', {}, h('th', {}), ...keys.map((k) => h('th', {}, typeLabel[k])))),
      h('tbody', {}, ...heat.map((r) => h('tr', {},
        h('th', { scope: 'row' }, h('button', { type: 'button', 'aria-pressed': String(sel === r.depto), onclick: () => setState({ depto: sel === r.depto ? '' : r.depto }) }, r.depto)),
        ...keys.map((k) => {
          const td = h('td', {}, h('button', { type: 'button', style: heatStyle(pctOf(r, k)),
            onclick: () => setState({ depto: sel === r.depto ? '' : r.depto }) }, fmtPct(pctOf(r, k))));
          attachTip(td, () => [h('strong', {}, r.depto), `${typeLabel[k]}: ${fmtInt(r[k])} de ${fmtInt(r.jornadas)} jornadas`, 'Clic para filtrar por este departamento']);
          return td;
        }))))) : h('div', { class: 'table-state' }, 'Sin alertas en el periodo.'));

  host.append(h('section', { class: 'grid' }, qualityCard, splitCard));
}
