"""Lectura del CSV de IBIX. Solo lee: nunca modifica el archivo original."""
import csv
import hashlib
import io
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class CsvFile:
    path: Path
    sha256: str
    encoding: str
    preambulo: list = field(default_factory=list)
    rows: list = field(default_factory=list)        # (linea, empresa, trabajador, nombre, depto, fecha, checada, terminal)
    rechazadas: list = field(default_factory=list)  # (linea, contenido, motivo)


def _decode(raw: bytes):
    for enc in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            return raw.decode(enc), enc
        except UnicodeDecodeError:
            continue
    raise ValueError("No se pudo decodificar el archivo")


def read_checadas(path: Path) -> CsvFile:
    raw = Path(path).read_bytes()
    text, enc = _decode(raw)
    out = CsvFile(path=Path(path), sha256=hashlib.sha256(raw).hexdigest(), encoding=enc)
    reader = csv.reader(io.StringIO(text, newline=""))
    header_found = False
    for rec in reader:
        linea = reader.line_num
        if not header_found:
            if rec and rec[0].strip() == "Empresa":
                header_found = True
            elif any(c.strip() for c in rec):
                out.preambulo.append(",".join(rec).rstrip(","))
            continue
        if not any(c.strip() for c in rec):
            continue
        if len(rec) < 7:
            out.rechazadas.append((linea, ",".join(rec), "Menos de 7 columnas"))
        elif not rec[1].strip().isdigit():
            out.rechazadas.append((linea, ",".join(rec), "Trabajador no numérico"))
        else:
            out.rows.append((linea, *rec[:7]))
    if not header_found:
        raise ValueError("No se encontró la cabecera 'Empresa,Trabajador,Nombre,...' en el CSV")
    return out
