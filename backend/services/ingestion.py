"""Carga del CSV: copia fiel (fichajes_raw) -> registros tipados -> jornadas. Todo auditable."""
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path

from .. import config
from ..data.csv_reader import read_checadas
from ..data.db import connect
from ..rules import privacy, quality


def _gaps(dates: set) -> list:
    """Rachas de días naturales sin ningún registro (>= GAP_MIN_DAYS) entre la primera y la última fecha."""
    if not dates:
        return []
    d0, d1 = min(dates), max(dates)
    gaps, run = [], []
    d = d0
    while d <= d1:
        if d in dates:
            if len(run) >= config.GAP_MIN_DAYS:
                gaps.append((run[0], run[-1], len(run)))
            run = []
        else:
            run.append(d)
        d += timedelta(days=1)
    return [(a.isoformat(), b.isoformat(), n) for a, b, n in gaps]


def ingest(path: Path = None, force: bool = False) -> dict:
    path = Path(path or config.CSV_PATH)
    csvf = read_checadas(path)          # si falla, no se toca la base de datos
    conn = connect()
    try:
        last = conn.execute("SELECT sha256, version_reglas FROM ingestas ORDER BY id DESC LIMIT 1").fetchone()
        if last and not force and last["sha256"] == csvf.sha256 and last["version_reglas"] == config.RULES_VERSION:
            return {"estado": "sin_cambios", "sha256": csvf.sha256}

        raw_rows, fich_rows, no_parse, discrep, previos = [], [], [], 0, 0
        workers = {}
        by_day = defaultdict(list)       # (trabajador, fecha) -> [(datetime, terminal)]
        for i, (linea, emp, trab, nombre, depto, fecha, checada, term) in enumerate(csvf.rows, start=1):
            try:
                inst = quality.parse_checada(checada)
                fch = datetime.strptime(fecha.strip(), "%d/%m/%Y").date()
            except ValueError:
                raw_rows.append((i, linea, emp, trab, nombre, depto, fecha, checada, term))
                no_parse.append((linea, f"{trab},{fecha},{checada}", "Fecha o checada no interpretable"))
                continue
            if inst.date().isoformat() < config.DATA_START:
                previos += 1            # limpieza: anterior a la regularización, se descarta
                continue
            raw_rows.append((i, linea, emp, trab, nombre, depto, fecha, checada, term))
            if fch != inst.date():
                discrep += 1
            tid, term_s = int(trab), term.strip()
            excl = 1 if term_s in config.EXCLUDED_TERMINALS else 0
            fich_rows.append((i, tid, depto.strip(), inst.date().isoformat(), inst.isoformat(" "),
                              term_s, excl, config.EXCLUSION_REASON if excl else None))
            workers.setdefault(tid, (nombre, privacy.normalize_name(nombre), depto.strip()))
            if not excl:
                by_day[(tid, inst.date().isoformat())].append((inst, term_s, depto.strip()))

        jornadas = []
        for (tid, fch), items in by_day.items():
            items.sort()
            c = quality.classify([t for t, _, _ in items])
            f = c["flags"]
            jornadas.append((
                tid, fch, workers[tid][2], c["n"], items[0][0].strftime("%H:%M:%S"), items[-1][0].strftime("%H:%M:%S"),
                ",".join(sorted({t for _, t, _ in items})), ",".join(t.strftime("%H:%M:%S") for t, _, _ in items),
                int(f["unico"]), int(f["multiple"]), int(f["doble"]), 0, c["estado"],
            ))

        gaps = _gaps({date.fromisoformat(fch) for _, fch in by_day})
        rechazadas = csvf.rechazadas + no_parse
        n_excl = sum(1 for r in fich_rows if r[6])

        with conn:
            for t in ("fichajes_raw", "fichajes", "trabajadores", "jornadas", "cobertura_huecos", "lineas_rechazadas"):
                conn.execute(f"DELETE FROM {t}")
            cur = conn.execute(
                "INSERT INTO ingestas(archivo, ruta, sha256, codificacion, cargado_en, preambulo, registros, rechazadas,"
                " no_parseables, discrepancias_fecha, incluidos, excluidos, version_reglas, descartados_previos, corte) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (path.name, str(path), csvf.sha256, csvf.encoding, datetime.now().isoformat(" ", "seconds"),
                 "\n".join(csvf.preambulo), len(csvf.rows), len(csvf.rechazadas), len(no_parse), discrep,
                 len(fich_rows) - n_excl, n_excl, config.RULES_VERSION, previos, config.DATA_START))
            iid = cur.lastrowid
            conn.executemany("INSERT INTO fichajes_raw VALUES (?,?,?,?,?,?,?,?,?,?)", [(r[0], iid, *r[1:]) for r in raw_rows])
            conn.executemany("INSERT INTO fichajes VALUES (?,?,?,?,?,?,?,?)", fich_rows)
            conn.executemany("INSERT INTO trabajadores VALUES (?,?,?,?)", [(k, *v) for k, v in workers.items()])
            conn.executemany("INSERT INTO jornadas VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", jornadas)
            conn.executemany("INSERT INTO cobertura_huecos VALUES (?,?,?)", gaps)
            conn.executemany("INSERT INTO lineas_rechazadas VALUES (?,?,?,?)", [(iid, *r) for r in rechazadas])

        return {
            "estado": "cargado", "archivo": path.name, "sha256": csvf.sha256, "registros": len(csvf.rows),
            "descartados_previos": previos, "corte": config.DATA_START,
            "excluidos": n_excl, "incluidos": len(fich_rows) - n_excl, "rechazadas": len(rechazadas),
            "jornadas": len(jornadas), "colaboradores": len(workers), "huecos": gaps,
        }
    finally:
        conn.close()
