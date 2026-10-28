/**
 * Aviso de datos simulados: una etiqueta pequeña con icono de aviso; la explicación solo se ve al pulsarla.
 */
import { h } from '../util.js';
import { icon } from '../icons.js';
import { openDrawer } from './drawer.js';

export function simNotice({ text, supuestos = [] }) {
  const open = () => {
    const dr = openDrawer({ title: 'Datos simulados para la demostración', subtitle: 'Qué es real y qué no' });
    dr.body.append(
      h('p', {}, text),
      supuestos.length ? h('h3', { class: 'card__title', style: { margin: '12px 0 8px' } }, 'Supuestos de la simulación (pendientes de validar con PATE)') : null,
      supuestos.length ? h('ul', { class: 'check' }, ...supuestos.map((t) => h('li', {}, h('span', { class: 'mark mark--no' }), h('span', {}, t)))) : null);
  };
  return h('button', { class: 'warnchip', type: 'button', onclick: open, title: 'Ver qué datos son simulados' },
    icon('info', 'icon--sm'), 'Datos simulados', h('span', { class: 'warnchip__more' }, 'Ver detalle'));
}
