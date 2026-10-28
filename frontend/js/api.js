/** Capa de acceso a datos del cliente: único módulo que llama al servidor. */
function qs(params) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) if (v != null && v !== '') u.set(k, v);
  const s = u.toString();
  return s ? `?${s}` : '';
}

async function parse(res) {
  let body = null;
  try { body = await res.json(); } catch { /* respuesta sin JSON */ }
  if (!res.ok) throw new Error((body && body.error) || `Error ${res.status}`);
  return body;
}

export const get = (path, params) => fetch(`/api/${path}${qs(params)}`).then(parse);
export const post = (path, data) => fetch(`/api/${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data || {}),
}).then(parse);
export const postFile = (path, file) => fetch(`/api/${path}`, { method: 'POST', body: file }).then(parse);
export const exportUrl = (name, params) => `/api/export/${name}.csv${qs(params)}`;
