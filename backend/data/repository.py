"""Capa de acceso a datos: solo SQL. Sin reglas de negocio ni enmascarado de nombres."""
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

FLAG_COLUMNS = {"unico": "f_unico", "multiple": "f_multiple", "doble": "f_doble"}


@dataclass(frozen=True)
class Filters:
    desde: str
    hasta: str
    depto: Optional[str] = None
    trabajador: Optional[int] = None


def _where(f: Filters, alias="j", depto=True, date_col="fecha"):
    clauses = [f"{alias}.{date_col} BETWEEN ? AND ?"]
    params = [f.desde, f.hasta]
    if depto and f.depto:
        clauses.append(f"{alias}.depto = ?")
        params.append(f.depto)
    if f.trabajador is not None:
        clauses.append(f"{alias}.trabajador = ?")
        params.append(f.trabajador)
    return " AND ".join(clauses), params


def _search(q, reveal, id_expr):
    """Cláusula de búsqueda por ID y, solo si se muestran nombres, por nombre."""
    if not q:
        return "", []
    like = f"%{q.strip()}%"
    if reveal:
        return f" AND (CAST({id_expr} AS TEXT) LIKE ? OR t.nombre_normalizado LIKE ?)", [like, like]
    return f" AND CAST({id_expr} AS TEXT) LIKE ?", [like]


def _order(sorts, key, direction, default):
    col = sorts.get(key, default)
    return f"{col} {'ASC' if direction == 'asc' else 'DESC'}"


def has_data(conn) -> bool:
    return conn.execute("SELECT 1 FROM jornadas LIMIT 1").fetchone() is not None


def date_range(conn):
    r = conn.execute("SELECT MIN(fecha) lo, MAX(fecha) hi FROM jornadas").fetchone()
    return r["lo"], r["hi"]


def departamentos(conn):
    return [r[0] for r in conn.execute("SELECT DISTINCT depto FROM jornadas ORDER BY depto")]


def gaps(conn):
    return [dict(r) for r in conn.execute("SELECT desde, hasta, dias FROM cobertura_huecos ORDER BY desde")]


def totals(conn, f):
    w, p = _where(f)
    r = conn.execute(
        "SELECT COALESCE(SUM(j.n),0) fichajes, COUNT(DISTINCT j.trabajador) colaboradores, COUNT(*) jornadas,"
        " COALESCE(SUM(j.estado='incidencia'),0) incidencia, COALESCE(SUM(j.estado='pendiente'),0) pendiente,"
        " COUNT(DISTINCT CASE WHEN j.estado='incidencia' THEN j.trabajador END) colaboradores_incidencia,"
        " COALESCE(SUM(j.estado='incidencia' AND r.estado IS NULL),0) por_revisar"
        " FROM jornadas j LEFT JOIN revisiones r ON r.clave = j.trabajador || '|' || j.fecha"
        f" WHERE {w}", p).fetchone()
    return dict(r)


def excluded_count(conn, f):
    w, p = _where(f, alias="f")
    return conn.execute(f"SELECT COUNT(*) FROM fichajes f WHERE {w} AND f.excluido = 1", p).fetchone()[0]


def terminal_start_dates(conn):
    """Primera fecha con registros de cada terminal de asistencia (solo terminales incluidas)."""
    return {r[0]: r[1] for r in conn.execute("SELECT terminal, MIN(fecha) FROM fichajes WHERE excluido = 0 GROUP BY terminal")}


def daily_terminals(conn, f):
    w, p = _where(f, alias="f")
    return {r[0]: sorted(r[1].split(",")) for r in conn.execute(
        f"SELECT f.fecha, group_concat(DISTINCT f.terminal) FROM fichajes f WHERE {w} AND f.excluido = 0 GROUP BY f.fecha", p)}


def daily(conn, f):
    w, p = _where(f)
    return [dict(r) for r in conn.execute(
        "SELECT fecha, SUM(n) fichajes, COUNT(DISTINCT trabajador) colaboradores,"
        f" SUM(estado!='ok') jornadas_revisar FROM jornadas j WHERE {w} GROUP BY fecha ORDER BY fecha", p)]


def by_depto(conn, f):
    w, p = _where(f, depto=False)
    return [dict(r) for r in conn.execute(
        "SELECT depto, SUM(n) fichajes, COUNT(DISTINCT trabajador) colaboradores, COUNT(*) jornadas,"
        f" SUM(estado='incidencia') incidencias FROM jornadas j WHERE {w} GROUP BY depto ORDER BY fichajes DESC", p)]


def flag_counts_by_depto(conn, f):
    """Jornadas con cada tipo de alerta, por departamento (ignora el filtro de departamento para poder compararlos)."""
    w, p = _where(f, depto=False)
    return [dict(r) for r in conn.execute(
        "SELECT depto, COUNT(*) jornadas, COALESCE(SUM(f_unico),0) unico, COALESCE(SUM(f_multiple),0) multiple,"
        f" COALESCE(SUM(f_doble),0) doble FROM jornadas j WHERE {w} GROUP BY depto", p)]


def flag_counts(conn, f):
    w, p = _where(f)
    r = conn.execute(
        "SELECT COALESCE(SUM(f_unico),0) unico, COALESCE(SUM(f_multiple),0) multiple,"
        f" COALESCE(SUM(f_doble),0) doble FROM jornadas j WHERE {w}", p).fetchone()
    return dict(r)


WORKER_SORTS = {"id": "j.trabajador", "nombre": "t.nombre_normalizado", "depto": "t.depto", "fichajes": "fichajes",
                "dias": "dias", "incidencias": "incidencias", "ultimo": "ultimo"}


def workers_page(conn, f, q, reveal, sort, direction, limit, offset):
    w, p = _where(f)
    sw, sp = _search(q, reveal, "j.trabajador")
    base = f"FROM jornadas j JOIN trabajadores t ON t.id = j.trabajador WHERE {w}{sw}"
    total = conn.execute(f"SELECT COUNT(DISTINCT j.trabajador) {base}", p + sp).fetchone()[0]
    rows = conn.execute(
        "SELECT j.trabajador id, t.nombre_normalizado nombre, t.depto depto, SUM(j.n) fichajes, COUNT(*) dias,"
        " SUM(j.estado='incidencia') incidencias, SUM(j.estado='pendiente') pendientes, MAX(j.fecha) ultimo "
        f"{base} GROUP BY j.trabajador ORDER BY {_order(WORKER_SORTS, sort, direction, 'fichajes')}, j.trabajador"
        " LIMIT ? OFFSET ?", p + sp + [limit, offset]).fetchall()
    return [dict(r) for r in rows], total


def search_workers(conn, q, reveal, limit=8):
    q = (q or "").strip()
    if not q:
        return []
    clause, params = "CAST(t.id AS TEXT) LIKE ?", [q + "%"]
    if reveal:
        clause += " OR t.nombre_normalizado LIKE ?"
        params.append(f"%{q}%")
    return [dict(r) for r in conn.execute(
        f"SELECT t.id, t.nombre_normalizado nombre, t.depto FROM trabajadores t WHERE {clause} ORDER BY t.id LIMIT ?",
        params + [limit])]


def worker(conn, tid):
    r = conn.execute("SELECT id, nombre_normalizado nombre, depto FROM trabajadores WHERE id = ?", (tid,)).fetchone()
    return dict(r) if r else None


JORNADA_SORTS = {"fecha": "j.fecha", "id": "j.trabajador", "nombre": "t.nombre_normalizado", "depto": "j.depto",
                 "n": "j.n", "estado": "j.estado", "revision": "r.estado"}


def jornadas_page(conn, f, *, estado=None, tipo=None, tipos_any=None, terminal=None, q=None, reveal=False, revision=None,
                  solo_incidencias=False, sort="fecha", direction="desc", limit=25, offset=0):
    w, p = _where(f)
    extra, ep = [], []
    if estado in ("ok", "incidencia", "pendiente"):
        extra.append("j.estado = ?"); ep.append(estado)
    if solo_incidencias:
        extra.append("j.estado != 'ok'")
    if tipo in FLAG_COLUMNS:
        extra.append(f"j.{FLAG_COLUMNS[tipo]} = 1")
    if tipos_any:
        extra.append("(" + " OR ".join(f"j.{FLAG_COLUMNS[t]} = 1" for t in tipos_any if t in FLAG_COLUMNS) + ")")
    if terminal:
        extra.append("',' || j.terminales || ',' LIKE ?"); ep.append(f"%,{terminal},%")
    if revision == "pendiente":
        extra.append("r.estado IS NULL")
    elif revision == "revisada":
        extra.append("r.estado = 'revisada'")
    sw, sp = _search(q, reveal, "j.trabajador")
    where = w + "".join(" AND " + e for e in extra) + sw
    base = ("FROM jornadas j JOIN trabajadores t ON t.id = j.trabajador "
            "LEFT JOIN revisiones r ON r.clave = j.trabajador || '|' || j.fecha")
    params = p + ep + sp
    total = conn.execute(f"SELECT COUNT(*) {base} WHERE {where}", params).fetchone()[0]
    rows = conn.execute(
        "SELECT j.trabajador, t.nombre_normalizado nombre, j.depto, j.fecha, j.n, j.horas, j.terminales, j.f_unico,"
        " j.f_multiple, j.f_doble, j.f_madrugada, j.estado, r.estado revision, r.nota "
        f"{base} WHERE {where} ORDER BY {_order(JORNADA_SORTS, sort, direction, 'j.fecha')}, j.trabajador, j.fecha"
        " LIMIT ? OFFSET ?", params + [limit, offset]).fetchall()
    return [dict(r) for r in rows], total


def jornada(conn, tid, fecha):
    r = conn.execute(
        "SELECT j.trabajador, t.nombre_normalizado nombre, j.depto, j.fecha, j.n, j.horas, j.terminales, j.f_unico,"
        " j.f_multiple, j.f_doble, j.f_madrugada, j.estado, r.estado revision, r.nota FROM jornadas j"
        " JOIN trabajadores t ON t.id = j.trabajador LEFT JOIN revisiones r ON r.clave = j.trabajador || '|' || j.fecha"
        " WHERE j.trabajador = ? AND j.fecha = ?", (tid, fecha)).fetchone()
    return dict(r) if r else None


def day_records(conn, tid, fecha):
    return [dict(r) for r in conn.execute(
        "SELECT fr.linea_origen, f.instante, f.terminal, f.excluido, f.motivo FROM fichajes f"
        " JOIN fichajes_raw fr ON fr.id = f.raw_id WHERE f.trabajador = ? AND f.fecha = ? ORDER BY f.instante",
        (tid, fecha))]


RAW_SORTS = {"linea": "fr.linea_origen", "instante": "f.instante", "trabajador": "f.trabajador",
             "terminal": "f.terminal", "estado": "f.excluido"}


def raw_page(conn, f, *, terminal=None, excluido=None, q=None, sort="linea", direction="asc", limit=25, offset=0):
    w, p = _where(f, alias="f")
    extra, ep = [], []
    if terminal:
        extra.append("f.terminal = ?"); ep.append(terminal)
    if excluido in ("0", "1"):
        extra.append("f.excluido = ?"); ep.append(int(excluido))
    if q:
        extra.append("CAST(f.trabajador AS TEXT) LIKE ?"); ep.append(f"%{q.strip()}%")
    where = w + "".join(" AND " + e for e in extra)
    base = "FROM fichajes f JOIN fichajes_raw fr ON fr.id = f.raw_id"
    params = p + ep
    total = conn.execute(f"SELECT COUNT(*) {base} WHERE {where}", params).fetchone()[0]
    rows = conn.execute(
        "SELECT fr.linea_origen linea, fr.empresa, f.trabajador, f.depto, f.instante, f.terminal, f.excluido, f.motivo "
        f"{base} WHERE {where} ORDER BY {_order(RAW_SORTS, sort, direction, 'fr.linea_origen')}, fr.linea_origen"
        " LIMIT ? OFFSET ?", params + [limit, offset]).fetchall()
    return [dict(r) for r in rows], total


def worker_days(conn, tid, desde, hasta):
    return [dict(r) for r in conn.execute(
        "SELECT fecha, n, horas, terminales, estado FROM jornadas WHERE trabajador = ? AND fecha BETWEEN ? AND ?"
        " ORDER BY fecha", (tid, desde, hasta))]


def worker_excluded_count(conn, tid, desde, hasta):
    return conn.execute("SELECT COUNT(*) FROM fichajes WHERE trabajador = ? AND excluido = 1 AND fecha BETWEEN ? AND ?",
                        (tid, desde, hasta)).fetchone()[0]


def last_ingest(conn):
    r = conn.execute("SELECT * FROM ingestas ORDER BY id DESC LIMIT 1").fetchone()
    return dict(r) if r else None


def terminal_totals(conn):
    return [dict(r) for r in conn.execute(
        "SELECT terminal, excluido, COUNT(*) registros, COUNT(DISTINCT trabajador) colaboradores, MIN(fecha) desde,"
        " MAX(fecha) hasta FROM fichajes GROUP BY terminal, excluido ORDER BY terminal")]


def terminal_by_month(conn):
    return [dict(r) for r in conn.execute(
        "SELECT substr(fecha,1,7) mes, terminal, excluido, COUNT(*) registros FROM fichajes"
        " GROUP BY mes, terminal, excluido ORDER BY mes, terminal")]


def rejected_lines(conn, limit=20):
    return [dict(r) for r in conn.execute("SELECT linea, contenido, motivo FROM lineas_rechazadas LIMIT ?", (limit,))]


def set_review(conn, clave, estado, nota):
    with conn:
        if estado is None:
            conn.execute("DELETE FROM revisiones WHERE clave = ?", (clave,))
        else:
            conn.execute(
                "INSERT INTO revisiones(clave, estado, nota, actualizado_en) VALUES (?,?,?,?)"
                " ON CONFLICT(clave) DO UPDATE SET estado=excluded.estado, nota=excluded.nota,"
                " actualizado_en=excluded.actualizado_en",
                (clave, estado, nota, datetime.now().isoformat(" ", "seconds")))


# ---- nómina simulada (demo) ---------------------------------------------------------------------------------------
def attendance_days(conn, desde=None, hasta=None, ids=None):
    """Jornadas (solo terminales de asistencia) con sus fichajes, para calcular horas y retardos."""
    sql, params = "SELECT trabajador, fecha, depto, n, horas FROM jornadas WHERE 1=1", []
    if desde:
        sql += " AND fecha BETWEEN ? AND ?"
        params += [desde, hasta]
    if ids is not None:
        sql += f" AND trabajador IN ({','.join('?' * len(ids))})"
        params += list(ids)
    return [dict(r) for r in conn.execute(sql + " ORDER BY trabajador, fecha", params)]


def worker_names(conn):
    """{id: nombre} de todos los colaboradores."""
    return {r["id"]: r["nombre"] for r in conn.execute("SELECT id, nombre FROM trabajadores")}


def payroll_replace(conn, rows):
    with conn:
        conn.execute("DELETE FROM nominas_demo")
        conn.executemany("INSERT INTO nominas_demo(trabajador, desde, hasta, tarifa_hora, dias_pagados, horas_ordinarias,"
                         " horas_extra, horas_extra_triples, retardos_descontados, bono_puntualidad, neto, entrada_habitual) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", rows)


def payroll_records(conn, record_id=None):
    sql = ("SELECT n.*, t.nombre, t.nombre_normalizado, t.depto FROM nominas_demo n JOIN trabajadores t ON t.id = n.trabajador")
    if record_id is not None:
        r = conn.execute(sql + " WHERE n.id = ?", (record_id,)).fetchone()
        return dict(r) if r else None
    return [dict(r) for r in conn.execute(sql + " ORDER BY n.desde, n.trabajador")]
