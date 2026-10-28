import { h, debounce, fmtDate } from '../util.js';
import { icon } from '../icons.js';
import { get } from '../api.js';
import { getState, setState, periodOptions, resolvePeriod } from '../state.js';

/** Barra de filtros globales (periodo, departamento, colaborador, privacidad). */
export function mountFilterBar(host) {
  const { meta } = getState();
  const refs = {};

  refs.period = h('select', { class: 'select', 'aria-label': 'Periodo', onchange: (e) => {
    const preset = e.target.value;
    const cur = resolvePeriod(meta);
    setState({ period: { preset, desde: preset === 'custom' ? cur.desde : null, hasta: preset === 'custom' ? cur.hasta : null } });
  } }, ...periodOptions(meta).map((o) => h('option', { value: o.value }, o.label)));

  const onDate = () => {
    if (refs.from.value && refs.to.value && refs.from.value <= refs.to.value) {
      setState({ period: { preset: 'custom', desde: refs.from.value, hasta: refs.to.value } });
    }
  };
  refs.from = h('input', { class: 'input', type: 'date', min: meta.desde, max: meta.hasta, 'aria-label': 'Desde', onchange: onDate });
  refs.to = h('input', { class: 'input', type: 'date', min: meta.desde, max: meta.hasta, 'aria-label': 'Hasta', onchange: onDate });
  refs.dates = h('div', { class: 'dates' }, refs.from, refs.to);

  refs.depto = h('select', { class: 'select', 'aria-label': 'Departamento', onchange: (e) => setState({ depto: e.target.value }) },
    h('option', { value: '' }, 'Todos los departamentos'), ...meta.departamentos.map((d) => h('option', { value: d }, d)));

  // colaborador con autocompletado
  refs.suggest = h('div', { class: 'suggest', hidden: true, role: 'listbox' });
  refs.search = h('input', { class: 'input', type: 'search', placeholder: 'Buscar por ID del colaborador…', autocomplete: 'off', 'aria-label': 'Colaborador',
    oninput: debounce(async (e) => {
      const q = e.target.value.trim();
      if (!q) { refs.suggest.hidden = true; return; }
      try {
        const { rows } = await get('colaboradores/buscar', { q, nombres: getState().nombres ? 1 : '' });
        refs.suggest.replaceChildren(...(rows.length
          ? rows.map((r) => h('button', { type: 'button', role: 'option', onclick: () => pick(r) },
            h('strong', { class: 'num' }, String(r.id)), h('span', {}, r.nombre), h('span', { class: 'muted' }, r.depto)))
          : [h('div', { class: 'suggest__empty' }, getState().nombres ? 'Sin coincidencias' : 'Sin coincidencias por ID (activa “Mostrar nombres” para buscar por nombre)')]));
        refs.suggest.hidden = false;
      } catch { refs.suggest.hidden = true; }
    }) });
  const pick = (r) => { refs.search.value = ''; refs.suggest.hidden = true; setState({ trabajador: { id: r.id } }); };
  document.addEventListener('click', (e) => { if (!refs.suggest.contains(e.target) && e.target !== refs.search) refs.suggest.hidden = true; });
  refs.chip = h('div', { class: 'chip', hidden: true });
  refs.worker = h('div', { class: 'field field--grow' }, h('span', { class: 'field__label' }, 'Colaborador'), refs.search, refs.suggest, refs.chip);

  refs.names = h('button', { class: 'switch', type: 'button', 'aria-pressed': 'false',
    title: 'Los nombres se ocultan por defecto para proteger datos personales', onclick: () => setState({ nombres: !getState().nombres }) });

  host.replaceChildren(
    h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Periodo'), refs.period),
    h('div', { class: 'field', hidden: true, id: 'custom-dates' }, h('span', { class: 'field__label' }, 'Rango'), refs.dates),
    h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Departamento'), refs.depto),
    refs.worker,
    h('div', { class: 'filters__spacer' }),
    refs.names);

  async function sync() {
    const st = getState();
    refs.period.value = st.period.preset;
    const range = resolvePeriod(meta);
    document.getElementById('custom-dates').hidden = st.period.preset !== 'custom';
    refs.from.value = range.desde; refs.to.value = range.hasta;
    refs.depto.value = st.depto;
    refs.names.setAttribute('aria-pressed', String(st.nombres));
    refs.names.replaceChildren(icon(st.nombres ? 'eye' : 'eyeOff', 'icon--sm'), st.nombres ? 'Nombres visibles' : 'Nombres ocultos');
    if (st.trabajador) {
      refs.search.hidden = true;
      refs.chip.hidden = false;
      refs.chip.replaceChildren(`ID ${st.trabajador.id}`, h('button', { type: 'button', 'aria-label': 'Quitar filtro de colaborador', onclick: () => setState({ trabajador: null }) }, icon('x', 'icon--sm')));
      try {
        const { rows } = await get('colaboradores/buscar', { q: st.trabajador.id, nombres: st.nombres ? 1 : '' });
        const r = rows.find((x) => x.id === st.trabajador.id);
        if (r && getState().trabajador && getState().trabajador.id === r.id) refs.chip.firstChild.textContent = `ID ${r.id} · ${r.nombre}`;
      } catch { /* el chip conserva el ID */ }
    } else {
      refs.search.hidden = false;
      refs.chip.hidden = true;
    }
  }
  sync();
  return { sync, period: () => `${fmtDate(resolvePeriod(meta).desde)} – ${fmtDate(resolvePeriod(meta).hasta)}` };
}
