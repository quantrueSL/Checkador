"""Reglas de negocio de las vistas: indicadores, comparaciones y enmascarado. Sin SQL ni HTTP."""
import importlib.util
import os
from collections import defaultdict
from datetime import date, timedelta

from .. import config
from ..data import repository as repo
from ..rules import attendance, payroll, privacy, quality

PENDING_INDICATORS = [
    {"key": "horas", "label": "Horas trabajadas",
     "requiere": "Definir qué fichaje es entrada y cuál salida, y cómo tratar turnos que cruzan la medianoche."},
    {"key": "puntualidad", "label": "Retrasos y puntualidad",
     "requiere": "Horarios y tolerancias por departamento o turno."},
    {"key": "extras", "label": "Horas extraordinarias",
     "requiere": "Horarios, reglas de jornada y criterio legal validado por el cliente."},
    {"key": "ausencias", "label": "Ausencias",
     "requiere": "Calendario laboral, descansos y horarios. La falta de fichajes por sí sola no prueba una ausencia."},
]


def _d(s):
    return date.fromisoformat(s)


def _overlaps(gaps, desde, hasta):
    return any(g["desde"] <= hasta and g["hasta"] >= desde for g in gaps)


def _pct(cur, prev):
    return None if not prev else round((cur - prev) / prev * 100, 1)


def person(row, reveal):
    """Sustituye 'nombre' por la versión mostrable según el modo de privacidad."""
    row = dict(row)
    row["nombre"] = privacy.display_name(row.get("nombre"), reveal)
    return row


def meta(conn):
    lo, hi = repo.date_range(conn)
    return {
        "hay_datos": lo is not None, "desde": lo, "hasta": hi,
        "departamentos": repo.departamentos(conn) if lo else [],
        "huecos": repo.gaps(conn) if lo else [],
        "incidencias": quality.INCIDENT_TYPES, "severidades": quality.SEVERITY_LABEL,
        "terminales_excluidas": list(config.EXCLUDED_TERMINALS),
        "umbrales": {"doble_pulsacion_s": config.DOUBLE_TAP_SECONDS,
                     "hueco_min_dias": config.GAP_MIN_DAYS, "version_reglas": config.RULES_VERSION},
        "ingesta": _ingest_public(repo.last_ingest(conn)),
    }


def _ingest_public(i):
    if not i:
        return None
    return {k: i[k] for k in ("archivo", "cargado_en", "registros", "incluidos", "excluidos", "rechazadas")}


def resumen(conn, f, comida=None):
    lo, _ = repo.date_range(conn)
    gaps = repo.gaps(conn)
    cur = repo.totals(conn, f)
    cur["excluidos"] = repo.excluded_count(conn, f)
    n_days = (_d(f.hasta) - _d(f.desde)).days + 1
    p_hasta = (_d(f.desde) - timedelta(days=1)).isoformat()
    p_desde = (_d(f.desde) - timedelta(days=n_days)).isoformat()

    var = {"comparable": False, "motivo": None, "anterior": {"desde": p_desde, "hasta": p_hasta}}
    if p_desde < lo:
        var["motivo"] = "No hay un periodo anterior de la misma duración dentro de los datos."
    elif _overlaps(gaps, f.desde, f.hasta) or _overlaps(gaps, p_desde, p_hasta):
        var["motivo"] = "Alguno de los periodos incluye días sin registros en las terminales de asistencia."
    else:
        prev = repo.totals(conn, repo.Filters(p_desde, p_hasta, f.depto, f.trabajador))
        var.update(comparable=True, fichajes=_pct(cur["fichajes"], prev["fichajes"]),
                   colaboradores=_pct(cur["colaboradores"], prev["colaboradores"]),
                   jornadas=_pct(cur["jornadas"], prev["jornadas"]),
                   incidencias=_pct(cur["incidencia"], prev["incidencia"]))

    by_day = {r["fecha"]: r for r in repo.daily(conn, f)}
    starts = repo.terminal_start_dates(conn)
    terms = repo.daily_terminals(conn, f)
    serie, d = [], _d(f.desde)
    while d <= _d(f.hasta):
        iso = d.isoformat()
        gap = next((g for g in gaps if g["desde"] <= iso <= g["hasta"]), None)
        r = by_day.get(iso)
        serie.append({"fecha": iso, "sin_datos": gap is not None, "hueco": gap,
                      "fichajes": None if gap else (r["fichajes"] if r else 0),
                      "colaboradores": None if gap else (r["colaboradores"] if r else 0),
                      "terminales": terms.get(iso, []), "fin_de_semana": d.weekday() >= 5,
                      # terminales de asistencia que todavía no tienen ningún registro en esa fecha
                      "terminales_sin_iniciar": [] if gap else sorted(t for t, s0 in starts.items() if s0 > iso)})
        d += timedelta(days=1)

    counts = repo.flag_counts(conn, f)
    incidencias = [{**t, "jornadas": counts[t["key"]],
                    "pct_jornadas": round(counts[t["key"]] / cur["jornadas"] * 100, 1) if cur["jornadas"] else None}
                   for t in quality.INCIDENT_TYPES]
    return {
        "periodo": {"desde": f.desde, "hasta": f.hasta, "dias": n_days},
        "kpis": cur, "variacion": var, "serie": serie, "terminales_inicio": starts, "departamentos": repo.by_depto(conn, f),
        "incidencias": incidencias, "huecos": [g for g in gaps if g["desde"] <= f.hasta and g["hasta"] >= f.desde],
        "incidencias_por_depto": repo.flag_counts_by_depto(conn, f), "indicadores_pendientes": PENDING_INDICATORS, "indicadores_supuestos": indicadores_supuestos(conn, f, comida),
    }


MEAL_OPTIONS = (1.0, 1.5, 2.0)


def indicadores_supuestos(conn, f, comida=None):
    """Horas, horas extra y retardos con supuestos NEUTRALES de demo (config.DEMO_*), respetando los filtros activos.
    Todo agregado: por semana y por departamento. Las ausencias no se calculan: sin calendario laboral la falta de
    fichajes no prueba nada."""
    meal = comida if comida in MEAL_OPTIONS else config.DEMO_MEAL_HOURS
    days = repo.attendance_days(conn)
    entry = attendance.entry_by_worker(days)
    comp = sin_salida = retardos = j_ext = 0
    horas = extras = 0.0
    c_ret, c_ext = set(), set()
    worker_week, deps, days_h = defaultdict(float), {}, {}
    for d in days:
        if not (f.desde <= d["fecha"] <= f.hasta) or (f.depto and d["depto"] != f.depto) or (f.trabajador is not None and d["trabajador"] != f.trabajador):
            continue
        m = attendance.day_metrics(d["horas"].split(","), entry.get(d["trabajador"]) or 0, meal)
        if not m["computable"]:
            sin_salida += 1
            continue
        ws = attendance.week_start(d["fecha"])
        p = deps.setdefault(d["depto"], {"depto": d["depto"], "horas": 0.0, "extras": 0.0, "jornadas": 0, "retardos": 0})
        comp += 1
        horas += m["neto_h"]
        dd = days_h.setdefault(d["fecha"], {"colaboradores": 0, "reales": 0.0})
        dd["colaboradores"] += 1; dd["reales"] += m["neto_h"]
        p["horas"] += m["neto_h"]; p["extras"] += m["extra_h"]; p["jornadas"] += 1
        if m["retardo"]:
            retardos += 1
            p["retardos"] += 1
            c_ret.add(d["trabajador"])
        if m["extra_h"] > 0:
            extras += m["extra_h"]
            j_ext += 1
            c_ext.add(d["trabajador"])
            worker_week[(d["trabajador"], ws)] += m["extra_h"]
    dobles, triples = attendance.split_weekly_extra(worker_week)
    cfg_jornada = config.DEMO_WORKDAY_HOURS
    # por día: horas que tocaría trabajar (jornada x colaboradores con entrada y salida) frente a las realmente trabajadas
    diario = [{"fecha": fe, "colaboradores": v["colaboradores"], "esperadas": round(v["colaboradores"] * cfg_jornada, 1),
               "reales": round(v["reales"], 1)} for fe, v in sorted(days_h.items())]
    departamentos = [{"depto": p["depto"], "horas": round(p["horas"]), "extras": round(p["extras"]), "jornadas": p["jornadas"],
                      "retardos": p["retardos"],
                      "pct_extra": round(p["extras"] / p["horas"] * 100, 1) if p["horas"] else None,
                      "pct_retardos": round(p["retardos"] / p["jornadas"] * 100, 1) if p["jornadas"] else None}
                     for p in deps.values()]
    cfg = config
    return {
        "horas": {"total": round(horas), "promedio": round(horas / comp, 1) if comp else None, "jornadas": comp, "sin_salida": sin_salida},
        "puntualidad": {"retardos": retardos, "pct": round(retardos / comp * 100, 1) if comp else None, "colaboradores": len(c_ret)},
        "extras": {"horas": round(extras), "dobles": round(dobles), "triples": round(triples), "jornadas": j_ext, "colaboradores": len(c_ext),
                   "pct": round(extras / horas * 100, 1) if horas else None},
        "diario": diario, "departamentos": departamentos,
        "supuestos": {"jornada_h": cfg.DEMO_WORKDAY_HOURS, "tolerancia_min": cfg.DEMO_LATE_TOLERANCE_MIN, "comida_h": meal,
                      "comida_opciones": list(MEAL_OPTIONS), "tope_doble_semana_h": cfg.DEMO_DOUBLE_CAP_WEEK_H},
    }


def _jornada_public(row, reveal):
    r = person(row, reveal)
    r["horas"] = r["horas"].split(",") if r.get("horas") else []
    r["terminales"] = r["terminales"].split(",") if r.get("terminales") else []
    r["tipos"] = [k for k in quality.FLAG_KEYS if r.pop(f"f_{k}", 0)]
    r.pop("f_madrugada", None)
    r["severidad"] = quality.severity_of(r["tipos"])
    r["motivos"] = {k: quality.explain(k, r["horas"]) for k in r["tipos"]}
    return r


def jornadas(conn, f, reveal, severidad=None, **kw):
    if severidad in quality.SEVERITY_ORDER:
        kw["tipos_any"] = quality.types_with_severity(severidad)
    rows, total = repo.jornadas_page(conn, f, reveal=reveal, **kw)
    return {"rows": [_jornada_public(r, reveal) for r in rows], "total": total}


def jornada_detalle(conn, tid, fecha, reveal):
    j = repo.jornada(conn, tid, fecha)
    if not j:
        return None
    return {"jornada": _jornada_public(j, reveal), "registros": repo.day_records(conn, tid, fecha),
            "tipos": quality.INCIDENT_TYPES}


def colaboradores(conn, f, reveal, **kw):
    rows, total = repo.workers_page(conn, f, reveal=reveal, **kw)
    return {"rows": [person(r, reveal) for r in rows], "total": total}


def colaborador(conn, tid, desde, hasta, reveal):
    w = repo.worker(conn, tid)
    if not w:
        return None
    days = repo.worker_days(conn, tid, desde, hasta)
    return {
        "colaborador": person(w, reveal), "periodo": {"desde": desde, "hasta": hasta},
        "kpis": {"fichajes": sum(d["n"] for d in days), "dias": len(days),
                 "incidencias": sum(d["estado"] == "incidencia" for d in days),
                 "pendientes": sum(d["estado"] == "pendiente" for d in days),
                 "comedor_excluidos": repo.worker_excluded_count(conn, tid, desde, hasta)},
        "dias": [{**d, "horas": d["horas"].split(",")} for d in days], "huecos": repo.gaps(conn),
    }


def trazabilidad(conn):
    ing = repo.last_ingest(conn)
    if not ing:
        return None
    return {
        "ingesta": ing, "terminales": repo.terminal_totals(conn), "por_mes": repo.terminal_by_month(conn),
        "huecos": repo.gaps(conn), "rechazadas": repo.rejected_lines(conn),
        "reglas": {"version": config.RULES_VERSION, "terminales_excluidas": list(config.EXCLUDED_TERMINALS),
                   "doble_pulsacion_s": config.DOUBLE_TAP_SECONDS},
    }


def nomina_estado():
    uri = bool(os.environ.get("PATE_MONGO_URI"))
    driver = importlib.util.find_spec("pymongo") is not None
    if not uri:
        motivo = "No hay una conexión configurada a la base de nómina (variable PATE_MONGO_URI sin definir)."
    elif not driver:
        motivo = "Hay una conexión configurada, pero falta el driver de MongoDB (pymongo) en el servidor."
    else:
        motivo = "Configuración presente, pero la lectura de recibos aún no está implementada (fase 2)."
    return {
        "conectado": False, "motivo": motivo,
        "requisitos": [
            {"label": "Cadena de conexión de solo lectura a MongoDB (en variable de entorno, nunca en el código)", "ok": uri},
            {"label": "Driver de MongoDB (pymongo) instalado", "ok": driver},
            {"label": "Nombre de la base y colección de recibos de nómina timbrados (CFDI)", "ok": False},
            {"label": "Campo del recibo que equivale al número de trabajador de IBIX", "ok": False},
            {"label": "Periodos de nómina disponibles y su calendario de pago", "ok": False},
        ],
    }


# ---- conciliación de nómina SIMULADA (demo) ---------------------------------------------------------------------
def _supuestos():
    c = config
    return [
        f"Jornada ordinaria de {c.DEMO_WORKDAY_HOURS:g} h. Horas trabajadas = tiempo entre el primer y el último fichaje del día"
        f", menos {c.DEMO_MEAL_HOURS:g} h de comida si supera {c.DEMO_MEAL_THRESHOLD_H:g} h.",
        "Horario supuesto: la entrada habitual de cada colaborador (mediana de su primer fichaje, subida a la siguiente media hora). "
        f"Es retardo llegar más de {c.DEMO_LATE_TOLERANCE_MIN} min después.",
        f"Horas extra: lo que exceda la jornada. Las primeras {c.DEMO_DOUBLE_CAP_WEEK_H:g} h de cada semana se pagan x{c.DEMO_DOUBLE_FACTOR:g} y el resto x{c.DEMO_TRIPLE_FACTOR:g}. "
        f"Cada retardo descuenta {c.DEMO_LATE_DISCOUNT_H:g} h de salario. "
        f"Bono de puntualidad de ${c.DEMO_PUNCTUALITY_BONUS:,.0f} si el periodo no tiene retardos.",
        "Una jornada con un solo fichaje no permite calcular horas: la simulación la paga completa y la marca “a verificar”.",
        "Tarifas, periodos y nóminas son inventados para la demo. Ningún dato procede de PATE.",
    ]


def _conciliar(conn):
    recs = repo.payroll_records(conn)
    if not recs:
        return []
    days = repo.attendance_days(conn, ids=sorted({r["trabajador"] for r in recs}))
    by = defaultdict(list)
    for d in days:
        by[d["trabajador"]].append({"fecha": d["fecha"], "horas": d["horas"].split(",")})
    entry = {r["trabajador"]: attendance.parse_minutes(r["entrada_habitual"]) for r in recs}
    metrics = {t: attendance.worker_metrics(v, entry[t]) for t, v in by.items()}
    out = []
    for r in recs:
        mine = [m for m in metrics.get(r["trabajador"], []) if r["desde"] <= m["fecha"] <= r["hasta"]]
        agg = attendance.aggregate(mine)
        out.append((r, agg, payroll.compare(r, agg)))
    return out


def _nomina_row(r, agg, cmp, reveal):
    p = person(r, reveal)
    return {"id": r["id"], "trabajador": r["trabajador"], "nombre": p["nombre"], "depto": r["depto"], "desde": r["desde"],
            "hasta": r["hasta"], "tarifa_hora": r["tarifa_hora"], "neto": r["neto"], "neto_esperado": cmp["neto_esperado"],
            "diferencia_importe": cmp["diferencia_importe"], "estado": cmp["estado"], "estado_label": payroll.STATE_LABEL[cmp["estado"]],
            "discrepancias": [c["label"] for c in cmp["conceptos"] if not c["ok"]], "sin_salida": agg["sin_salida"],
            "retardos_detectados": agg["retardos"], "entrada_habitual": r["entrada_habitual"], "impacto": cmp["impacto"]}


def _impacto_deptos(base):
    deps = {}
    for x in base:
        p = deps.setdefault(x["depto"], {"depto": x["depto"], "nominas": 0, "con_diferencia": 0, "de_mas": 0.0, "de_menos": 0.0})
        p["nominas"] += 1
        p["con_diferencia"] += x["estado"] == "diferencia"
        if x["diferencia_importe"] > 0:
            p["de_mas"] += x["diferencia_importe"]
        else:
            p["de_menos"] -= x["diferencia_importe"]
    return sorted(({**p, "de_mas": round(p["de_mas"], 2), "de_menos": round(p["de_menos"], 2)} for p in deps.values()),
                  key=lambda p: -(p["de_mas"] + p["de_menos"]))


def nomina_conciliacion(conn, reveal, periodo=None, estado=None, q=None, sort="diferencia", direction="desc", limit=10, offset=0):
    items = _conciliar(conn)
    periods = sorted({(r["desde"], r["hasta"]) for r, _, _ in items})
    base = [_nomina_row(r, a, c, reveal) for r, a, c in items]
    if periodo is not None and periodo.isdigit() and int(periodo) < len(periods):
        d0, d1 = periods[int(periodo)]
        base = [x for x in base if x["desde"] == d0 and x["hasta"] == d1]
    kpis = {"nominas": len(base), **{k: sum(x["estado"] == k for x in base) for k in payroll.STATE_LABEL},
            "pagado_de_mas": round(sum(x["diferencia_importe"] for x in base if x["diferencia_importe"] > 0), 2),
            "pagado_de_menos": round(-sum(x["diferencia_importe"] for x in base if x["diferencia_importe"] < 0), 2),
            "colaboradores_con_diferencia": len({x["trabajador"] for x in base if x["estado"] == "diferencia"}),
            "impacto_conceptos": [{"key": k, "label": lbl, "importe": round(sum(x["impacto"][k] for x in base), 2)}
                                  for k, lbl, _u, _t in payroll.CONCEPTS if k != "dias"],
            "impacto_deptos": _impacto_deptos(base)}
    rows = [x for x in base if (not estado or x["estado"] == estado)
            and (not q or q.strip() in str(x["trabajador"]) or (reveal and q.strip().upper() in (x["nombre"] or "").upper()))]
    keys = {"diferencia": lambda x: abs(x["diferencia_importe"]), "neto": lambda x: x["neto"], "trabajador": lambda x: x["trabajador"],
            "estado": lambda x: ["cuadra", "verificar", "diferencia"].index(x["estado"]), "depto": lambda x: x["depto"],
            "periodo": lambda x: x["desde"]}
    rows.sort(key=keys.get(sort, keys["diferencia"]), reverse=direction != "asc")
    return {"hay_datos": bool(items), "rows": rows[offset:offset + limit], "total": len(rows), "kpis": kpis,
            "periodos": [{"desde": a, "hasta": b} for a, b in periods], "supuestos": _supuestos(),
            "estados": payroll.STATE_LABEL}


def nomina_detalle(conn, record_id, reveal):
    r = repo.payroll_records(conn, record_id)
    if not r:
        return None
    _, agg, cmp = next(x for x in _conciliar(conn) if x[0]["id"] == record_id)
    return {"nomina": _nomina_row(r, agg, cmp, reveal), "conceptos": cmp["conceptos"], "dias": agg["detalle"],
            "resumen": {"computables": agg["computables"], "sin_salida": agg["sin_salida"]}, "supuestos": _supuestos()}


def _extras_summary(rows):
    de_mas = sum(max(x["importe"], 0.0) for x in rows)
    de_menos = sum(-min(x["importe"], 0.0) for x in rows)
    pag, esp = sum(x["pagadas"] for x in rows), sum(x["esperadas"] for x in rows)
    return {"nominas": len(rows), "con_diferencia": sum(x["dif"] for x in rows), "horas_pagadas": round(pag, 1),
            "horas_fichajes": round(esp, 1), "de_mas": round(de_mas, 2), "de_menos": round(de_menos, 2), "neto": round(de_mas - de_menos, 2),
            "importe_pagado": round(sum(x["imp_pagado"] for x in rows), 2), "importe_fichajes": round(sum(x["imp_fichajes"] for x in rows), 2)}


def nomina_extras(conn, mes=None):
    """Horas extra pagadas frente a las que indican los fichajes, agregadas por mes y por departamento. Sin datos por persona."""
    items = _conciliar(conn)
    if not items:
        return {"hay_datos": False}
    recs = []
    for r, _agg, cmp in items:
        c = {x["key"]: x for x in cmp["conceptos"]}
        recs.append({"mes": r["desde"][:7], "desde": r["desde"], "hasta": r["hasta"], "depto": r["depto"],
                     "pagadas": c["horas_extra"]["nomina"] + c["horas_triples"]["nomina"],
                     "esperadas": c["horas_extra"]["fichajes"] + c["horas_triples"]["fichajes"],
                     "importe": cmp["impacto"]["horas_extra"] + cmp["impacto"]["horas_triples"],
                     "imp_pagado": r["tarifa_hora"] * (config.DEMO_DOUBLE_FACTOR * c["horas_extra"]["nomina"] + config.DEMO_TRIPLE_FACTOR * c["horas_triples"]["nomina"]),
                     "imp_fichajes": r["tarifa_hora"] * (config.DEMO_DOUBLE_FACTOR * c["horas_extra"]["fichajes"] + config.DEMO_TRIPLE_FACTOR * c["horas_triples"]["fichajes"]),
                     "dif": not (c["horas_extra"]["ok"] and c["horas_triples"]["ok"])})
    meses = sorted({x["mes"] for x in recs})
    sel = [x for x in recs if not mes or x["mes"] == mes] if mes in meses else recs
    deptos = sorted({x["depto"] for x in sel})
    return {"hay_datos": True, "mes": mes if mes in meses else "",
            "meses": [{"key": m, "desde": min(x["desde"] for x in recs if x["mes"] == m), "hasta": max(x["hasta"] for x in recs if x["mes"] == m)} for m in meses],
            "kpis": _extras_summary(sel),
            "por_mes": [{"mes": m, **_extras_summary([x for x in recs if x["mes"] == m])} for m in meses],
            "por_depto": sorted(({"depto": dp, **_extras_summary([x for x in sel if x["depto"] == dp])} for dp in deptos),
                                key=lambda p: -(p["de_mas"] + p["de_menos"])),
            "supuestos": _supuestos()}


CASO_MOTIVOS = {"sin_pagar": "No se pagó ninguna hora extra", "parcial": "Se pagaron menos horas extra de las fichadas",
                "triples": "Horas triples pagadas como dobles"}


def _casos(conn, reveal):
    """Nóminas en las que las horas extra de los fichajes no se pagaron (total o parcialmente)."""
    out = []
    for r, agg, cmp in _conciliar(conn):
        c = {x["key"]: x for x in cmp["conceptos"]}
        esp = c["horas_extra"]["fichajes"] + c["horas_triples"]["fichajes"]
        pag = c["horas_extra"]["nomina"] + c["horas_triples"]["nomina"]
        falta = round(esp - pag, 2)
        sin_pagar = max(-(cmp["impacto"]["horas_extra"] + cmp["impacto"]["horas_triples"]), 0.0)
        if falta <= config.DEMO_HOURS_TOLERANCE and sin_pagar < 50:   # por debajo, son céntimos de redondeo
            continue
        motivo = "sin_pagar" if pag < 0.05 and esp > 0 else ("parcial" if falta > config.DEMO_HOURS_TOLERANCE else "triples")
        p = person(r, reveal)
        out.append({"id": r["id"], "trabajador": r["trabajador"], "nombre": p["nombre"], "depto": r["depto"], "mes": r["desde"][:7],
                    "desde": r["desde"], "hasta": r["hasta"], "horas_fichajes": round(esp, 1), "horas_pagadas": round(pag, 1),
                    "horas_sin_pagar": round(max(falta, 0.0), 1), "importe_sin_pagar": round(sin_pagar, 2),
                    "dias_con_extra": sum(1 for m in agg["detalle"] if m["computable"] and m["extra_h"] > 0),
                    "motivo": motivo, "motivo_label": CASO_MOTIVOS[motivo]})
    return out


def nomina_casos(conn, reveal, mes=None, depto=None, motivo=None, q=None, sort="importe", direction="desc", limit=10, offset=0):
    allc = _casos(conn, reveal)
    meses = sorted({r["desde"][:7] for r in repo.payroll_records(conn)})
    base = [x for x in allc if not mes or x["mes"] == mes]
    kpis = {"casos": len(base), "colaboradores": len({x["trabajador"] for x in base}),
            "horas_sin_pagar": round(sum(x["horas_sin_pagar"] for x in base), 1),
            "importe_sin_pagar": round(sum(x["importe_sin_pagar"] for x in base), 2)}
    rows = [x for x in base if (not depto or x["depto"] == depto) and (not motivo or x["motivo"] == motivo)
            and (not q or q.strip() in str(x["trabajador"]) or (reveal and q.strip().upper() in (x["nombre"] or "").upper()))]
    keys = {"importe": lambda x: x["importe_sin_pagar"], "horas": lambda x: x["horas_sin_pagar"], "trabajador": lambda x: x["trabajador"],
            "depto": lambda x: x["depto"], "mes": lambda x: x["mes"], "fichajes": lambda x: x["horas_fichajes"]}
    rows.sort(key=keys.get(sort, keys["importe"]), reverse=direction != "asc")
    return {"hay_datos": bool(meses), "rows": rows[offset:offset + limit], "total": len(rows), "kpis": kpis, "meses": meses,
            "deptos": sorted({x["depto"] for x in allc}), "motivos": CASO_MOTIVOS}
