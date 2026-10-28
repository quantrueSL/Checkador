"""Uso:  python run.py            -> carga el CSV si hace falta y arranca la web
        python run.py ingest [--force]  -> solo procesa el CSV y muestra el resumen de la ingesta
        python run.py nominas           -> regenera las nóminas SIMULADAS de la demo"""
import json
import sys

from backend import config
from backend.api.server import serve
from backend.data import repository as repo
from backend.data.db import connect
from backend.services import ingestion, payroll_demo


def _nominas():
    """Regenera las nóminas SIMULADAS de la demo a partir de los fichajes cargados."""
    conn = connect()
    try:
        res = payroll_demo.generate(conn)
    finally:
        conn.close()
    res.pop("inyectados", None)
    print("Nóminas simuladas:", json.dumps(res, ensure_ascii=False))


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "serve"
    if cmd == "ingest":
        print(json.dumps(ingestion.ingest(force="--force" in sys.argv), ensure_ascii=False, indent=2))
        _nominas()
        return
    if cmd == "nominas":
        _nominas()
        return
    conn = connect()
    empty = not repo.has_data(conn)
    conn.close()
    if empty and config.CSV_PATH.exists():
        print("Procesando", config.CSV_PATH.name, "...")
        print(json.dumps(ingestion.ingest(), ensure_ascii=False)[:300])
    conn = connect()
    needs_payroll = repo.has_data(conn) and conn.execute("SELECT 1 FROM nominas_demo LIMIT 1").fetchone() is None
    conn.close()
    if needs_payroll:
        _nominas()
    serve()


if __name__ == "__main__":
    main()
