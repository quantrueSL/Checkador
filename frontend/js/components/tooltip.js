import { h } from '../util.js';

let tip;
const ensure = () => tip || (tip = document.body.appendChild(h('div', { class: 'tooltip', role: 'tooltip' })));

export function moveTip(x, y) {
  const t = ensure();
  const pad = 14;
  const w = t.offsetWidth, hgt = t.offsetHeight;
  let left = x + pad, top = y + pad;
  if (left + w > window.innerWidth - 8) left = x - w - pad;
  if (top + hgt > window.innerHeight - 8) top = y - hgt - pad;
  t.style.left = `${Math.max(8, left)}px`;
  t.style.top = `${Math.max(8, top)}px`;
}

/** content: nodos o textos. */
export function showTip(x, y, ...content) {
  const t = ensure();
  t.replaceChildren(...content.flat().map((c) => (c.nodeType ? c : document.createTextNode(c))));
  t.classList.add('is-on');
  moveTip(x, y);
}

export const hideTip = () => tip && tip.classList.remove('is-on');

/** Muestra un tooltip al pasar el ratón o al enfocar un elemento. contentFn devuelve nodos o textos. */
export function attachTip(el, contentFn) {
  el.addEventListener('pointerenter', (e) => showTip(e.clientX, e.clientY, contentFn()));
  el.addEventListener('pointermove', (e) => moveTip(e.clientX, e.clientY));
  el.addEventListener('pointerleave', hideTip);
  el.addEventListener('focus', () => { const r = el.getBoundingClientRect(); showTip(r.left, r.bottom, contentFn()); });
  el.addEventListener('blur', hideTip);
}
