"""Horas trabajadas y retardos de una jornada. SUPUESTOS DE DEMO (ver config.DEMO_*): PATE aún no ha validado horarios.

Horario supuesto de cada colaborador: su hora de entrada habitual (mediana de su primer fichaje, subida a la siguiente media hora)
y una jornada de config.DEMO_WORKDAY_HOURS. No se declara ausencia ni incumplimiento: solo se calcula lo que los
fichajes permiten calcular; una jornada sin salida identificable queda como 'no computable'.
"""
import math
from datetime import date, timedelta
from statistics import median

from .. import config


def seconds(hms: str) -> int:
    return int(hms[0:2]) * 3600 + int(hms[3:5]) * 60 + (int(hms[6:8]) if len(hms) >= 8 else 0)


def habitual_entry(first_punch_minutes: list):
    """Minutos desde las 00:00 de la entrada habitual (mediana subida a la siguiente media hora), o None si no hay datos."""
    if not first_punch_minutes:
        return None
    return int(math.ceil(median(first_punch_minutes) / 30.0)) * 30


def fmt_minutes(m: int) -> str:
    return f"{m // 60:02d}:{m % 60:02d}"


def parse_minutes(hhmm: str) -> int:
    return int(hhmm[:2]) * 60 + int(hhmm[3:5])


def week_start(fecha: str) -> str:
    """Lunes de la semana de una fecha ISO."""
    d = date.fromisoformat(fecha)
    return (d - timedelta(days=d.weekday())).isoformat()


def day_metrics(horas: list, entry_min: int, meal_h: float = None) -> dict:
    """horas: fichajes del día (HH:MM:SS, ordenados). Devuelve horas ordinarias/extra y retardo si es computable.
    meal_h: horas de comida a descontar (por defecto config.DEMO_MEAL_HOURS)."""
    meal = config.DEMO_MEAL_HOURS if meal_h is None else meal_h
    first, last = seconds(horas[0]), seconds(horas[-1])
    span_h = (last - first) / 3600.0
    if len(horas) < 2 or span_h * 60 < config.DEMO_MIN_SPAN_MIN:
        return {"computable": False, "neto_h": None, "ord_h": 0.0, "extra_h": 0.0, "retardo": False, "retardo_min": 0}
    neto = span_h - (meal if span_h > config.DEMO_MEAL_THRESHOLD_H else 0.0)
    late = max(0.0, first / 60.0 - entry_min)
    return {"computable": True, "neto_h": round(neto, 2), "ord_h": min(neto, config.DEMO_WORKDAY_HOURS),
            "extra_h": max(neto - config.DEMO_WORKDAY_HOURS, 0.0),
            "retardo": late > config.DEMO_LATE_TOLERANCE_MIN, "retardo_min": int(round(late))}


def split_weekly_extra(week_extra: dict) -> tuple:
    """week_extra: {semana: horas extra}. Dobles hasta el tope semanal; lo que lo exceda, triples (LFT arts. 67 y 68)."""
    cap = config.DEMO_DOUBLE_CAP_WEEK_H
    return (sum(min(v, cap) for v in week_extra.values()), sum(max(v - cap, 0.0) for v in week_extra.values()))


def worker_metrics(days: list, entry_min: int, meal_h: float = None) -> list:
    """days: [{'fecha','horas':[...]}] de un colaborador (todas las fechas). Calcula cada día y reparte las horas extra
    en dobles y triples según lo acumulado en su semana (lunes a domingo), de modo que el tope semanal no se corta
    al cambiar de periodo."""
    out, cum = [], {}
    for d in sorted(days, key=lambda x: x["fecha"]):
        m = day_metrics(d["horas"], entry_min, meal_h)
        dob = tri = 0.0
        if m["computable"]:
            ws = week_start(d["fecha"])
            used = cum.get(ws, 0.0)
            dob = min(m["extra_h"], max(config.DEMO_DOUBLE_CAP_WEEK_H - used, 0.0))
            tri = m["extra_h"] - dob
            cum[ws] = used + m["extra_h"]
        out.append({"fecha": d["fecha"], "horas": d["horas"], **m, "extra_dobles": dob, "extra_triples": tri})
    return out


def aggregate(metric_days: list) -> dict:
    """metric_days: salida de worker_metrics restringida a un periodo."""
    out = {"dias": len(metric_days), "computables": 0, "sin_salida": 0, "horas_ord": 0.0, "horas_extra": 0.0, "retardos": 0,
           "horas_extra_dobles": 0.0, "horas_extra_triples": 0.0, "detalle": metric_days}
    for m in metric_days:
        if m["computable"]:
            out["computables"] += 1
            out["horas_ord"] += m["ord_h"]
            out["horas_extra"] += m["extra_h"]
            out["horas_extra_dobles"] += m["extra_dobles"]
            out["horas_extra_triples"] += m["extra_triples"]
            out["retardos"] += 1 if m["retardo"] else 0
        else:
            out["sin_salida"] += 1
    return out


def entry_by_worker(days: list) -> dict:
    """days: [{'trabajador','horas': 'HH:MM:SS,...'}] de todo el periodo cargado -> entrada habitual (minutos) por colaborador."""
    firsts = {}
    for d in days:
        hs = d["horas"].split(",")
        if day_metrics(hs, 0)["computable"]:
            firsts.setdefault(d["trabajador"], []).append(seconds(hs[0]) / 60.0)
    return {t: habitual_entry(v) for t, v in firsts.items()}
