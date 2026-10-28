/**
 * Nómina y conciliación · vista agregada (sin colaboradores): horas extra pagadas frente a las de los fichajes,
 * por mes y por departamento. La vista anterior, con una fila por colaborador, sigue en nominaColaborador.js
 * (ruta #/nomina_colaborador). Para recuperarla como pestaña principal, ver el comentario en main.js.
 */
import { h, fmtInt, fmtShort, fmtMoney, monthName } from '../util.js';
import { icon } from '../icons.js';
import { get } from '../api.js';
import { pageHead } from '../components/layout.js';
import { kpiCard } from '../components/kpiCard.js';
import { simNotice } from '../components/simNotice.js';

const hh = (n) => `${fmtInt(Math.round(n * 10) / 10)} h`;

export async function render(host) {
  const first = await get('nomina/extras');
  const head = pageHead({ title: 'Nómina y conciliación', subtitle: 'Horas extra pagadas frente a las que indican los fichajes, por mes y por departamento' });
  if (!first.hay_datos) {
    host.replaceChildren(head, h('div', { class: 'card' }, h('div', { class: 'table-state' },
      'Todavía no hay nóminas simuladas. Ejecuta “python run.py nominas” para generarlas.')));
    return;
  }

  const monthLabel = (m) => `${monthName(m.key)} (${fmtShort(m.desde)} – ${fmtShort(m.hasta)})`;
  let mes = '';
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Mes' });
  const body = h('div');

  const note = simNotice({ text: 'Las nóminas, tarifas y periodos son inventados; los fichajes son los reales de IBIX desde el 21/09.', supuestos: first.supuestos });

  const paintSeg = () => seg.replaceChildren(
    ...[['', 'Todos los meses'], ...first.meses.map((m) => [m.key, monthLabel(m)])].map(([v, label]) =>
      h('button', { type: 'button', 'aria-pressed': String(mes === v), onclick: () => { mes = v; paintSeg(); paint(); } }, label)));

  const paint = async () => {
    const d = await get('nomina/extras', { mes });
    const k = d.kpis;
    const diff = k.horas_pagadas - k.horas_fichajes;

    const sentido = (n) => (n > 0.005 ? 'se pagó de más' : n < -0.005 ? 'se pagó de menos' : 'sin diferencia');
    const tone = (n) => (n > 0.005 ? 'warn' : n < -0.005 ? 'navy' : 'ok');
    const color = (n) => (n > 0.005 ? 'var(--warn)' : 'var(--navy-800)');

    const kpis = h('section', { class: 'grid', 'aria-label': 'Horas extra pagadas frente a fichajes' },
      h('div', { class: 'col-3 tone tone--navy' }, kpiCard({ label: 'Horas extra pagadas', value: Math.round(k.horas_pagadas), unit: 'h',
        foot: ['las que figuran en la nómina'], info: 'Horas extra (dobles y triples) que aparecen en las nóminas simuladas.' })),
      h('div', { class: 'col-3 tone tone--teal' }, kpiCard({ label: 'Horas extra según fichajes', value: Math.round(k.horas_fichajes), unit: 'h',
        foot: ['las que resultan de los fichajes'], info: 'Horas por encima de la jornada de 8 h, según los fichajes reales de IBIX.' })),
      h('div', { class: `col-3 tone tone--${tone(diff)}` }, kpiCard({ label: 'Diferencia en horas', value: Math.round(diff), unit: 'h',
        foot: [diff > 0.05 ? 'se pagaron más horas de las fichadas' : diff < -0.05 ? 'se pagaron menos horas de las fichadas' : 'coinciden'],
        info: 'Horas pagadas menos horas fichadas. Positivo: se pagaron más. Negativo: se pagaron menos.' })),
      h('div', { class: `col-3 tone tone--${tone(k.neto)}` }, kpiCard({ label: 'Diferencia en pesos', value: Math.round(k.neto), unit: 'MXN',
        foot: [sentido(k.neto), 'frente a lo que indican los fichajes'],
        info: 'Importe pagado por horas extra menos el importe que resulta de los fichajes. Positivo: se pagó de más. Negativo: se pagó de menos.' })));

    // por mes: una tarjeta por mes con una sola cifra y, al lado, lo pagado frente a lo que correspondía en miniatura
    const maxV = Math.max(1, ...d.por_mes.flatMap((m) => [m.importe_pagado, m.importe_fichajes]));
    const money0 = (v) => `$${Math.round(v).toLocaleString('es-MX')}`;
    const mcol = (v, bg, label) => h('div', { class: 'mcol' }, h('span', { class: 'mcol__val num' }, money0(v)),
      h('span', { class: 'mcol__bar', style: { height: `${Math.max(3, Math.round((v / maxV) * 64))}px`, background: bg } }), h('span', { class: 'mcol__lab' }, label));
    const meses = h('div', { class: 'card col-5' },
      h('div', { class: 'card__head' }, h('div', {}, h('h2', { class: 'card__title' }, 'Por mes'),
        h('p', { class: 'card__sub' }, 'Diferencia de las horas extra y, a la derecha, lo pagado frente a lo que correspondía según los fichajes. Septiembre solo desde el 21/09.'))),
      h('div', { class: 'legend' }, h('span', {}, h('i', { style: { background: 'var(--navy-800)' } }), 'Pagado'), h('span', {}, h('i', { style: { background: 'var(--teal-500)' } }), 'Correspondía')),
      ...d.por_mes.map((m) => {
        const info = first.meses.find((x) => x.key === m.mes);
        return h('div', { class: `monthtile monthtile--${tone(m.neto)}`, style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '12px' } },
          h('div', {},
            h('div', { class: 'muted', style: { fontSize: '12.5px' } }, monthLabel(info)),
            h('div', { class: 'num', style: { fontSize: '26px', fontWeight: '700', color: color(m.neto), lineHeight: 1.2 } }, fmtMoney(m.neto, true)),
            h('div', { style: { fontSize: '13px', color: color(m.neto), fontWeight: '600' } }, sentido(m.neto)),
            h('div', { class: 'muted num', style: { fontSize: '12.5px', marginTop: '2px' } }, `${hh(m.horas_pagadas)} pagadas · ${hh(m.horas_fichajes)} según fichajes`)),
          h('div', { class: 'minip' }, mcol(m.importe_pagado, 'var(--navy-800)', 'Pagado'), mcol(m.importe_fichajes, 'var(--teal-500)', 'Correspondía')));
      }));

    const rows = [...d.por_depto].sort((x, y) => Math.abs(y.neto) - Math.abs(x.neto));
    const deptos = h('div', { class: 'card col-7' },
      h('div', { class: 'card__head' }, h('div', {}, h('h2', { class: 'card__title' }, 'Por departamento'),
        h('p', { class: 'card__sub' }, 'Diferencia entre lo pagado por horas extra y lo que indican los fichajes. Muestra simulada, no toda la plantilla.'))),
      rows.length ? h('div', { class: 'table-wrap', style: { maxHeight: '330px', overflow: 'auto' } }, h('table', { class: 'table' },
        h('thead', {}, h('tr', {}, ...['Departamento', 'Horas pagadas', 'Horas fichadas', 'Diferencia'].map((t, i) => h('th', { class: i ? 'r' : '' }, t)))),
        h('tbody', {}, ...rows.map((x) => h('tr', {}, h('td', {}, x.depto), h('td', { class: 'r num' }, hh(x.horas_pagadas)), h('td', { class: 'r num' }, hh(x.horas_fichajes)),
          h('td', { class: 'r num', style: { whiteSpace: 'nowrap' } }, Math.abs(x.neto) < 0.005 ? h('span', { class: 'muted' }, 'Sin diferencia')
            : h('span', { class: `diffchip diffchip--${tone(x.neto)}` }, `${fmtMoney(x.neto, true)} ${x.neto > 0 ? 'de más' : 'de menos'}`))))))) : h('div', { class: 'table-state' }, 'Sin datos.'));

    const how = h('details', { class: 'card', style: { marginTop: '12px' } },
      h('summary', { class: 'card__title', style: { cursor: 'pointer' } }, 'Cómo se calcula'),
      h('div', { class: 'plist', style: { marginTop: '10px' } },
        ...[['Horas extra según fichajes', 'Lo que excede la jornada de 8 h de cada día. Dobles hasta 9 h por colaborador y semana; triples el resto (referencia de la Ley Federal del Trabajo, por validar con PATE).'],
          ['Diferencia', 'Importe pagado por horas extra menos el importe que resulta de los fichajes. Positiva: se pagó de más. Negativa: se pagó de menos. En cada grupo (mes o departamento) se suman todas las nóminas, así que unas diferencias pueden compensar a otras.'],
          ['Alcance', 'Esta pantalla agrega por mes y departamento; no muestra personas. Es una muestra simulada de 40 colaboradores.']]
          .map(([t, q]) => h('div', { class: 'prow' }, h('strong', {}, t), h('p', {}, q)))));

    body.replaceChildren(kpis, h('div', { style: { height: '12px' } }), h('section', { class: 'grid' }, meses, deptos), how);
  };


  host.replaceChildren(head, note, h('div', { style: { marginBottom: '12px' } }, seg), body);
  paintSeg();
  await paint();
}
