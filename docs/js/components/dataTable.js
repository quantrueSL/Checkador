import { h } from '../util.js';
import { icon } from '../icons.js';

/**
 * Tabla con búsqueda, filtros, ordenación y paginación en el servidor.
 * columns: [{key, label, sortable, align, render(row)}], load(params) -> Promise<{rows, total}>.
 */
export function dataTable({ columns, load, sort, pageSize = 10, pageSizes = [10, 25, 50], searchPlaceholder, filters = [],
  onRowClick, exportHref, empty = 'No hay resultados para los filtros actuales.' }) {
  const st = { q: '', sort: sort && sort.key, dir: (sort && sort.dir) || 'desc', page: 1, pageSize,
    filters: Object.fromEntries(filters.map((f) => [f.key, f.value ?? ''])) };
  let token = 0, total = 0;

  const wrap = h('div', { class: 'table-wrap' });
  const foot = h('div', { class: 'table-foot' });
  const bar = h('div', { class: 'table-bar' });
  const root = h('div', { class: 'table-card' }, bar, wrap, foot);

  if (searchPlaceholder) {
    let t;
    const input = h('input', { class: 'input', type: 'search', placeholder: searchPlaceholder, 'aria-label': searchPlaceholder,
      oninput: (e) => { clearTimeout(t); t = setTimeout(() => { st.q = e.target.value; st.page = 1; refresh(); }, 280); } });
    bar.append(h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Buscar'), h('div', { class: 'search' }, icon('search'), input)));
  }
  for (const f of filters) {
    bar.append(h('label', { class: 'field' }, h('span', { class: 'field__label' }, f.label),
      h('select', { class: 'select', value: st.filters[f.key], onchange: (e) => { st.filters[f.key] = e.target.value; st.page = 1; refresh(); } },
        ...f.options.map((o) => h('option', { value: o.value }, o.label)))));
  }
  bar.append(h('div', { class: 'filters__spacer' }));
  if (exportHref) {
    bar.append(h('a', { class: 'btn', href: '#', onclick: (e) => { e.currentTarget.href = exportHref({ ...st.filters, q: st.q, sort: st.sort, dir: st.dir }); } },
      icon('download', 'icon--sm'), 'Exportar CSV'));
  }

  function renderHead() {
    return h('thead', {}, h('tr', {}, ...columns.map((c) => {
      const active = st.sort === c.key;
      const th = h('th', { class: c.align === 'right' ? 'r' : '', 'aria-sort': active ? (st.dir === 'asc' ? 'ascending' : 'descending') : null, scope: 'col' });
      if (c.sortable) {
        th.append(h('button', { type: 'button', onclick: () => { st.dir = active && st.dir === 'desc' ? 'asc' : 'desc'; st.sort = c.key; st.page = 1; refresh(); } },
          c.label, active ? icon(st.dir === 'asc' ? 'sortUp' : 'sortDown', 'icon--sm') : null));
      } else th.append(c.label);
      return th;
    })));
  }

  function renderRows(rows) {
    if (!rows.length) return h('div', { class: 'table-state' }, empty);
    const tbody = h('tbody', {}, ...rows.map((r) => {
      const tr = h('tr', { class: onRowClick ? 'is-click' : '', tabindex: onRowClick ? '0' : null },
        ...columns.map((c) => h('td', { class: c.align === 'right' ? 'r num' : '' }, c.render ? c.render(r) : r[c.key])));
      if (onRowClick) {
        tr.addEventListener('click', () => onRowClick(r));
        tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') onRowClick(r); });
      }
      return tr;
    }));
    return h('table', { class: 'table' }, renderHead(), tbody);
  }

  function renderFoot() {
    const pages = Math.max(1, Math.ceil(total / st.pageSize));
    const from = total ? (st.page - 1) * st.pageSize + 1 : 0;
    const to = Math.min(total, st.page * st.pageSize);
    const go = (p) => () => { st.page = Math.min(pages, Math.max(1, p)); refresh(); };
    const lo = Math.max(1, Math.min(st.page - 2, pages - 4)), hi = Math.min(pages, lo + 4);
    const nums = [];
    for (let p = lo; p <= hi; p++) nums.push(h('button', { type: 'button', 'aria-current': p === st.page ? 'page' : null, 'aria-label': `Página ${p}`, onclick: go(p) }, String(p)));
    foot.replaceChildren(
      h('span', { class: 'num' }, `Mostrando ${from.toLocaleString('es-MX')}–${to.toLocaleString('es-MX')} de ${total.toLocaleString('es-MX')}`),
      h('div', { class: 'pager' },
        h('button', { type: 'button', 'aria-label': 'Página anterior', disabled: st.page <= 1, onclick: go(st.page - 1) }, icon('left', 'icon--sm')),
        ...nums,
        h('button', { type: 'button', 'aria-label': 'Página siguiente', disabled: st.page >= pages, onclick: go(st.page + 1) }, icon('right', 'icon--sm')),
        h('select', { class: 'select', 'aria-label': 'Filas por página', value: String(st.pageSize),
          onchange: (e) => { st.pageSize = Number(e.target.value); st.page = 1; refresh(); } },
          ...pageSizes.map((n) => h('option', { value: String(n) }, `${n} / pág.`)))));
  }

  async function refresh() {
    const my = ++token;
    wrap.classList.add('is-loading');
    try {
      const res = await load({ ...st.filters, q: st.q, sort: st.sort, dir: st.dir, page: st.page, pageSize: st.pageSize });
      if (my !== token) return;
      total = res.total;
      const pages = Math.max(1, Math.ceil(total / st.pageSize));
      if (st.page > pages) { st.page = pages; return refresh(); }
      wrap.replaceChildren(renderRows(res.rows));
      renderFoot();
    } catch (err) {
      if (my !== token) return;
      wrap.replaceChildren(h('div', { class: 'table-state' }, `No se pudieron cargar los datos: ${err.message} `,
        h('button', { class: 'btn btn--sm', type: 'button', onclick: refresh }, 'Reintentar')));
    } finally {
      if (my === token) wrap.classList.remove('is-loading');
    }
  }

  refresh();
  return { el: root, reload: refresh };
}
