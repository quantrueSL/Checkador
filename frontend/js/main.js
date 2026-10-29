import { h } from './util.js';
import { get } from './api.js';
import { getState, setState, subscribe } from './state.js';
import { mountSidebar, setActiveNav } from './components/layout.js';
import { mountFilterBar } from './components/filterBar.js';
import * as resumen from './views/resumen.js';
import * as fichajes from './views/fichajes.js';
import * as horasExtra from './views/horasExtra.js';
import * as incidencias from './views/incidencias.js';
// Pestaña "Nómina y conciliación". Vista actual: agregada por mes y departamento (views/nomina.js).
// Para volver a la vista anterior (una fila por colaborador) como pestaña principal, cambia solo esta línea por:
//   import * as nomina from './views/nominaColaborador.js';
// La vista anterior sigue accesible hoy en la dirección #/nomina_colaborador.
import * as nomina from './views/nomina.js';
import * as nominaColaborador from './views/nominaColaborador.js';
import * as extrasSinPagar from './views/extrasSinPagar.js';
import * as colaborador from './views/colaborador.js';

const VIEWS = { resumen, horas_extra: horasExtra, fichajes, incidencias, nomina, nomina_colaborador: nominaColaborador, extras_sin_pagar: extrasSinPagar, colaborador };
const content = document.getElementById('content');
let filterBar, token = 0;

function parseRoute() {
  const [path, qs] = location.hash.replace(/^#\/?/, '').split('?');
  const [view, id] = path.split('/');
  return { view: VIEWS[view] ? view : 'resumen', id, query: Object.fromEntries(new URLSearchParams(qs || '')) };
}

export function navigate(path, query) {
  const qs = query ? `?${new URLSearchParams(query)}` : '';
  location.hash = `#/${path}${qs}`;
}

async function renderRoute(force = false) {
  const route = parseRoute();
  const my = ++token;
  setActiveNav(route.view === 'colaborador' ? 'resumen' : route.view === 'nomina_colaborador' ? 'nomina' : route.view);
  document.getElementById('filters').classList.toggle('is-hidden', ['nomina', 'nomina_colaborador', 'extras_sin_pagar'].includes(route.view));
  const scratch = h('div');
  content.replaceChildren(h('div', { class: 'loading', role: 'status' }, 'Cargando…'));
  try {
    await VIEWS[route.view].render(scratch, { route, navigate, reload: () => renderRoute(true) });
    if (my !== token) return;
    content.replaceChildren(...scratch.childNodes);
    if (force !== 'keep-scroll') window.scrollTo({ top: 0 });
  } catch (err) {
    if (my !== token) return;
    content.replaceChildren(h('div', { class: 'error', role: 'alert' }, `No se pudo cargar esta pantalla: ${err.message}`));
  }
}

async function start() {
  try {
    const meta = await get('meta');
    setState({ meta, nombres: false });
    mountSidebar(document.getElementById('sidebar'), meta);
    if (!meta.hay_datos) {
      content.replaceChildren(h('div', { class: 'error' }, 'Todavía no hay datos. Ejecuta "python run.py ingest" para procesar Checadas.csv.'));
      return;
    }
    const st = getState();
    if (st.depto && !meta.departamentos.includes(st.depto)) setState({ depto: '' });
    filterBar = mountFilterBar(document.getElementById('filters'));
    subscribe(() => { filterBar.sync(); renderRoute('keep-scroll'); });
    window.addEventListener('hashchange', () => renderRoute());
    await renderRoute();
  } catch (err) {
    content.replaceChildren(h('div', { class: 'error', role: 'alert' }, `No se pudo iniciar la aplicación: ${err.message}`));
  }
}

start();
