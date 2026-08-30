# Pipeline Evaluation — Guía operativa

Este documento explica cómo ejecutar la validación del pipeline de clasificación de Kairo contra emails reales, por qué cada paso existe, y qué hacer con los resultados.

---

## Por qué esto importa

El pipeline de clasificación ([KAI-75](https://linear.app/agent-kairo/issue/KAI-75/email-processing-pipeline-tiered-classification-with-fast-path-first)) ya corre en producción. Clasifica emails en español colombiano coloquial — un idioma con modismos, abreviaciones, tono agresivo disfrazado de urgencia, y jerga que ningún modelo fue entrenado a manejar bien.

Antes de mostrárselo a un cliente real, necesitamos saber si clasifica bien o si va a quedar en ridículo. Esa respuesta no se puede adivinar — se mide. Este proceso produce la medición.

---

## Prerequisitos

`scripts/eval/data/` es un **repo git privado aparte** — contiene correos
reales de la empresa y el monorepo lo ignora por completo (ver `.gitignore`
raíz). Nada de lo que hay adentro es visible desde este repo, así que la
estructura esperada se documenta aquí:

```
scripts/eval/data/
├── input/
│   ├── ground_truth_50.csv    ← producido por KAI-102 (hoja cruda de dos
│   │                            anotadores; se adapta en memoria al correr —
│   │                            nunca se edita)
│   ├── _meta.json             ← opcional: { "inter_annotator_agreement": <número> }
│   └── eml/
│       └── 001.eml … 050.eml  ← correos fuente crudos
└── output/                    ← los scripts la crean solos
    └── <provider>-<modelo>/   ← una carpeta POR CORRIDA, ej. ollama-granite4.1-3b
        ├── pipeline_output.csv   (incluye columnas provider + model)
        ├── eval_report.md / eval_report.json
        └── *.log
```

La identidad de cada corrida sale de `INTELLIGENCE_PROVIDER` + `OLLAMA_MODEL` /
`ANTHROPIC_MODEL` al momento de lanzar; corridas con modelos distintos jamás
comparten ni pisan archivos. `eval:metrics` resuelve la misma carpeta desde las
mismas env vars, o la recibe explícita: `bun run eval:metrics <nombre-carpeta>`.

Clonar solo el monorepo no alcanza para correr el eval — el repo privado de
datos debe estar montado en `scripts/eval/data/`.

Antes de correr cualquier script, verificar que estos archivos existen:

```
scripts/eval/data/input/ground_truth_50.csv   ← producido por KAI-102
scripts/eval/data/input/eml/                  ← 50 archivos .eml crudos (001.eml ... 050.eml)
```

El `ground_truth_50.csv` es el resultado del ejercicio de etiquetado manual de Alejandro ([KAI-100](https://linear.app/agent-kairo/issue/KAI-100/manual-labeling-alejandro-reviews-all-50-emails-independently)) y Alexandra ([KAI-101](https://linear.app/agent-kairo/issue/KAI-101/etiquetado-manual-alexandra-revisa-los-50-correos-de-forma)), reconciliado en [KAI-102](https://linear.app/agent-kairo/issue/KAI-102/comparar-etiquetas-resolver-discrepancias-producir-dataset-de-verdad). Contiene lo que dos humanos con contexto del negocio dijeron que era cada email.

---

## Paso 1 — Correr el pipeline contra los 50 emails

**Script:** `bun run eval:pipeline`
**Issue:** [KAI-106](https://linear.app/agent-kairo/issue/KAI-106/run-50-ground-truth-emails-through-the-production-classification)
**Qué hace:** Lee los 50 `.eml` crudos, los pasa por el pipeline de clasificación de producción uno a uno, y escribe el resultado en un CSV.

```bash
# Desde la raíz del monorepo
bun run eval:pipeline
```

**Output esperado:**

```
scripts/eval/data/output/pipeline_output.csv
scripts/eval/data/output/pipeline_eval_run.log
```

**Qué NO es este script:** no ejecuta el pipeline de tiers. Llama `classifyEmailWithMeta()` directamente — sin Inngest, sin Gmail, sin pre-filtro (Tier 0) y sin persistencia. Lo que mide es el clasificador, no la orquestación que lo rodea.

**Por qué secuencial y no paralelo:** para que `processing_time_ms` sea la latencia limpia de una llamada individual. Es la cifra que gobierna Tier 1, donde el primer ticket aparece cuando responde la primera de las llamadas que se disparan en paralelo. Correr el eval en paralelo contaminaría esa medición sin representar mejor a ningún tier.

**Por qué** `temperature: 0`: Sin esto, correr el mismo email dos veces puede dar resultados diferentes. El benchmark es inútil si no es reproducible.

---

## Paso 2 — Calcular las métricas

**Script:** `bun run eval:metrics`
**Issue:** [KAI-97](https://linear.app/agent-kairo/issue/KAI-97/evaluation-framework-precision-recall-and-confidence-calibration-over)
**Qué hace:** Toma `ground_truth_50.csv` y `pipeline_output.csv`, los cruza por `email_id`, y calcula F1, precisión, recall, calibración de confianza, y análisis de fallos en español.

```bash
# Desde la raíz del monorepo
bun run eval:metrics
```

**Output esperado:**

```
scripts/eval/data/output/eval_report.md    ← legible por humanos
scripts/eval/data/output/eval_report.json  ← legible por máquinas / KEL-2
```

---

## Cómo leer el reporte

Abrir `eval_report.md`. La primera sección dice GO, NEEDS WORK, o NO-GO basado en el F1 de `ticket_type` sobre emails de dificultad `easy`.

| Resultado | Significado |
| -- | -- |
| ≥ 80% F1 en casos fáciles | Pipeline mostrable al cliente |
| 60–79% | Problema real — ajustar prompt antes de demo |
| < 60% | No mostrar — identificar categorías que fallan y corregir |

Los **casos edge y difíciles** se espera que fallen — eso es comunicable. Lo que no es aceptable es fallar en los normales.

**Qué buscar específicamente:**

* **tone_inflation_rate:** Si es alto (>20%), el pipeline está asignando prioridad P1 por tono agresivo, no por impacto real. Eso destruye la confianza del cliente cuando clasifican un email emputado como urgente siendo que era solo una queja de facturación.
* **Calibración de confianza:** Si el modelo dice 0.9 de confianza pero solo acierta el 60% de las veces en ese rango — el score de confianza no sirve para nada y no se puede usar para decidir auto-aprobación vs revisión humana.
* **Gap easy vs hard F1:** Esperado que exista. Si es mayor a 30 puntos, el esquema de categorías puede ser demasiado ambiguo y necesita refinarse.

---

## Qué pasa con los resultados

* **GO:** Se puede hacer demo. El `eval_report.json` queda en `scripts/eval/data/output/` como baseline para futuras comparaciones.
* **NEEDS WORK / NO-GO:** Los emails donde el pipeline falló (en `per_email_diff` del reporte) son el input directo para ajustar el prompt de clasificación en `packages/intelligence/prompts/`.

El `eval_report.json` también es el input que [KEL-2](https://linear.app/agent-kairo/issue/KEL-2/benchmark-runner-evaluation-dashboard-for-pipeline-and-model) (Benchmark Runner en Kelan) va a consumir para mostrar resultados históricos en el backoffice.

---

## Orden de ejecución completo

```
KAI-102 ya produjo ground_truth_50.csv ✅
         ↓
bun run eval:pipeline   (KAI-106)
         ↓  pipeline_output.csv
bun run eval:metrics    (KAI-97)
         ↓  eval_report.md → GO / NO-GO
KAI-93 se cierra
```
