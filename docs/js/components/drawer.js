import { h } from '../util.js';
import { icon } from '../icons.js';

/** Panel lateral. Devuelve {close, body, foot}. Se cierra con Esc, con el fondo o con el botón. */
export function openDrawer({ title, subtitle, onClose }) {
  const previous = document.activeElement;
  const body = h('div', { class: 'drawer__body' });
  const foot = h('div', { class: 'drawer__foot' });
  const closeBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Cerrar panel', onclick: () => close() }, icon('x'));
  const overlay = h('div', { class: 'drawer-overlay', onclick: () => close() });
  const panel = h('aside', { class: 'drawer', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'drawer__head' }, h('div', {}, h('h2', {}, title), subtitle ? h('p', { class: 'muted' }, subtitle) : null), closeBtn),
    body, foot);
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.body.append(overlay, panel);
  document.addEventListener('keydown', onKey);
  requestAnimationFrame(() => { overlay.classList.add('open'); panel.classList.add('open'); closeBtn.focus(); });

  function close() {
    document.removeEventListener('keydown', onKey);
    overlay.classList.remove('open'); panel.classList.remove('open');
    setTimeout(() => { overlay.remove(); panel.remove(); }, 200);
    if (previous && previous.focus) previous.focus();
    if (onClose) onClose();
  }
  return { close, body, foot };
}
