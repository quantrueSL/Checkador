import sqlite3

from .. import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS ingestas (
    id INTEGER PRIMARY KEY,
    archivo TEXT, ruta TEXT, sha256 TEXT, codificacion TEXT, cargado_en TEXT, preambulo TEXT,
    registros INTEGER, rechazadas INTEGER, no_parseables INTEGER, discrepancias_fecha INTEGER,
    incluidos INTEGER, excluidos INTEGER, version_reglas TEXT, descartados_previos INTEGER DEFAULT 0, corte TEXT
);
CREATE TABLE IF NOT EXISTS lineas_rechazadas (
    ingesta_id INTEGER, linea INTEGER, contenido TEXT, motivo TEXT
);
-- Copia fiel del CSV: texto tal cual viene, sin transformar.
CREATE TABLE IF NOT EXISTS fichajes_raw (
    id INTEGER PRIMARY KEY, ingesta_id INTEGER, linea_origen INTEGER,
    empresa TEXT, trabajador TEXT, nombre TEXT, depto TEXT, fecha TEXT, checada TEXT, terminal TEXT
);
-- Registros tipados. Los excluidos NO se borran: llevan excluido=1 y su motivo.
CREATE TABLE IF NOT EXISTS fichajes (
    raw_id INTEGER PRIMARY KEY, trabajador INTEGER, depto TEXT, fecha TEXT, instante TEXT,
    terminal TEXT, excluido INTEGER, motivo TEXT
);
CREATE INDEX IF NOT EXISTS ix_fichajes_trab_fecha ON fichajes(trabajador, fecha);
CREATE INDEX IF NOT EXISTS ix_fichajes_fecha ON fichajes(fecha);
CREATE TABLE IF NOT EXISTS trabajadores (
    id INTEGER PRIMARY KEY, nombre TEXT, nombre_normalizado TEXT, depto TEXT
);
-- Una fila por colaborador y día, solo con terminales de asistencia.
CREATE TABLE IF NOT EXISTS jornadas (
    trabajador INTEGER, fecha TEXT, depto TEXT, n INTEGER,
    primero TEXT, ultimo TEXT, terminales TEXT, horas TEXT,
    f_unico INTEGER, f_multiple INTEGER, f_doble INTEGER, f_madrugada INTEGER, estado TEXT,
    PRIMARY KEY (trabajador, fecha)
);
CREATE INDEX IF NOT EXISTS ix_jornadas_fecha ON jornadas(fecha);
CREATE TABLE IF NOT EXISTS cobertura_huecos (desde TEXT, hasta TEXT, dias INTEGER);
-- NÓMINAS SIMULADAS para la demo (no son datos de PATE). Se regeneran con python run.py nominas.
CREATE TABLE IF NOT EXISTS nominas_demo (
    id INTEGER PRIMARY KEY, trabajador INTEGER, desde TEXT, hasta TEXT, tarifa_hora REAL,
    dias_pagados INTEGER, horas_ordinarias REAL, horas_extra REAL, horas_extra_triples REAL DEFAULT 0, retardos_descontados INTEGER,
    bono_puntualidad REAL, neto REAL, entrada_habitual TEXT
);
CREATE TABLE IF NOT EXISTS revisiones (
    clave TEXT PRIMARY KEY, estado TEXT, nota TEXT, actualizado_en TEXT
);
"""


def connect() -> sqlite3.Connection:
    config.DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(config.DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    cols = {r[1] for r in conn.execute("PRAGMA table_info(ingestas)")}
    for name, ddl in (("descartados_previos", "INTEGER DEFAULT 0"), ("corte", "TEXT")):
        if name not in cols:
            conn.execute(f"ALTER TABLE ingestas ADD COLUMN {name} {ddl}")
    ncols = {r[1] for r in conn.execute("PRAGMA table_info(nominas_demo)")}
    if "horas_extra_triples" not in ncols:
        conn.execute("ALTER TABLE nominas_demo ADD COLUMN horas_extra_triples REAL DEFAULT 0")
    return conn
