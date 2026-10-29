"""Genera la versión publicable de la demo (GitHub Pages) en docs/.

Calcula las pantallas con los datos actuales, las cifra y copia el frontend con un acceso por usuario y contraseña.
Uso:  PATE_STATIC_USER=... PATE_STATIC_PASS=... python export_static.py
Necesita Node (solo para cifrar, sin instalar nada). Ni el CSV ni la base de datos salen de la carpeta del proyecto."""
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from backend import config
from backend.data import repository as repo
from backend.data.db import connect
from backend.services import analytics

ROOT = Path(__file__).parent
DOCS = ROOT / "docs"
COMIDAS = (1.0, 1.5, 2.0)


def build_bundle(conn) -> dict:
    lo, hi = repo.date_range(conn)
    if lo is None:
        sys.exit("No hay datos cargados: ejecuta python run.py ingest")
    args = dict(depto=None, motivo=None, q=None, sort="importe", direction="desc", limit=1000, offset=0)
    todos = analytics.nomina_casos(conn, False, mes=None, **args)
    if not todos["hay_datos"]:
        sys.exit("No hay nóminas simuladas: ejecuta python run.py nominas")
    meses = todos["meses"]
    return {
        "meta": analytics.meta(conn),
        "resumen": {f"{c:g}": analytics.resumen(conn, repo.Filters(lo, hi, None, None), c) for c in COMIDAS},
        "horas_extra": {f"{c:g}": analytics.horas_extra(conn, repo.Filters(lo, hi, None, None), False, c) for c in COMIDAS},
        "extras": {"": analytics.nomina_extras(conn, None), **{m: analytics.nomina_extras(conn, m) for m in meses}},
        "casos": {"": todos, **{m: analytics.nomina_casos(conn, False, mes=m, **args) for m in meses}},
        "detalle": {str(r["id"]): analytics.nomina_detalle(conn, r["id"], False) for r in todos["rows"]},
    }


def main():
    if not (os.environ.get("PATE_STATIC_USER") and os.environ.get("PATE_STATIC_PASS")):
        sys.exit("Define PATE_STATIC_USER y PATE_STATIC_PASS (no se guardan en ningún archivo).")
    conn = connect()
    try:
        bundle = build_bundle(conn)
    finally:
        conn.close()
    shutil.copytree(config.FRONTEND_DIR, DOCS, dirs_exist_ok=True)
    shutil.copyfile(ROOT / "static" / "api.js", DOCS / "js" / "api.js")       # modo sin servidor
    (DOCS / ".nojekyll").write_text("", encoding="utf-8")
    with tempfile.TemporaryDirectory() as tmp:
        plain = Path(tmp) / "bundle.json"
        plain.write_text(json.dumps(bundle, ensure_ascii=False), encoding="utf-8")
        subprocess.run(["node", str(ROOT / "static" / "encrypt.mjs"), str(plain), str(DOCS / "data.enc")], check=True)
    print("Listo: docs/ (publicar con GitHub Pages, carpeta /docs de la rama main)")


if __name__ == "__main__":
    main()
