import { h, fmtInt, fmtDate, toast } from '../util.js';
import { icon } from '../icons.js';
import { get, postFile, post, exportUrl } from '../api.js';
import { getState, filterParams } from '../state.js';
import { pageHead } from '../components/layout.js';
import { badge, typeTags, times } from '../components/badge.js';
import { dataTable } from '../components/dataTable.js';
import { openJornada } from '../components/jornadaDrawer.js';
import { renderActividad } from './actividad.js';

const TABS = [['jornadas', 'Jornadas'], ['colaboradores', 'Colaboradores'], ['actividad', 'Actividad de fichajes'], ['registros', 'Registros originales'], ['trazabilidad', 'Trazabilidad de la ingesta']];
const TERMINALS = [{ value: '', label: 'Todas' }, { value: '1', label: 'Terminal 1' }, { value: '2', label: 'Terminal 2' }];

export async function render(host, ctx) {
  const tab = TABS.some(([k]) => k === ctx.route.query.tab) ? ctx.route.query.tab : 'jornadas';
  host.replaceChildren(
    pageHead({ title: 'Control de fichajes', subtitle: 'Consulta de jornadas y registros con su origen en el archivo de IBIX' }),
    h('div', { class: 'tabs', role: 'tablist' }, ...TABS.map(([k, t]) => h('a', { href: `#/fichajes?tab=${k}`, role: 'tab', 'aria-selected': String(k === tab) }, t))));
  const body = h('div');
  host.append(body);
  if (tab === 'jornadas') jornadas(body, ctx);
  else if (tab === 'colaboradores') colaboradores(body, ctx);
  else if (tab === 'actividad') await renderActividad(body);
  else if (tab === 'registros') registros(body);
  else await trazabilidad(body, ctx);
}

function jornadas(host, ctx) {
  const { meta, nombres } = getState();
  const params = filterParams();
  const table = dataTable({
    searchPlaceholder: nombres ? 'Buscar por ID o nombre…' : 'Buscar por ID…',
    sort: { key: 'fecha', dir: 'desc' },
    filters: [
      { key: 'estado', label: 'Estado', options: [{ value: '', label: 'Todos' }, { value: 'ok', label: 'Sin incidencias' }, { value: 'incidencia', label: 'Incidencia' }] },
      { key: 'terminal', label: 'Terminal', options: TERMINALS },
    ],
    exportHref: (p) => exportUrl('jornadas', { ...params, ...p }),
    onRowClick: (r) => openJornada({ trabajador: r.trabajador, fecha: r.fecha, onOpenWorker: (id) => ctx.navigate(`colaborador/${id}`) }),
    columns: [
      { key: 'fecha', label: 'Fecha', sortable: true, render: (r) => fmtDate(r.fecha) },
      { key: 'id', label: 'ID', sortable: true, render: (r) => h('span', { class: 'num' }, String(r.trabajador)) },
      { key: 'nombre', label: 'Colaborador', sortable: nombres, render: (r) => r.nombre },
      { key: 'depto', label: 'Departamento', sortable: true },
      { key: 'n', label: 'Fichajes', sortable: true, align: 'right' },
      { key: 'horas', label: 'Horas', render: (r) => times(r.horas) },
      { key: 'terminales', label: 'Terminal', render: (r) => r.terminales.join(', ') },
      { key: 'tipos', label: 'Observaciones', render: (r) => typeTags(r.tipos, meta) },
      { key: 'estado', label: 'Estado', sortable: true, render: (r) => badge(r.estado) },
    ],
    load: (p) => get('jornadas', { ...params, ...p }),
  });
  host.append(h('p', { class: 'muted', style: { marginBottom: '10px' } },
    'Una jornada es el conjunto de fichajes de un colaborador en un día. No se asume que cada colaborador tenga dos fichajes ni cuál es entrada o salida.'), table.el);
}

function colaboradores(host, ctx) {
  const params = filterParams();
  const table = dataTable({
    searchPlaceholder: getState().nombres ? 'Buscar por ID o nombre…' : 'Buscar por ID…',
    sort: { key: 'fichajes', dir: 'desc' },
    onRowClick: (r) => ctx.navigate(`colaborador/${r.id}`),
    columns: [
      { key: 'id', label: 'ID', sortable: true, render: (r) => h('span', { class: 'num' }, String(r.id)) },
      { key: 'nombre', label: 'Colaborador', sortable: getState().nombres, render: (r) => r.nombre },
      { key: 'depto', label: 'Departamento', sortable: true },
      { key: 'fichajes', label: 'Fichajes', sortable: true, align: 'right', render: (r) => fmtInt(r.fichajes) },
      { key: 'dias', label: 'Días con fichajes', sortable: true, align: 'right', render: (r) => fmtInt(r.dias) },
      { key: 'incidencias', label: 'Incidencias', sortable: true, align: 'right',
        render: (r) => (r.incidencias ? h('span', {}, fmtInt(r.incidencias)) : h('span', { class: 'muted' }, '0')) },
      { key: 'ultimo', label: 'Último fichaje', sortable: true, render: (r) => fmtDate(r.ultimo) },
      { key: 'ver', label: '', render: () => h('span', { class: 'muted' }, icon('right', 'icon--sm')) },
    ],
    load: (p) => get('colaboradores', { ...params, ...p }),
    empty: 'Ningún colaborador coincide con los filtros.',
  });
  host.append(h('p', { class: 'muted', style: { marginBottom: '10px' } },
    'Colaboradores con al menos un fichaje de asistencia en el periodo. Clic en una fila para ver su detalle.'), table.el);
}

function registros(host) {
  const params = filterParams();
  const table = dataTable({
    searchPlaceholder: 'Buscar por ID…',
    sort: { key: 'linea', dir: 'asc' },
    pageSize: 25,
    filters: [
      { key: 'terminal', label: 'Terminal', options: [{ value: '', label: 'Todas' }, ...['1', '2', '3', '4'].map((t) => ({ value: t, label: `Terminal ${t}` }))] },
      { key: 'excluido', label: 'Tratamiento', options: [{ value: '', label: 'Todos' }, { value: '0', label: 'Incluidos' }, { value: '1', label: 'Excluidos (comedor)' }] },
    ],
    columns: [
      { key: 'linea', label: 'Línea del CSV', sortable: true, align: 'right' },
      { key: 'trabajador', label: 'ID', sortable: true, align: 'right' },
      { key: 'depto', label: 'Departamento' },
      { key: 'instante', label: 'Fecha y hora de checada', sortable: true, render: (r) => h('span', { class: 'mono' }, `${fmtDate(r.instante.slice(0, 10))} ${r.instante.slice(11)}`) },
      { key: 'terminal', label: 'Terminal', sortable: true },
      { key: 'estado', label: 'Tratamiento', sortable: true, render: (r) => (r.excluido ? badge('pendiente', `Excluido: ${r.motivo.toLowerCase()}`) : badge('ok', 'Incluido')) },
    ],
    load: (p) => get('registros', { ...params, ...p }),
  });
  host.append(h('p', { class: 'muted', style: { marginBottom: '10px' } },
    'Copia fiel de los registros del CSV. Los de comedor no se eliminan: quedan marcados como excluidos para poder auditarlos. Este listado no muestra nombres.'), table.el);
}

async function trazabilidad(host, ctx) {
  const t = await get('trazabilidad');
  const i = t.ingesta;
  const exTerm = t.terminales.filter((x) => x.excluido);
  const months = [...new Set(t.por_mes.map((r) => r.mes))];
  const terms = [...new Set(t.por_mes.map((r) => r.terminal))].sort();
  const cell = Object.fromEntries(t.por_mes.map((r) => [`${r.mes}|${r.terminal}`, r.registros]));

  const reprocess = async (btn) => {
    btn.disabled = true;
    try { const r = await post('ingesta/reprocesar'); toast(r.estado === 'cargado' ? 'Archivo reprocesado' : 'Sin cambios'); location.reload(); }
    catch (e) { toast(`No se pudo reprocesar: ${e.message}`); btn.disabled = false; }
  };
  const fileInput = h('input', { type: 'file', accept: '.csv,text/csv', hidden: true, onchange: async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (!window.confirm(`Se sustituirán los datos cargados por "${f.name}". Las revisiones de incidencias se conservan. ¿Continuar?`)) { e.target.value = ''; return; }
    try { await postFile('ingesta/subir', f); toast('CSV procesado correctamente'); setTimeout(() => location.reload(), 600); }
    catch (err) { toast(`No se pudo procesar el CSV: ${err.message}`); e.target.value = ''; }
  } });

  host.append(
    h('div', { class: 'grid' },
      h('div', { class: 'card col-7' },
        h('div', { class: 'card__head' }, h('div', {}, h('h2', { class: 'card__title' }, 'Archivo procesado'), h('p', { class: 'card__sub' }, 'El CSV original no se modifica nunca.')),
          h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
            h('button', { class: 'btn btn--sm', type: 'button', onclick: (e) => reprocess(e.currentTarget) }, icon('refresh', 'icon--sm'), 'Reprocesar'),
            h('button', { class: 'btn btn--sm', type: 'button', onclick: () => fileInput.click() }, icon('upload', 'icon--sm'), 'Subir otro CSV'), fileInput)),
        h('dl', { class: 'kv' },
          ...[['Archivo', i.archivo], ['Cargado el', i.cargado_en], ['Codificación detectada', i.codificacion],
            ['Versión de reglas', i.version_reglas], ['Líneas rechazadas', fmtInt(i.rechazadas + i.no_parseables)],
            ['Fecha distinta a la de la checada', fmtInt(i.discrepancias_fecha)]]
            .map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v))),
          h('div', { style: { gridColumn: '1 / -1' } }, h('dt', {}, 'Huella SHA-256'), h('dd', { class: 'mono' }, i.sha256)),
          h('div', { style: { gridColumn: '1 / -1' } }, h('dt', {}, 'Cabecera del reporte (preámbulo)'), h('dd', { class: 'mono', style: { whiteSpace: 'pre-line' } }, i.preambulo || '—')))),
      h('div', { class: 'card col-5' },
        h('div', { class: 'card__head' }, h('div', {}, h('h2', { class: 'card__title' }, 'Cuadre de registros'), h('p', { class: 'card__sub' }, 'Cada registro del CSV está en exactamente un grupo.'))),
        h('table', { class: 'flow num' },
          h('tbody', {},
            h('tr', {}, h('td', {}, 'Registros leídos del CSV'), h('td', {}, fmtInt(i.registros))),
            ...exTerm.map((x) => h('tr', {}, h('td', {}, `Excluidos: terminal ${x.terminal} (comedor)`), h('td', {}, `− ${fmtInt(x.registros)}`))),
            h('tr', {}, h('td', {}, 'Registros de asistencia analizados'), h('td', {}, fmtInt(i.incluidos)))),
        ),
        i.registros !== i.incluidos + i.excluidos + i.no_parseables
          ? h('div', { class: 'error', style: { marginTop: '12px' } }, 'El cuadre no coincide: revisar la ingesta.')
          : h('p', { class: 'card__sub', style: { marginTop: '10px' } }, '✔ El cuadre coincide con el total del archivo.'))),
    h('div', { class: 'grid' },
    h('div', { class: 'card col-7' },
      h('div', { class: 'card__head' }, h('div', {}, h('h2', { class: 'card__title' }, 'Registros por mes y terminal'),
        h('p', { class: 'card__sub' }, 'Permite ver desde cuándo hay datos en cada terminal. Las terminales 3 y 4 están excluidas.'))),
      h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Mes'), ...terms.map((x) => h('th', { class: 'r' }, `Terminal ${x}${t.reglas.terminales_excluidas.includes(x) ? ' (excluida)' : ''}`)))),
        h('tbody', {}, ...months.map((m) => h('tr', {}, h('td', {}, m), ...terms.map((x) => h('td', { class: 'r num' }, cell[`${m}|${x}`] ? fmtInt(cell[`${m}|${x}`]) : h('span', { class: 'muted' }, '—'))))))))),
    h('div', { class: 'col-5', style: { display: 'grid', gap: '12px', alignContent: 'start' } },
      h('div', { class: 'card' },
        h('h2', { class: 'card__title', style: { marginBottom: '10px' } }, 'Huecos de cobertura detectados'),
        t.huecos.length
          ? h('ul', { style: { margin: 0, paddingLeft: '18px' } }, ...t.huecos.map((g) => h('li', {}, `${fmtDate(g.desde)} – ${fmtDate(g.hasta)} (${g.dias} días sin ningún registro de asistencia)`)))
          : h('p', { class: 'muted' }, 'No se detectaron huecos.'),
        h('p', { class: 'card__sub', style: { marginTop: '10px' } }, 'Un hueco indica falta de datos en el archivo, no ausencias de personal.')),
      h('div', { class: 'card' },
        h('h2', { class: 'card__title', style: { marginBottom: '10px' } }, 'Reglas aplicadas'),
        h('dl', { class: 'dl' },
          h('dt', {}, 'Terminales excluidas'), h('dd', {}, t.reglas.terminales_excluidas.join(', ')),
          h('dt', {}, 'Doble pulsación'), h('dd', {}, `≤ ${t.reglas.doble_pulsacion_s} s (umbral por validar)`),
          h('dt', {}, 'Versión'), h('dd', {}, t.reglas.version))))));
}
