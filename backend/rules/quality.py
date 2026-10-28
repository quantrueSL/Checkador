"""Reglas de calidad de fichajes. No interpretan horarios ni infieren ausencias u horas extra."""
from datetime import datetime

from .. import config

# estado 'incidencia': anomalía objetiva en los datos.
# (El fichaje en madrugada no es una alerta: sin turnos validados no se puede decir que sea anómalo.)
INCIDENT_TYPES = [
    {
        "key": "unico", "label": "Fichaje único en el día", "estado": "incidencia", "severidad": "media",
        "regla": "El colaborador tiene un solo fichaje en el día en terminales de asistencia.",
        "por_validar": "Puede ser un turno que cruza la medianoche o un olvido; no se infiere ausencia.",
    },
    {
        "key": "multiple", "label": "Más de dos fichajes", "estado": "incidencia", "severidad": "media",
        "regla": "El colaborador tiene tres o más fichajes en el día.",
        "por_validar": "Pueden ser dobles pulsaciones o turnos partidos; no se asume cuál es entrada o salida.",
    },
    {
        "key": "doble", "label": "Posible doble pulsación", "estado": "incidencia", "severidad": "baja",
        "regla": f"Dos fichajes consecutivos separados por {config.DOUBLE_TAP_SECONDS} segundos o menos.",
        "por_validar": f"El umbral de {config.DOUBLE_TAP_SECONDS} s es una propuesta y debe validarse.",
    },
]
FLAG_KEYS = [t["key"] for t in INCIDENT_TYPES]

# Severidad PROPUESTA (pendiente de validar con el cliente): media > baja > info.
SEVERITY_ORDER = ["media", "baja"]
SEVERITY_LABEL = {"media": "Media", "baja": "Baja"}


def severity_of(tipos: list):
    sev = [t["severidad"] for t in INCIDENT_TYPES if t["key"] in tipos]
    return min(sev, key=SEVERITY_ORDER.index) if sev else None


def types_with_severity(severidad: str) -> list:
    return [t["key"] for t in INCIDENT_TYPES if t["severidad"] == severidad]


def _secs(hms: str) -> int:
    h, m, s = (int(x) for x in hms.split(":"))
    return h * 3600 + m * 60 + s


def explain(tipo: str, horas: list) -> str:
    """Motivo concreto de la incidencia para una jornada, a partir de sus horas de fichaje (HH:MM:SS)."""
    if tipo == "unico":
        return f"Un solo fichaje, a las {horas[0][:5]}."
    if tipo == "multiple":
        return f"{len(horas)} fichajes en el día ({', '.join(x[:5] for x in horas)})."
    if tipo == "doble":
        for a, b in zip(horas, horas[1:]):
            gap = _secs(b) - _secs(a)
            if gap <= config.DOUBLE_TAP_SECONDS:
                return f"Fichajes a las {a} y {b}: {gap} s de diferencia."
    return ""


def classify(times: list) -> dict:
    """Clasifica un día de un colaborador a partir de sus instantes de fichaje."""
    times = sorted(times)
    n = len(times)
    gaps = [(b - a).total_seconds() for a, b in zip(times, times[1:])]
    flags = {
        "unico": n == 1,
        "multiple": n >= 3,
        "doble": any(g <= config.DOUBLE_TAP_SECONDS for g in gaps),
    }
    estado = "incidencia" if any(flags.values()) else "ok"
    return {"n": n, "flags": flags, "estado": estado}


def parse_checada(value: str) -> datetime:
    return datetime.strptime(value.strip(), "%d/%m/%Y %H:%M:%S")
