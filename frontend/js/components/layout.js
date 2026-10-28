import { h, fmtDate, fmtInt } from '../util.js';
import { icon } from '../icons.js';
import { s } from '../util.js';

export const NAV = [
  { id: 'resumen', label: 'Resumen ejecutivo', icon: 'grid' },
  { id: 'nomina', label: 'Nómina y conciliación', icon: 'payroll', tag: 'Fase 2' },
  { id: 'extras_sin_pagar', label: 'Horas extra sin pagar', icon: 'hourglass', tag: 'Fase 2' },
];

export function pageHead({ title, subtitle, back, actions }) {
  return h('div', { class: 'page-head' },
    h('div', {},
      back ? h('a', { class: 'crumb', href: back.href }, icon('back', 'icon--sm'), back.label) : null,
      h('h1', {}, title), subtitle ? h('p', {}, subtitle) : null),
    actions ? h('div', {}, actions) : null);
}

const NAV_KEY = 'pate.menu.oculto';

export function setNavHidden(hidden) {
  document.body.classList.toggle('nav-hidden', hidden);
  try { localStorage.setItem(NAV_KEY, hidden ? '1' : '0'); } catch { /* sin almacenamiento */ }
  // los gráficos se redibujan solos al cambiar el ancho (ResizeObserver)
}

export function mountSidebar(host, meta) {
  try { setNavHidden(localStorage.getItem(NAV_KEY) === '1'); } catch { /* ignorar */ }
  document.body.append(h('button', { class: 'nav-open', type: 'button', 'aria-label': 'Mostrar menú', title: 'Mostrar menú', onclick: () => setNavHidden(false) }, icon('menu')));
  const mark = s('svg', { viewBox: '0 0 32 32', class: 'brand__mark', 'aria-hidden': 'true' },
    s('rect', { width: 32, height: 32, rx: 7, fill: '#12335f' }),
    s('path', { d: 'M10 23V9h7a4.5 4.5 0 010 9h-7', fill: 'none', stroke: '#1fb5b5', 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  const ing = meta.ingesta;
  host.replaceChildren(
    h('div', { class: 'brand' }, mark, h('div', { class: 'brand__text' }, h('div', { class: 'brand__name' }, 'PATE Workforce Intelligence'), h('div', { class: 'brand__sub' }, 'Demo')),
      h('button', { class: 'nav-toggle', type: 'button', 'aria-label': 'Ocultar menú', title: 'Ocultar menú', onclick: () => setNavHidden(true) }, icon('left'))),
    h('nav', { class: 'nav' }, ...NAV.map((n) => h('a', { class: 'nav__item', href: `#/${n.id}`, 'data-nav': n.id, title: n.label },
      icon(n.icon), h('span', { class: 'nav__label' }, n.label), n.tag ? h('span', { class: 'nav__tag' }, n.tag) : null))),
    h('div', { class: 'sidebar__foot' },
      h('strong', {}, 'Datos de la demo'), h('br'),
      ing ? `${ing.archivo}` : 'Sin datos', h('br'),
      meta.hay_datos ? `${fmtDate(meta.desde)} – ${fmtDate(meta.hasta)}` : '', h('br'),
      ing ? `${fmtInt(ing.incluidos)} registros de asistencia` : ''));
}

export function setActiveNav(id) {
  document.querySelectorAll('[data-nav]').forEach((a) => {
    if (a.dataset.nav === id) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
}
