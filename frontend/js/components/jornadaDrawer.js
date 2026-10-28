import { h, fmtDate, toast } from '../util.js';
import { icon } from '../icons.js';
import { get, post } from '../api.js';
import { getState } from '../state.js';
import { badge, typeTags, severityBadge, managementBadge } from './badge.js';
import { openDrawer } from './drawer.js';

/** Detalle de una jornada con sus registros originales (incluidos los de comedor, marcados como excluidos). */
export async function openJornada({ trabajador, fecha, review = false, onChange, onOpenWorker }) {
  const { meta, nombres } = getState();
  const dr = openDrawer({ title: `Jornada del ${fmtDate(fecha)}`, subtitle: `Colaborador ${trabajador}` });
  dr.body.append(h('div', { class: 'loading' }, 'Cargando…'));
  try {
    const d = await get('jornadas/detalle', { trabajador, fecha, nombres: nombres ? 1 : '' });
    const j = d.jornada;
    const labels = Object.fromEntries(d.tipos.map((t) => [t.key, t]));
    const reglas = j.tipos.map((k) => h('div', { class: 'note-box' }, h('strong', {}, labels[k].label), ' — ', j.motivos[k],
      h('div', { class: 'muted', style: { marginTop: '4px', fontSize: '12px' } }, `${labels[k].regla} ${labels[k].por_validar}`)));

    dr.body.replaceChildren(
      h('dl', { class: 'dl' },
        h('dt', {}, 'Colaborador'), h('dd', {}, `${j.nombre} (ID ${j.trabajador})`),
        h('dt', {}, 'Departamento'), h('dd', {}, j.depto),
        h('dt', {}, 'Estado'), h('dd', {}, badge(j.estado)),
        h('dt', {}, 'Tipos detectados'), h('dd', {}, typeTags(j.tipos, meta)),
        h('dt', {}, 'Severidad (propuesta)'), h('dd', {}, severityBadge(j.severidad)),
        h('dt', {}, 'Gestión'), h('dd', {}, j.estado === 'ok' ? '—' : managementBadge(j.revision)),
        h('dt', {}, 'Fichajes de asistencia'), h('dd', {}, String(j.n))),
      ...reglas,
      h('div', {}, h('h3', { class: 'card__title', style: { marginBottom: '8px' } }, 'Registros originales del día'),
        h('table', { class: 'table' },
          h('thead', {}, h('tr', {}, ...['Hora', 'Terminal', 'Línea en el CSV', 'Tratamiento'].map((t) => h('th', {}, t)))),
          h('tbody', {}, ...d.registros.map((r) => h('tr', {},
            h('td', { class: 'mono' }, r.instante.slice(11)), h('td', {}, r.terminal), h('td', { class: 'num' }, String(r.linea_origen)),
            h('td', {}, r.excluido ? badge('pendiente', `Excluido: ${r.motivo.toLowerCase()}`) : badge('neutral', 'Incluido'))))))));

    if (review) {
      const note = h('textarea', { class: 'input', maxlength: '500', placeholder: 'Nota de revisión (opcional)', 'aria-label': 'Nota de revisión', value: j.nota || '' });
      dr.body.append(h('div', {}, h('h3', { class: 'card__title', style: { marginBottom: '8px' } }, 'Revisión'),
        h('p', { class: 'muted', style: { marginBottom: '8px' } }, j.revision
        ? 'Una persona marcó esta jornada como revisada.'
        : 'Detectada automáticamente. Todavía no la ha revisado nadie.'), note));
      const save = async (estado) => {
        try {
          await post('incidencias/revision', { trabajador: j.trabajador, fecha: j.fecha, estado, nota: note.value.trim() });
          toast(estado ? 'Jornada marcada como revisada' : 'Jornada reabierta');
          dr.close();
          if (onChange) onChange();
        } catch (e) { toast(`No se pudo guardar: ${e.message}`); }
      };
      dr.foot.append(j.revision
        ? [h('button', { class: 'btn', type: 'button', onclick: () => save(null) }, 'Reabrir'),
          h('button', { class: 'btn btn--primary', type: 'button', onclick: () => save('revisada') }, icon('check', 'icon--sm'), 'Guardar nota')]
        : h('button', { class: 'btn btn--primary', type: 'button', onclick: () => save('revisada') }, icon('check', 'icon--sm'), 'Marcar como revisada'));
    }
    if (onOpenWorker) {
      dr.foot.prepend(h('button', { class: 'btn', type: 'button', onclick: () => { dr.close(); onOpenWorker(j.trabajador); } }, 'Ver colaborador', icon('arrow', 'icon--sm')));
    }
  } catch (e) {
    dr.body.replaceChildren(h('div', { class: 'error' }, e.message));
  }
}
