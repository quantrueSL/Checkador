import { h, fmtInt, fmtPct, fmtDate } from '../util.js';
import { icon } from '../icons.js';
import { sparkline } from './charts.js';
import { attachTip } from './tooltip.js';

/**
 * label, value, spark (valores semanales o null), variacion ({comparable, motivo, anterior}) y pct, foot (texto o lista de líneas),
 * info (texto del tooltip junto a la etiqueta), onClick (convierte la tarjeta en punto de entrada).
 * La variación solo aparece cuando es comparable de forma rigurosa; si no, se explica por qué.
 */
export function kpiCard({ label, value, unit, spark, variacion, pct, foot, info, onClick }) {
  let delta;
  if (variacion && pct !== undefined) {
    if (variacion.comparable && pct != null) {
      delta = h('span', {}, h('span', { class: 'delta' }, `${pct >= 0 ? '▲' : '▼'} ${fmtPct(Math.abs(pct))}`),
        ` vs. ${fmtDate(variacion.anterior.desde)} – ${fmtDate(variacion.anterior.hasta)}`);
    } else {
      delta = h('span', { tabindex: '0' }, 'Sin comparación disponible');
      attachTip(delta, () => variacion.motivo || 'El periodo anterior no tiene datos para comparar.');
    }
  }
  const infoEl = info ? h('span', { class: 'kpi__info', tabindex: '0', 'aria-label': info }, icon('info', 'icon--sm')) : null;
  if (infoEl) attachTip(infoEl, () => info);
  const card = h('div', { class: `card kpi${onClick ? ' kpi--click' : ''}`, role: onClick ? 'button' : null, tabindex: onClick ? '0' : null },
    h('div', { class: 'kpi__label' }, label, infoEl),
    h('div', { class: 'kpi__row' },
      h('div', { class: 'kpi__value num' }, fmtInt(value), unit ? h('small', { class: 'kpi__unit' }, ` ${unit}`) : null),
      spark ? h('div', { class: 'kpi__spark' }, sparkline(spark)) : null),
    h('div', { class: 'kpi__foot' }, delta, ...[].concat(foot || []).map((t) => h('span', {}, t))));
  if (onClick) {
    card.addEventListener('click', onClick);
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } });
  }
  return card;
}
