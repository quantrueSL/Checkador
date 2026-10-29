import { h, s, fmtInt, fmtDate, dow, addDays, diffDays, monthShort, parseISO } from '../util.js';
import { attachTip, showTip, moveTip, hideTip } from './tooltip.js';

let uid = 0;

/** Mini barras (una por semana). Los valores null (sin datos) quedan como hueco, no como cero. */
export function sparkline(values, { w = 120, hgt = 36 } = {}) {
  const max = Math.max(1, ...values.filter((v) => v != null));
  const slot = w / Math.max(1, values.length);
  const bars = values.map((v, i) => {
    if (v == null) return null;
    const bh = Math.max(1.5, (v / max) * (hgt - 2));
    return s('rect', { x: (i * slot + slot * 0.12).toFixed(1), y: (hgt - bh).toFixed(1), width: (slot * 0.76).toFixed(1), height: bh.toFixed(1), rx: 1, class: 'spark__bar' });
  });
  return s('svg', { viewBox: `0 0 ${w} ${hgt}`, class: 'spark', preserveAspectRatio: 'none', 'aria-hidden': 'true' }, ...bars);
}

function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((c) => c >= raw);
}

/**
 * Serie temporal. points: [{x, tick, label, y|null, gap, partial, extra}]. kind: 'line' | 'bar'.
 * Los tramos "gap" (sin datos) se dibujan como zona rayada: no se interpretan como cero.
 */
export function timeChart(host, { points, kind, unit, onPick }) {
  const id = ++uid;
  let lastW = 0;

  const draw = () => {
    const W = Math.max(320, Math.floor(host.clientWidth));
    lastW = W;
    const H = 250, m = { l: 52, r: 12, t: 12, b: 30 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b, n = points.length;
    const max = Math.max(1, ...points.map((p) => p.y ?? 0));
    const step = niceStep(max / 4);
    const yMax = step * 4;
    const slot = kind === 'bar' ? iw / n : (n > 1 ? iw / (n - 1) : iw);
    const xAt = (i) => (kind === 'bar' ? m.l + slot * i + slot / 2 : m.l + slot * i);
    const yAt = (v) => m.t + ih - (v / yMax) * ih;
    const base = m.t + ih;

    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'chart', role: 'img', 'aria-label': `Evolución de ${unit}` });
    svg.append(s('defs', {}, s('pattern', { id: `hatch${id}`, width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' },
      s('rect', { width: 6, height: 6, fill: '#f1f4f9' }), s('rect', { width: 2, height: 6, fill: '#cfd6e3' }))));

    for (let t = 0; t <= 4; t++) {
      const y = yAt(t * step);
      svg.append(s('line', { x1: m.l, x2: W - m.r, y1: y, y2: y, class: 'chart__grid' }),
        s('text', { x: m.l - 8, y: y + 4, 'text-anchor': 'end', class: 'chart__axis' }, fmtInt(t * step)));
    }
    const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 62))));
    points.forEach((p, i) => {
      if (i % every === 0) svg.append(s('text', { x: xAt(i), y: H - 10, 'text-anchor': 'middle', class: 'chart__axis' }, p.tick));
    });

    // franjas informativas: fines de semana y periodos con cobertura parcial de terminales
    const bands = (pred, cls, labelOf) => {
      for (let i = 0; i < n; i++) {
        if (!pred(points[i])) continue;
        let j = i;
        while (j + 1 < n && pred(points[j + 1])) j++;
        const x0 = Math.max(m.l, xAt(i) - slot / 2), x1 = Math.min(W - m.r, xAt(j) + slot / 2);
        svg.append(s('rect', { x: x0, y: m.t, width: Math.max(1, x1 - x0), height: ih, class: cls }));
        if (labelOf && x1 - x0 > 110) svg.append(s('text', { x: (x0 + x1) / 2, y: m.t + 14, 'text-anchor': 'middle', class: 'chart__covlabel' }, labelOf(points[i])));
        i = j;
      }
    };
    bands((p) => p.weekend && !p.gap, 'chart__weekend');
    bands((p) => p.cov && !p.gap, 'chart__cov', (p) => `Cobertura parcial · ${p.covText.toLowerCase()}`);

    // zonas sin datos
    for (let i = 0; i < n; i++) {
      if (!points[i].gap) continue;
      let j = i;
      while (j + 1 < n && points[j + 1].gap) j++;
      const x0 = Math.max(m.l, xAt(i) - slot / 2), x1 = Math.min(W - m.r, xAt(j) + slot / 2);
      svg.append(s('rect', { x: x0, y: m.t, width: Math.max(1, x1 - x0), height: ih, fill: `url(#hatch${id})` }));
      if (x1 - x0 > 90) svg.append(s('text', { x: (x0 + x1) / 2, y: m.t + ih / 2, 'text-anchor': 'middle', class: 'chart__gaplabel' }, 'Sin registros'));
      i = j;
    }

    if (kind === 'bar') {
      const bw = Math.max(2, Math.min(34, slot * 0.7));
      points.forEach((p, i) => {
        if (p.y == null) return;
        const y = yAt(p.y);
        svg.append(s('rect', { x: xAt(i) - bw / 2, y, width: bw, height: Math.max(0, base - y), rx: 2, class: p.partial ? 'chart__bar chart__bar--partial' : 'chart__bar' }));
      });
    } else {
      let seg = [];
      const flush = () => {
        if (seg.length === 1) svg.append(s('circle', { cx: seg[0][0], cy: seg[0][1], r: 2.5, fill: '#12335f' }));
        else if (seg.length > 1) {
          const line = seg.map(([x, y], k) => `${k ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
          svg.append(s('path', { d: `${line}L${seg.at(-1)[0].toFixed(1)} ${base}L${seg[0][0].toFixed(1)} ${base}Z`, class: 'chart__area' }),
            s('path', { d: line, class: 'chart__line' }));
        }
        seg = [];
      };
      points.forEach((p, i) => { if (p.y == null) flush(); else seg.push([xAt(i), yAt(p.y)]); });
      flush();
    }

    // interacción
    const guide = s('line', { y1: m.t, y2: base, class: 'chart__guide', visibility: 'hidden' });
    const dot = s('circle', { r: 4, class: 'chart__dot', visibility: 'hidden' });
    const hit = s('rect', { x: m.l, y: m.t, width: iw, height: ih, fill: 'transparent' });
    svg.append(guide, dot, hit);
    const idx = (e) => {
      const r = svg.getBoundingClientRect();
      const px = (e.clientX - r.left) * (W / r.width) - m.l;
      return Math.min(n - 1, Math.max(0, kind === 'bar' ? Math.floor(px / slot) : Math.round(px / slot)));
    };
    hit.addEventListener('pointermove', (e) => {
      const i = idx(e), p = points[i];
      guide.setAttribute('x1', xAt(i)); guide.setAttribute('x2', xAt(i)); guide.setAttribute('visibility', 'visible');
      if (p.y != null && kind === 'line') { dot.setAttribute('cx', xAt(i)); dot.setAttribute('cy', yAt(p.y)); dot.setAttribute('visibility', 'visible'); } else dot.setAttribute('visibility', 'hidden');
      showTip(e.clientX, e.clientY,
        h('strong', {}, p.label),
        p.y == null ? '' : `${fmtInt(p.y)} ${unit}`,
        ...(p.extra || []).map((t) => h('span', { style: { display: 'block' } }, t)),
        onPick && p.pick ? h('span', { style: { display: 'block', marginTop: '4px' } }, 'Clic para filtrar por este periodo') : '');
      moveTip(e.clientX, e.clientY);
    });
    if (onPick) {
      hit.style.cursor = 'pointer';
      hit.addEventListener('click', (e) => { const p = points[idx(e)]; if (p.pick) { hideTip(); onPick(p.pick); } });
    }
    hit.addEventListener('pointerleave', () => { guide.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); hideTip(); });
    host.replaceChildren(svg);
  };

  draw();
  const ro = new ResizeObserver(() => {
    if (!host.isConnected) { ro.disconnect(); return; }
    if (Math.abs(host.clientWidth - lastW) > 2) draw();
  });
  ro.observe(host);
}

/**
 * Calendario por semanas (columnas) y días (filas) con el estado de cada jornada.
 * days: [{fecha, n, horas, estado}], gaps: huecos de cobertura de datos.
 */
export function calendar({ days, desde, hasta, gaps }) {
  const byDate = new Map(days.map((d) => [d.fecha, d]));
  const start = addDays(desde, -dow(desde));
  const end = addDays(hasta, 6 - dow(hasta));
  const total = diffDays(start, end) + 1;
  const inGap = (d) => gaps.some((g) => g.desde <= d && g.hasta >= d);
  const STATE = { ok: 'Sin incidencias', incidencia: 'Incidencia', pendiente: 'Pendiente de validar' };

  const body = h('div', { class: 'cal__body' });
  for (let i = 0; i < total; i++) {
    const d = addDays(start, i);
    if (dow(d) === 0) {
      const first = i === 0 ? d >= desde : d.slice(5, 7) !== addDays(d, -7).slice(5, 7);
      body.append(h('div', { class: 'cal__month' }, first ? monthShort(d.slice(0, 7)) : ''));
    }
    const rec = byDate.get(d);
    const out = d < desde || d > hasta;
    const cls = out ? 'cal__cell--out' : rec ? `cal__cell--${rec.estado}` : inGap(d) ? 'cal__cell--gap' : '';
    const cell = h('div', { class: `cal__cell ${cls}`.trim(), tabindex: out ? null : '0' });
    if (!out) {
      attachTip(cell, () => rec
        ? [h('strong', {}, fmtDate(d)), `${rec.n} fichaje${rec.n === 1 ? '' : 's'}: ${rec.horas.map((t) => t.slice(0, 5)).join(', ')}`, h('span', {}, STATE[rec.estado])]
        : [h('strong', {}, fmtDate(d)), inGap(d) ? 'Sin registros en las terminales de asistencia' : 'Sin fichajes en este día']);
    }
    body.append(cell);
  }
  const labels = ['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((l) => h('span', {}, l));
  const legend = h('div', { class: 'cal-legend' },
    ...[['cal__cell--ok', 'Sin incidencias'], ['cal__cell--incidencia', 'Incidencia'], ['cal__cell--pendiente', 'Pendiente de validar'],
      ['', 'Sin fichajes'], ['cal__cell--gap', 'Sin datos en el archivo']]
      .map(([c, t]) => h('span', {}, h('i', { class: `cal__cell ${c}` }), t)));
  return h('div', {}, h('div', { class: 'cal' }, h('div', { class: 'cal__days', style: { marginTop: '17px' } }, ...labels), body), legend);
}

/**
 * Dos líneas por día: horas esperadas (referencia, punteada) y horas reales (continua). El área entre ambas se colorea:
 * verde cuando se trabaja por encima de lo esperado, ámbar cuando por debajo.
 * points: [{tick, label, esperadas|null, reales|null, colaboradores, gap, off}]. "gap" = sin registros (zona rayada);
 * "off" = día sin jornadas (fin de semana o descanso): franja gris y las líneas lo saltan en vez de caer a cero.
 */
export function expectedVsActual(host, { points, unit = 'h' }) {
  let lastW = 0;
  const id = ++uid;
  const draw = () => {
    const W = Math.max(320, Math.floor(host.clientWidth));
    lastW = W;
    const H = 290, m = { l: 56, r: 14, t: 14, b: 32 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b, n = points.length;
    const max = Math.max(1, ...points.flatMap((p) => [p.esperadas ?? 0, p.reales ?? 0]));
    const step = niceStep(max / 5), ticks = Math.ceil(max / step), yMax = step * ticks;   // el eje se ajusta a los datos
    const slot = n > 1 ? iw / (n - 1) : iw;
    const xAt = (i) => m.l + slot * i;
    const yAt = (v) => m.t + ih - (v / yMax) * ih;
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'chart', role: 'img', 'aria-label': 'Horas esperadas y horas reales por día' });
    svg.append(s('defs', {}, s('pattern', { id: `hatchx${id}`, width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' },
      s('rect', { width: 6, height: 6, fill: '#f1f4f9' }), s('rect', { width: 2, height: 6, fill: '#cfd6e3' }))));
    for (let t = 0; t <= ticks; t++) {
      svg.append(s('line', { x1: m.l, x2: W - m.r, y1: yAt(t * step), y2: yAt(t * step), class: 'chart__grid' }),
        s('text', { x: m.l - 8, y: yAt(t * step) + 4, 'text-anchor': 'end', class: 'chart__axis' }, fmtInt(t * step)));
    }
    svg.append(s('text', { x: m.l - 8, y: 9, 'text-anchor': 'end', class: 'chart__axis' }, unit));
    const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 62))));
    points.forEach((p, i) => { if (i % every === 0) svg.append(s('text', { x: xAt(i), y: H - 10, 'text-anchor': 'middle', class: 'chart__axis' }, p.tick)); });

    // franjas: días sin jornadas (gris) y sin registros (rayado)
    const band = (pred, attrs) => {
      for (let i = 0; i < n; i++) {
        if (!pred(points[i])) continue;
        let j = i;
        while (j + 1 < n && pred(points[j + 1])) j++;
        const x0 = Math.max(m.l, xAt(i) - slot / 2), x1 = Math.min(W - m.r, xAt(j) + slot / 2);
        svg.append(s('rect', { x: x0, y: m.t, width: Math.max(1, x1 - x0), height: ih, ...attrs }));
        i = j;
      }
    };
    band((p) => (p.off || p.weekend) && !p.gap, { class: 'chart__weekend' });
    band((p) => p.gap, { fill: `url(#hatchx${id})` });

    // área entre las dos líneas: verde si lo real supera lo esperado, ámbar si se queda corto
    let prev = null;
    const poly = (pts, cls) => svg.append(s('path', { d: `${pts.map(([x, y], k) => `${k ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('')}Z`, class: cls }));
    points.forEach((p, i) => {
      if (p.gap) { prev = null; return; }
      if (p.off || p.esperadas == null) return;
      const cur = { x: xAt(i), e: p.esperadas, r: p.reales };
      if (prev) {
        const d0 = prev.r - prev.e, d1 = cur.r - cur.e;
        const P = (x, v) => [x, yAt(v)];
        const cls = (d) => (d >= 0 ? 'chart__over' : 'chart__under');
        if (d0 * d1 >= 0) poly([P(prev.x, prev.e), P(cur.x, cur.e), P(cur.x, cur.r), P(prev.x, prev.r)], cls(d0 || d1));
        else {
          const k = d0 / (d0 - d1), xc = prev.x + (cur.x - prev.x) * k, vc = prev.e + (cur.e - prev.e) * k;
          poly([P(prev.x, prev.e), P(xc, vc), P(prev.x, prev.r)], cls(d0));
          poly([P(xc, vc), P(cur.x, cur.e), P(cur.x, cur.r)], cls(d1));
        }
      }
      prev = cur;
    });

    const line = (key, cls) => {
      let seg = [];
      const flush = () => {
        if (seg.length > 1) svg.append(s('path', { d: seg.map(([x, y], k) => `${k ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(''), class: cls }));
        seg = [];
      };
      points.forEach((p, i) => { if (p.gap) flush(); else if (!p.off && p[key] != null) seg.push([xAt(i), yAt(p[key])]); });
      flush();
    };
    line('esperadas', 'chart__line chart__line--ref');
    line('reales', 'chart__line chart__line--real');
    if (n <= 45) points.forEach((p, i) => { if (!p.gap && !p.off && p.reales != null) svg.append(s('circle', { cx: xAt(i), cy: yAt(p.reales), r: 3, class: 'chart__pt' })); });

    const guide = s('line', { y1: m.t, y2: m.t + ih, class: 'chart__guide', visibility: 'hidden' });
    const hit = s('rect', { x: m.l, y: m.t, width: iw, height: ih, fill: 'transparent' });
    svg.append(guide, hit);
    hit.addEventListener('pointermove', (e) => {
      const r = svg.getBoundingClientRect();
      const i = Math.min(n - 1, Math.max(0, Math.round(((e.clientX - r.left) * (W / r.width) - m.l) / slot)));
      const p = points[i], block = (t) => h('span', { style: { display: 'block' } }, t);
      guide.setAttribute('x1', xAt(i)); guide.setAttribute('x2', xAt(i)); guide.setAttribute('visibility', 'visible');
      const dif = p.reales != null && p.esperadas != null ? p.reales - p.esperadas : null;
      const pctTxt = p.esperadas ? ` (${(p.reales / p.esperadas * 100).toLocaleString('es-MX', { maximumFractionDigits: 0 })} % de lo esperado)` : '';
      showTip(e.clientX, e.clientY, h('strong', {}, p.label),
        ...(p.gap ? [block('Sin registros en las terminales de asistencia')] : p.off ? [block('Sin jornadas calculables (descanso o fin de semana)')] : [
          block(`${fmtInt(p.colaboradores)} colaboradores con entrada y salida`),
          block(`Esperadas: ${fmtInt(p.esperadas)} ${unit}`), block(`Reales: ${fmtInt(p.reales)} ${unit}`),
          dif == null ? '' : block(`${dif >= 0 ? 'Por encima' : 'Por debajo'}: ${fmtInt(Math.abs(dif))} ${unit}${pctTxt}`)]));
      moveTip(e.clientX, e.clientY);
    });
    hit.addEventListener('pointerleave', () => { guide.setAttribute('visibility', 'hidden'); hideTip(); });
    host.replaceChildren(svg);
  };
  draw();
  const ro = new ResizeObserver(() => {
    if (!host.isConnected) { ro.disconnect(); return; }
    if (Math.abs(host.clientWidth - lastW) > 2) draw();
  });
  ro.observe(host);
}
