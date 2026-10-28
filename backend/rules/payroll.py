"""Conciliación de una nómina SIMULADA contra los fichajes. Sin SQL ni HTTP."""
from .. import config

CONCEPTS = [
    ("dias", "Días pagados", "días", 0.0),
    ("horas_ord", "Horas ordinarias", "h", config.DEMO_HOURS_TOLERANCE),
    ("horas_extra", "Horas extra dobles", "h", config.DEMO_HOURS_TOLERANCE),
    ("horas_triples", "Horas extra triples", "h", config.DEMO_HOURS_TOLERANCE),
    ("retardos", "Retardos descontados", "", 0.0),
    ("bono", "Bono de puntualidad", "$", 0.0),
]
STATE_LABEL = {"cuadra": "Cuadra", "verificar": "Cuadra, con jornadas a verificar", "diferencia": "Diferencia"}


def net(tarifa, ord_h, dobles_h, triples_h, retardos, bono) -> float:
    return round(tarifa * ord_h + tarifa * config.DEMO_DOUBLE_FACTOR * dobles_h + tarifa * config.DEMO_TRIPLE_FACTOR * triples_h
                 - tarifa * config.DEMO_LATE_DISCOUNT_H * retardos + bono, 2)


def expected(agg: dict) -> dict:
    """Lo que la nómina debería contener según los fichajes. Una jornada sin salida se paga como jornada completa
    (criterio de la simulación) y se marca a verificar."""
    return {"dias": agg["dias"],
            "horas_ord": round(agg["horas_ord"] + config.DEMO_WORKDAY_HOURS * agg["sin_salida"], 2),
            "horas_extra": round(agg["horas_extra_dobles"], 2), "horas_triples": round(agg["horas_extra_triples"], 2),
            "retardos": agg["retardos"], "bono": config.DEMO_PUNCTUALITY_BONUS if agg["retardos"] == 0 else 0.0}


def _impact(key, diff, tarifa):
    """Importe en pesos de la diferencia de un concepto (positivo = pagado de más)."""
    return round({"dias": 0.0, "horas_ord": diff * tarifa, "horas_extra": diff * tarifa * config.DEMO_DOUBLE_FACTOR,
                  "horas_triples": diff * tarifa * config.DEMO_TRIPLE_FACTOR,
                  "retardos": -diff * tarifa * config.DEMO_LATE_DISCOUNT_H, "bono": diff}[key], 2)


def compare(nom: dict, agg: dict) -> dict:
    exp = expected(agg)
    paid = {"dias": nom["dias_pagados"], "horas_ord": nom["horas_ordinarias"], "horas_extra": nom["horas_extra"],
            "horas_triples": nom["horas_extra_triples"], "retardos": nom["retardos_descontados"], "bono": nom["bono_puntualidad"]}
    conceptos, impacto = [], {}
    for key, label, unit, tol in CONCEPTS:
        diff = round(paid[key] - exp[key], 2)
        conceptos.append({"key": key, "label": label, "unidad": unit, "nomina": paid[key], "fichajes": exp[key],
                          "diferencia": diff, "ok": abs(diff) <= tol})
        impacto[key] = _impact(key, diff, nom["tarifa_hora"])
    neto_esp = net(nom["tarifa_hora"], exp["horas_ord"], exp["horas_extra"], exp["horas_triples"], exp["retardos"], exp["bono"])
    estado = "diferencia" if any(not c["ok"] for c in conceptos) else ("verificar" if agg["sin_salida"] else "cuadra")
    return {"estado": estado, "conceptos": conceptos, "neto_esperado": neto_esp, "impacto": impacto,
            "diferencia_importe": round(nom["neto"] - neto_esp, 2)}
