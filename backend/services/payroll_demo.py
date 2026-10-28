"""Genera NÓMINAS SIMULADAS (solo demo) a partir de los fichajes reales, con errores intencionados para que la
conciliación tenga casos que detectar. Nada de esto procede de PATE. Es reproducible: misma semilla, mismo resultado."""
import random
from collections import Counter, defaultdict

from .. import config
from ..data import repository as repo
from ..rules import attendance, payroll

# Errores que se inyectan (la conciliación debe detectarlos sin conocer esta lista).
ERRORS = ["horas_de_mas", "horas_de_menos", "retardo_sin_descontar", "descuento_indebido", "bono_indebido",
          "extras_sin_pagar", "dia_sin_fichaje", "extras_de_mas", "extras_sin_respaldo", "triples_como_dobles", "extras_parciales"]
ERROR_RATE = 0.4


def _apply_error(kind, rec, rng):
    """Modifica el registro de nómina (dict) si el error es aplicable. Devuelve True si lo aplicó."""
    extras = rec["horas_extra"] + rec["horas_extra_triples"]
    if kind == "horas_de_mas":
        rec["horas_ordinarias"] = round(rec["horas_ordinarias"] + rng.choice([4, 6, 8, 12, 16]), 1)
    elif kind == "horas_de_menos":
        if rec["horas_ordinarias"] < 12:
            return False
        rec["horas_ordinarias"] = round(rec["horas_ordinarias"] - rng.choice([4, 6, 8]), 1)
    elif kind == "retardo_sin_descontar":
        if rec["retardos_descontados"] < 1:
            return False
        rec["retardos_descontados"] -= rng.randint(1, rec["retardos_descontados"])
        if rec["retardos_descontados"] == 0:
            rec["bono_puntualidad"] = config.DEMO_PUNCTUALITY_BONUS     # además se le paga el bono
    elif kind == "descuento_indebido":
        rec["retardos_descontados"] += rng.randint(1, 2)
        rec["bono_puntualidad"] = 0.0
    elif kind == "bono_indebido":
        if rec["bono_puntualidad"] > 0:
            return False
        rec["bono_puntualidad"] = config.DEMO_PUNCTUALITY_BONUS
    elif kind == "extras_sin_pagar":
        if extras < 2:
            return False
        rec["horas_extra"] = rec["horas_extra_triples"] = 0.0
    elif kind == "dia_sin_fichaje":
        k = rng.choice([1, 2])
        rec["dias_pagados"] += k
        rec["horas_ordinarias"] = round(rec["horas_ordinarias"] + config.DEMO_WORKDAY_HOURS * k, 1)
    elif kind == "extras_de_mas":                      # se pagan más horas extra de las fichadas
        if extras < 1:
            return False
        rec["horas_extra"] = round(rec["horas_extra"] + rng.choice([2, 4, 6, 8]), 1)
    elif kind == "extras_sin_respaldo":                # se pagan horas extra donde los fichajes no muestran ninguna
        if extras >= 0.5:
            return False
        rec["horas_extra"] = round(rng.choice([4, 6, 8, 12]), 1)
    elif kind == "extras_parciales":                   # solo se paga una parte de las horas extra fichadas
        if extras < 3:
            return False
        keep = rng.choice([0.3, 0.5, 0.7])
        rec["horas_extra"] = round(rec["horas_extra"] * keep, 1)
        rec["horas_extra_triples"] = round(rec["horas_extra_triples"] * keep, 1)
    elif kind == "triples_como_dobles":                # las horas triples se pagan como dobles
        if rec["horas_extra_triples"] < 1:
            return False
        rec["horas_extra"] = round(rec["horas_extra"] + rec["horas_extra_triples"], 1)
        rec["horas_extra_triples"] = 0.0
    return True


def generate(conn) -> dict:
    """Regenera nominas_demo. Devuelve un resumen y, para pruebas, qué registros llevan error inyectado."""
    days = repo.attendance_days(conn)
    if not days:
        return {"estado": "sin_datos"}
    entry = attendance.entry_by_worker(days)
    by_worker = defaultdict(list)
    for d in days:
        by_worker[d["trabajador"]].append({"fecha": d["fecha"], "horas": d["horas"].split(",")})
    # métricas de todos los días del colaborador: el tope semanal de extras no se corta al cambiar de periodo
    metrics = {t: attendance.worker_metrics(v, entry[t]) for t, v in by_worker.items() if entry.get(t) is not None}

    def in_period(t, i):
        a, b = config.DEMO_PERIODS[i]
        return [m for m in metrics[t] if a <= m["fecha"] <= b]

    eligible = sorted(
        t for t, m in metrics.items()
        if 3 * 60 <= entry[t] < 19 * 60
        and all(sum(x["computable"] for x in in_period(t, i)) >= 6 for i in range(len(config.DEMO_PERIODS))))
    rng = random.Random(config.DEMO_SEED)
    sample = sorted(rng.sample(eligible, min(config.DEMO_SAMPLE_SIZE, len(eligible))))

    rows, injected, used = [], {}, Counter()
    for t in sample:
        tarifa = rng.randrange(90, 191) / 2.0          # 45.00 – 95.00 por hora
        for i, (a, b) in enumerate(config.DEMO_PERIODS):
            agg = attendance.aggregate(in_period(t, i))
            exp = payroll.expected(agg)
            rec = {"dias_pagados": exp["dias"], "horas_ordinarias": round(exp["horas_ord"], 1),
                   "horas_extra": round(exp["horas_extra"], 1), "horas_extra_triples": round(exp["horas_triples"], 1),
                   "retardos_descontados": exp["retardos"], "bono_puntualidad": exp["bono"]}
            kind = None
            if rng.random() < ERROR_RATE:
                # se prefiere el tipo menos usado hasta ahora, para que todos aparezcan en la muestra
                for k in sorted(rng.sample(ERRORS, len(ERRORS)), key=lambda e: used[e]):
                    if _apply_error(k, rec, rng):
                        kind = k
                        used[k] += 1
                        break
            neto = payroll.net(tarifa, rec["horas_ordinarias"], rec["horas_extra"], rec["horas_extra_triples"],
                               rec["retardos_descontados"], rec["bono_puntualidad"])
            rows.append((t, a, b, tarifa, rec["dias_pagados"], rec["horas_ordinarias"], rec["horas_extra"], rec["horas_extra_triples"],
                         rec["retardos_descontados"], rec["bono_puntualidad"], neto, attendance.fmt_minutes(entry[t])))
            injected[(t, a)] = kind
    repo.payroll_replace(conn, rows)
    return {"estado": "generado", "colaboradores": len(sample), "nominas": len(rows),
            "con_error_inyectado": sum(1 for v in injected.values() if v), "inyectados": injected}
