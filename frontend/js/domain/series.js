/** Reglas de presentación de series temporales. Sin DOM. */
import { addDays, dow, fmtDate, fmtShort } from '../util.js';

const DAY = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

/** Terminales de asistencia que ya tienen registros en un día (las que no han empezado, quedan fuera). */
const active = (inicio, sinIniciar) => Object.keys(inicio).filter((t) => !sinIniciar.includes(t)).sort();
const covText = (inicio, sinIniciar) => `Solo terminal ${active(inicio, sinIniciar).join(', ')}`;
const notStarted = (inicio, sinIniciar) => sinIniciar.map((t) => `Terminal ${t} sin registros hasta el ${fmtDate(inicio[t])}`);
const gapNote = (g) => [`Sin registros en las terminales de asistencia (hueco del ${fmtDate(g.desde)} al ${fmtDate(g.hasta)}, ${g.dias} días).`,
  'No se interpreta como ausencia ni como cero fichajes.'];

export function dailyPoints(serie, inicio) {
  return serie.map((p) => ({
    x: p.fecha, tick: fmtShort(p.fecha), label: `${DAY[dow(p.fecha)]} ${fmtDate(p.fecha)}`, y: p.fichajes, gap: p.sin_datos,
    weekend: p.fin_de_semana, cov: p.terminales_sin_iniciar.length > 0, covText: covText(inicio, p.terminales_sin_iniciar),
    pick: p.sin_datos ? null : { desde: p.fecha, hasta: p.fecha },
    extra: p.sin_datos ? gapNote(p.hueco)
      : [`${p.colaboradores} colaboradores · terminales con registros: ${p.terminales.join(', ') || '—'}`,
        ...notStarted(inicio, p.terminales_sin_iniciar), p.fin_de_semana ? 'Fin de semana' : null].filter(Boolean),
  }));
}

/** Agrega por semana (lunes a domingo). Una semana con días sin datos o recortada por el periodo se marca como parcial. */
export function weeklyPoints(serie, inicio = {}) {
  const weeks = new Map();
  for (const p of serie) {
    const start = addDays(p.fecha, -dow(p.fecha));
    const w = weeks.get(start) || { start, end: p.fecha, sum: 0, days: 0, gapDays: 0, sinIniciar: null, hueco: null };
    w.days += 1;
    w.end = p.fecha;
    if (p.sin_datos) { w.gapDays += 1; w.hueco = w.hueco || p.hueco; } else {
      w.sum += p.fichajes;
      w.sinIniciar = w.sinIniciar || (p.terminales_sin_iniciar.length ? p.terminales_sin_iniciar : null);
    }
    weeks.set(start, w);
  }
  return [...weeks.values()].map((w) => {
    const allGap = w.gapDays === w.days;
    const partial = !allGap && (w.gapDays > 0 || w.days < 7);
    return {
      x: w.start, tick: fmtShort(w.start), label: `Semana del ${fmtDate(w.start)}`,
      y: allGap ? null : w.sum, gap: allGap, partial, weekend: false,
      cov: !allGap && !!w.sinIniciar, covText: w.sinIniciar ? covText(inicio, w.sinIniciar) : '',
      pick: allGap ? null : { desde: w.start, hasta: w.end },
      extra: allGap ? gapNote(w.hueco)
        : [partial ? `Semana incompleta: ${w.days - w.gapDays} de 7 días con datos` : null,
          ...(w.sinIniciar ? notStarted(inicio, w.sinIniciar) : [])].filter(Boolean),
    };
  });
}

/** Valores semanales para los minigráficos (null = semana sin datos). */
export function weeklyValues(serie, pick) {
  const weeks = new Map();
  for (const p of serie) {
    const key = addDays(p.fecha, -dow(p.fecha));
    const w = weeks.get(key) || { f: 0, c: 0, gap: true };
    if (!p.sin_datos) { w.f += p.fichajes; w.c = Math.max(w.c, p.colaboradores); w.gap = false; }
    weeks.set(key, w);
  }
  return [...weeks.values()].map((w) => (w.gap ? null : pick === 'c' ? w.c : w.f));
}
