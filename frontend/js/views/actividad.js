import { h, fmtDate } from '../util.js';
import { icon } from '../icons.js';
import { get } from '../api.js';
import { setState, filterParams } from '../state.js';
import { timeChart } from '../components/charts.js';
import { dailyPoints, weeklyPoints } from '../domain/series.js';

/** Actividad de fichajes (volumen de registros por día o semana). Es información de control, no de resultado. */
export async function renderActividad(host) {
  const d = await get('resumen', filterParams());
  let mode = 'daily';
  const notStartedList = [...new Set(d.serie.flatMap((p) => p.terminales_sin_iniciar))].sort().join(', ');
  const hasPartial = notStartedList !== '';
  const chartHost = h('div', { class: 'chart-host' });
  const legend = h('div', { class: 'legend' });
  const draw = () => {
    const weekly = mode === 'weekly';
    legend.replaceChildren(...[
      h('span', {}, h('i', { class: 'l-line' }), weekly ? 'Fichajes por semana' : 'Fichajes por día'),
      d.huecos.length ? h('span', {}, h('i', { class: 'l-gap' }), 'Sin registros en el archivo') : null,
      hasPartial ? h('span', {}, h('i', { class: 'l-cov' }), `Cobertura parcial (terminal ${notStartedList} sin registros)`) : null,
      weekly ? null : h('span', {}, h('i', { class: 'l-weekend' }), 'Fin de semana'),
      weekly ? h('span', {}, h('i', { class: 'l-partial' }), 'Semana incompleta') : null].filter(Boolean));
    const pts = weekly ? weeklyPoints(d.serie, d.terminales_inicio) : dailyPoints(d.serie, d.terminales_inicio);
    timeChart(chartHost, { points: pts, kind: weekly ? 'bar' : 'line', unit: 'fichajes',
      onPick: (r) => setState({ period: { preset: 'custom', desde: r.desde, hasta: r.hasta } }) });
  };
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Granularidad' });
  const setMode = (m) => { mode = m; [...seg.children].forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.m === m))); draw(); };
  seg.append(...[['daily', 'Diario'], ['weekly', 'Semanal']].map(([m, t]) => h('button', { type: 'button', 'data-m': m, 'aria-pressed': String(m === mode), onclick: () => setMode(m) }, t)));

  host.append(
    d.huecos.length ? h('div', { class: 'banner banner--warn', role: 'note' }, icon('info'),
      h('div', {}, h('strong', {}, 'Cobertura de datos incompleta. '),
        `No hay registros de asistencia entre ${d.huecos.map((g) => `${fmtDate(g.desde)} y ${fmtDate(g.hasta)}`).join(' y entre ')}. Esos días no se interpretan como ausencias.`)) : null,
    h('div', { class: 'card' },
      h('div', { class: 'card__head' }, h('div', {}, h('h2', { class: 'card__title' }, 'Actividad de fichajes'),
        h('p', { class: 'card__sub' }, 'Volumen de registros de asistencia, para comprobar la cobertura de los datos. Clic para filtrar por ese periodo.')), seg),
      legend, chartHost));
  draw();
}
