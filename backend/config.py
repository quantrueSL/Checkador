"""Configuración central. Los umbrales de negocio viven aquí para poder validarlos con el cliente."""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = Path(os.environ.get("PATE_CSV_PATH", ROOT / "Checadas.csv"))
DB_PATH = ROOT / "data" / "pate.db"
UPLOAD_DIR = ROOT / "data" / "uploads"
FRONTEND_DIR = ROOT / "frontend"

HOST = os.environ.get("PATE_HOST", "127.0.0.1")
PORT = int(os.environ.get("PATE_PORT", "8765"))

# Terminales que NO son de asistencia (comedor, confirmado por el cliente).
EXCLUDED_TERMINALS = ("3", "4")
EXCLUSION_REASON = "Terminal de comedor"

# Reglas de calidad (propuestas, pendientes de validar con el cliente).
RULES_VERSION = "0.3"
DOUBLE_TAP_SECONDS = 60      # dos fichajes del mismo colaborador a <= N segundos
GAP_MIN_DAYS = 3             # días seguidos sin ningún registro para considerarlo hueco de cobertura

# Limpieza: los registros anteriores a esta fecha (previos a la regularización de las terminales) se descartan al cargar.
# El CSV original no se modifica; para recuperarlos basta con cambiar esta fecha y reprocesar.
DATA_START = "2026-09-21"

# ---- Simulación de nómina (SOLO DEMO; ninguno de estos valores viene de PATE) ----
DEMO_WORKDAY_HOURS = 8.0         # jornada ordinaria
DEMO_MEAL_HOURS = 1.0            # comida descontada de la permanencia cuando esta supera DEMO_MEAL_THRESHOLD_H
DEMO_MEAL_THRESHOLD_H = 6.0
DEMO_LATE_TOLERANCE_MIN = 10     # minutos de tolerancia sobre la hora de entrada habitual
DEMO_MIN_SPAN_MIN = 30           # con menos permanencia entre primer y último fichaje, no se calculan horas
DEMO_DOUBLE_FACTOR = 2.0         # horas extra dobles (LFT art. 67): hasta DEMO_DOUBLE_CAP_WEEK_H a la semana
DEMO_TRIPLE_FACTOR = 3.0         # horas extra triples (LFT art. 68): lo que exceda ese tope semanal
DEMO_DOUBLE_CAP_WEEK_H = 9.0
DEMO_LATE_DISCOUNT_H = 0.5       # cada retardo descuenta media hora de salario
DEMO_PUNCTUALITY_BONUS = 250.0   # bono por periodo sin retardos
DEMO_SAMPLE_SIZE = 40
DEMO_SEED = 2026
# periodos mensuales de la simulación (septiembre desde el 21/09; octubre hasta el último fichaje cargado)
DEMO_PERIODS = (("2026-09-21", "2026-09-30"), ("2026-10-01", "2026-10-22"))
DEMO_HOURS_TOLERANCE = 0.5       # horas de diferencia que se toleran al conciliar

MAX_UPLOAD_BYTES = 50 * 1024 * 1024
