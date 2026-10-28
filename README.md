# PATE Workforce Intelligence (demo)

Demo comercial de Quantrue para PATE (Procesadora de Aves de Tepa). Revisa los fichajes de IBIX (`Checadas.csv`) y, solo en la demo, los cruza con **nóminas simuladas** para ver si lo pagado cuadra con las horas fichadas.

> Las nóminas, tarifas y periodos son inventados. Los fichajes son los reales de IBIX y **no están en este repositorio**.

## Qué muestra

- **Resumen ejecutivo:** horas trabajadas, horas extra, retardos y conciliación de nómina, con gráficos por semana, departamento y tipo de alerta.
- **Nómina y conciliación:** horas extra pagadas frente a las que indican los fichajes, por mes y departamento.
- **Horas extra sin pagar:** casos concretos, con el detalle día a día.

## Requisitos

- Python 3.12. Solo biblioteca estándar: no hay que instalar nada.
- El archivo `Checadas.csv` (export de IBIX) en la raíz del proyecto. No se sube a GitHub; pídeselo a quien mantiene la demo.

## Arrancar

```powershell
git clone https://github.com/quantrueSL/Checkador.git
cd Checkador
# copia aquí Checadas.csv
python run.py
```

Abre http://127.0.0.1:8765. La primera vez procesa el CSV y genera las nóminas simuladas (tarda un poco).

| Comando | Qué hace |
|---|---|
| `python run.py` | Procesa el CSV si la base está vacía, genera nóminas si faltan y arranca la web |
| `python run.py ingest [--force]` | Reprocesa el CSV y regenera las nóminas |
| `python run.py nominas` | Regenera solo las nóminas simuladas |

### Verla desde otro equipo

Por defecto solo escucha en el propio equipo. Para abrirla a la red, define el host antes de arrancar (y abre el puerto en el firewall):

```powershell
$env:PATE_HOST = "0.0.0.0"; $env:PATE_PORT = "8765"; python run.py
```

Otras variables: `PATE_CSV_PATH` (ruta alternativa del CSV).

## Reglas de la demo

Son supuestos pendientes de validar con PATE y están en `backend/config.py` (bloque `DEMO_*`):

- Se excluyen las terminales 3 y 4 (comedor) y los datos anteriores al 21/09/2026.
- Jornada de 8 h; comida de 1 h descontada si la permanencia supera 6 h (selector 1 / 1,5 / 2 h en el Resumen).
- Retardo: más de 10 min sobre la entrada habitual del colaborador.
- Horas extra dobles hasta 9 h por colaborador y semana, triples el resto (referencia: arts. 67 y 68 de la Ley Federal del Trabajo).
- Una jornada con un solo fichaje no se puede calcular y queda "a verificar".
- No se infieren ausencias ni incumplimientos sin horarios validados.
- Nóminas simuladas: muestra de 40 colaboradores, semilla fija, con errores intencionados para que la conciliación tenga qué detectar.

## Estructura

```
run.py                  punto de entrada
backend/
  api/server.py         servidor HTTP y rutas /api/...
  data/                 base SQLite y consultas
  rules/                reglas puras (calidad, asistencia, nómina, privacidad)
  services/             ingesta, analítica y nóminas simuladas
frontend/               SPA en JavaScript sin dependencias (views, components, domain)
data/                   base generada (no se sube)
```

## Datos personales

Los nombres salen enmascarados con iniciales por defecto. El interruptor "Nombres visibles" es solo cosmético. No subas `Checadas.csv` ni `data/` al repositorio: están en `.gitignore`.
