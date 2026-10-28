"""Capa HTTP mínima (librería estándar). Traduce peticiones a llamadas de servicio."""
import csv
import io
import json
import mimetypes
import re
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from .. import config
from ..data import repository as repo
from ..data.db import connect
from ..services import analytics, ingestion, payroll_demo

ISO = re.compile(r"^\d{4}-\d{2}-\d{2}$")
MIME = {".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".svg": "image/svg+xml",
        ".json": "application/json", ".png": "image/png", ".ico": "image/x-icon"}


class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status, self.message = status, message


def _q(qs, key, default=None):
    v = qs.get(key)
    return v[0] if v and v[0] != "" else default


def _int(qs, key, default=None, lo=None, hi=None):
    v = _q(qs, key)
    if v is None:
        return default
    try:
        n = int(v)
    except ValueError:
        raise ApiError(400, f"Parámetro '{key}' no es un número")
    return max(lo, n) if lo is not None and n < lo else (min(hi, n) if hi is not None and n > hi else n)


def _filters(conn, qs, with_worker=True):
    lo, hi = repo.date_range(conn)
    if lo is None:
        raise ApiError(409, "Todavía no hay datos cargados.")
    desde, hasta = _q(qs, "desde", lo), _q(qs, "hasta", hi)
    if not (ISO.match(desde) and ISO.match(hasta)) or desde > hasta:
        raise ApiError(400, "Rango de fechas no válido")
    return repo.Filters(desde, hasta, _q(qs, "depto"), _int(qs, "trabajador") if with_worker else None)


def _reveal(qs):
    return _q(qs, "nombres") == "1"


def _page(qs):
    size = _int(qs, "pageSize", 25, 1, 100)
    return {"limit": size, "offset": (_int(qs, "page", 1, 1) - 1) * size,
            "direction": "asc" if _q(qs, "dir") == "asc" else "desc"}


# ---- rutas GET -------------------------------------------------------------------------------------------------
def r_meta(conn, qs): return analytics.meta(conn)
def r_resumen(conn, qs):
    try:
        comida = float(_q(qs, "comida", ""))
    except ValueError:
        comida = None
    return analytics.resumen(conn, _filters(conn, qs), comida)


def r_colaboradores(conn, qs):
    return analytics.colaboradores(conn, _filters(conn, qs), _reveal(qs), q=_q(qs, "q"), sort=_q(qs, "sort", "fichajes"),
                                   **_page(qs))


def r_buscar(conn, qs):
    return {"rows": [analytics.person(r, _reveal(qs)) for r in repo.search_workers(conn, _q(qs, "q"), _reveal(qs))]}


def r_colaborador(conn, qs, tid):
    f = _filters(conn, qs, with_worker=False)
    data = analytics.colaborador(conn, tid, f.desde, f.hasta, _reveal(qs))
    if not data:
        raise ApiError(404, "Colaborador no encontrado")
    return data


def r_jornadas(conn, qs):
    return analytics.jornadas(conn, _filters(conn, qs), _reveal(qs), estado=_q(qs, "estado"), tipo=_q(qs, "tipo"),
                              terminal=_q(qs, "terminal"), q=_q(qs, "q"), sort=_q(qs, "sort", "fecha"), **_page(qs))


def r_incidencias(conn, qs):
    return analytics.jornadas(conn, _filters(conn, qs), _reveal(qs), solo_incidencias=True, estado=_q(qs, "estado"),
                              tipo=_q(qs, "tipo"), severidad=_q(qs, "severidad"), revision=_q(qs, "revision"),
                              q=_q(qs, "q"), sort=_q(qs, "sort", "fecha"), **_page(qs))


def r_detalle(conn, qs):
    fecha = _q(qs, "fecha", "")
    tid = _int(qs, "trabajador")
    if tid is None or not ISO.match(fecha):
        raise ApiError(400, "Faltan 'trabajador' y 'fecha'")
    data = analytics.jornada_detalle(conn, tid, fecha, _reveal(qs))
    if not data:
        raise ApiError(404, "Jornada no encontrada")
    return data


def r_registros(conn, qs):
    rows, total = repo.raw_page(conn, _filters(conn, qs), terminal=_q(qs, "terminal"), excluido=_q(qs, "excluido"),
                                q=_q(qs, "q"), sort=_q(qs, "sort", "linea"), **{**_page(qs), "direction": "asc" if _q(qs, "dir", "asc") == "asc" else "desc"})
    return {"rows": rows, "total": total}


def r_trazabilidad(conn, qs):
    data = analytics.trazabilidad(conn)
    if not data:
        raise ApiError(409, "Todavía no hay datos cargados.")
    return data


def r_nomina(conn, qs): return analytics.nomina_estado()


def r_conciliacion(conn, qs):
    return analytics.nomina_conciliacion(conn, _reveal(qs), periodo=_q(qs, "periodo"), estado=_q(qs, "estado"), q=_q(qs, "q"),
                                         sort=_q(qs, "sort", "diferencia"), **_page(qs))


def r_nomina_casos(conn, qs):
    return analytics.nomina_casos(conn, _reveal(qs), mes=_q(qs, "mes"), depto=_q(qs, "depto"), motivo=_q(qs, "motivo"), q=_q(qs, "q"),
                                  sort=_q(qs, "sort", "importe"), **_page(qs))


def r_nomina_extras(conn, qs):
    return analytics.nomina_extras(conn, _q(qs, "mes"))


def r_nomina_detalle(conn, qs):
    data = analytics.nomina_detalle(conn, _int(qs, "id", -1), _reveal(qs))
    if not data:
        raise ApiError(404, "Nómina no encontrada")
    return data


GET_ROUTES = {
    "/api/meta": r_meta, "/api/resumen": r_resumen, "/api/colaboradores": r_colaboradores,
    "/api/colaboradores/buscar": r_buscar, "/api/jornadas": r_jornadas, "/api/jornadas/detalle": r_detalle,
    "/api/incidencias": r_incidencias, "/api/registros": r_registros, "/api/trazabilidad": r_trazabilidad,
    "/api/nomina/estado": r_nomina, "/api/nomina/conciliacion": r_conciliacion, "/api/nomina/detalle": r_nomina_detalle,
    "/api/nomina/extras": r_nomina_extras, "/api/nomina/casos": r_nomina_casos,
}


def export_csv(conn, qs, name):
    reveal = _reveal(qs)
    f = _filters(conn, qs)
    common = dict(estado=_q(qs, "estado"), tipo=_q(qs, "tipo"), severidad=_q(qs, "severidad"), terminal=_q(qs, "terminal"), q=_q(qs, "q"),
                  sort=_q(qs, "sort", "fecha"), limit=10 ** 9, offset=0, direction="asc" if _q(qs, "dir") == "asc" else "desc")
    if name == "incidencias":
        data = analytics.jornadas(conn, f, reveal, solo_incidencias=True, revision=_q(qs, "revision"), **common)
    elif name == "jornadas":
        data = analytics.jornadas(conn, f, reveal, **common)
    else:
        raise ApiError(404, "Exportación desconocida")
    labels = {t["key"]: t["label"] for t in analytics.quality.INCIDENT_TYPES}
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Fecha", "Trabajador", "Colaborador", "Departamento", "Fichajes", "Horas", "Terminales", "Estado",
                "Severidad (propuesta)", "Incidencias", "Motivo", "Gestión", "Nota"])
    for r in data["rows"]:
        w.writerow([r["fecha"], r["trabajador"], r["nombre"], r["depto"], r["n"], " ".join(r["horas"]),
                    " ".join(r["terminales"]), r["estado"], analytics.quality.SEVERITY_LABEL.get(r["severidad"], ""),
                    "; ".join(labels[t] for t in r["tipos"]), " ".join(r["motivos"].values()),
                    "Revisada por una persona" if r.get("revision") else "Detectada automáticamente", r.get("nota") or ""])
    return ("﻿" + buf.getvalue()).encode("utf-8")


# ---- servidor ----------------------------------------------------------------------------------------------------
class Handler(BaseHTTPRequestHandler):
    server_version = "PATE/0.1"

    def log_message(self, fmt, *args):
        pass

    def _send(self, status, body: bytes, ctype, extra=None):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def _json(self, status, obj):
        self._send(status, json.dumps(obj, ensure_ascii=False).encode("utf-8"), "application/json; charset=utf-8")

    def _dispatch(self, fn):
        try:
            conn = connect()
            try:
                fn(conn)
            finally:
                conn.close()
        except ApiError as e:
            self._json(e.status, {"error": e.message})
        except ValueError as e:
            self._json(400, {"error": str(e)})
        except Exception as e:  # noqa: BLE001 - nunca filtrar trazas al navegador
            self._json(500, {"error": "Error interno del servidor", "detalle": type(e).__name__})
            raise

    def do_GET(self):
        url = urlparse(self.path)
        qs = parse_qs(url.query)
        path = url.path
        if not path.startswith("/api/"):
            return self._static(path)
        m = re.fullmatch(r"/api/colaboradores/(\d+)", path)
        x = re.fullmatch(r"/api/export/(\w+)\.csv", path)
        if m:
            self._dispatch(lambda c: self._json(200, r_colaborador(c, qs, int(m.group(1)))))
        elif x:
            def go(c):
                body = export_csv(c, qs, x.group(1))
                self._send(200, body, "text/csv; charset=utf-8",
                           {"Content-Disposition": f'attachment; filename="{x.group(1)}.csv"'})
            self._dispatch(go)
        elif path in GET_ROUTES:
            self._dispatch(lambda c: self._json(200, GET_ROUTES[path](c, qs)))
        else:
            self._json(404, {"error": "Ruta no encontrada"})

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n > config.MAX_UPLOAD_BYTES:
            raise ApiError(413, "Archivo demasiado grande")
        return self.rfile.read(n)

    def do_POST(self):
        path = urlparse(self.path).path

        def review(c):
            data = json.loads(self._body() or b"{}")
            tid, fecha, estado = data.get("trabajador"), data.get("fecha", ""), data.get("estado")
            if not isinstance(tid, int) or not ISO.match(fecha) or estado not in ("revisada", None):
                raise ApiError(400, "Datos de revisión no válidos")
            if not repo.jornada(c, tid, fecha):
                raise ApiError(404, "Jornada no encontrada")
            repo.set_review(c, f"{tid}|{fecha}", estado, (data.get("nota") or "")[:500] or None)
            self._json(200, {"ok": True})

        def reprocess(c):
            last = repo.last_ingest(c)
            if not last:
                raise ApiError(409, "No hay ninguna ingesta previa")
            res = ingestion.ingest(last["ruta"], force=True)
            payroll_demo.generate(c)
            self._json(200, res)

        def upload(c):
            body = self._body()
            if not body:
                raise ApiError(400, "Archivo vacío")
            config.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
            dest = config.UPLOAD_DIR / f"checadas_{time.strftime('%Y%m%d_%H%M%S')}.csv"
            dest.write_bytes(body)
            try:
                res = ingestion.ingest(dest, force=True)
                payroll_demo.generate(c)
                self._json(200, res)
            except ValueError:
                dest.unlink(missing_ok=True)
                raise

        routes = {"/api/incidencias/revision": review, "/api/ingesta/reprocesar": reprocess, "/api/ingesta/subir": upload}
        if path in routes:
            self._dispatch(routes[path])
        else:
            self._json(404, {"error": "Ruta no encontrada"})

    def _static(self, path):
        root = config.FRONTEND_DIR.resolve()
        target = (root / ("index.html" if path in ("", "/") else path.lstrip("/"))).resolve()
        if root not in target.parents and target != root or not target.is_file():
            return self._json(404, {"error": "No encontrado"})
        ctype = MIME.get(target.suffix) or mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        self._send(200, target.read_bytes(), ctype + ("; charset=utf-8" if ctype.startswith("text/") else ""))


def serve(host=None, port=None):
    srv = ThreadingHTTPServer((host or config.HOST, port or config.PORT), Handler)
    print(f"PATE Workforce Intelligence en http://{srv.server_address[0]}:{srv.server_address[1]}  (Ctrl+C para salir)")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        srv.server_close()
