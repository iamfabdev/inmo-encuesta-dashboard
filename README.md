# Panel de Calidad de Servicio · Cliente Incógnito ACTIVA

Sitio estático (sin backend) para cargar los resultados de cada ola del
estudio de cliente incógnito, normalizarlos y visualizar la evolución del
índice de calidad de servicio de ACTIVA vs. su competencia.

El proyecto tiene **dos puntos de entrada** que comparten el mismo motor
(`app.js`/`ui.js`/`styles.css`), pero con roles distintos:

- **`admin.html`** — la herramienta completa (subir Excel, revisar calidad
  de datos, ajustar ponderadores). Se usa **solo en local**, nunca la abre
  el cliente final. Todo el procesamiento ocurre en el navegador con
  SheetJS y se guarda en `localStorage` de ese equipo.
- **`index.html`** — el dashboard público, de **solo lectura**. No tiene
  "Cargar datos" ni "Calidad de datos" ni "Configuración" — solo lee
  `data/dashboard-data.json`, un archivo estático que se genera desde
  `admin.html` y se sube al repo. Esto es lo que se despliega en Cloudflare
  Pages, detrás de un login (ver más abajo).

## Flujo de trabajo (cada vez que hay datos nuevos)

1. En tu equipo, levanta un servidor estático simple en esta carpeta (ej.
   `python3 -m http.server 8080`) y abre `http://localhost:8080/admin.html`.
2. Carga el Excel de la ola (y el maestro de proyectos, si cambió) como
   siempre — ver "Cómo cargar una nueva ola" más abajo.
3. Revisa **Calidad de datos** y ajusta ponderadores en **Configuración**
   si hace falta.
4. **Configuración → Exportar todo** — descarga `mystery_shopper_backup.json`.
5. Reemplaza `data/dashboard-data.json` en el repo con ese archivo (mismo
   contenido, solo renómbralo), y revisa el diff antes de commitear —
   es tu control de calidad final antes de publicar.
6. `git add data/dashboard-data.json && git commit -m "..." && git push`
   a `main`.
7. Cloudflare Pages detecta el push y despliega solo — no hay paso manual
   de deploy. El versionado de los datos lo da git: cada commit de
   `data/dashboard-data.json` es una versión, con historial y rollback
   (`git revert`/`git checkout`) gratis.

## Setup único (antes del primer uso)

1. **Repo + Cloudflare Pages**: si esta carpeta todavía no es un repo git,
   `git init`, crea el repo remoto (GitHub/GitLab) y haz el primer push.
   Luego, en el dashboard de Cloudflare → Workers & Pages → Create → Pages
   → **Connect to Git** → elige el repo → framework preset "None", sin
   build command, directorio de salida = esta carpeta → rama de
   producción = `main`. Desde ahí, cada push a `main` dispara un deploy
   automático — no hace falta `wrangler deploy` ni arrastrar archivos a
   mano.
2. **Acceso (usuario/contraseña)**: se usa **Cloudflare Access** (Zero
   Trust), sin código nuevo. En el dashboard de Cloudflare → Zero Trust →
   Access → Applications → Add an application → Self-hosted → apunta al
   dominio `*.pages.dev` (o tu dominio propio) → política: permite la
   lista de correos de tu equipo/cliente → método de login: **One-time
   PIN** (la persona pone su correo, le llega un código, lo ingresa — no
   hay contraseñas que administrar). `admin.html` queda detrás del mismo
   login que el resto del sitio; solo tú y quien tenga acceso concedido
   pueden abrirlo, y aunque lo abran no afecta el dato publicado (el sitio
   público nunca lee `localStorage`, solo `data/dashboard-data.json`).

## Cómo cargar una nueva ola

1. En **`admin.html`**, ve a **Cargar datos**.
2. Arrastra el Excel de la encuesta (`BBDD_Cliente_Incognito...xlsx`).
3. Si hubo cambios en el universo de proyectos (nuevo competidor, proyecto
   que ya no vende, cambio de cluster/Grupo), arrastra también el maestro
   de proyectos actualizado. Si no subes uno, se reutiliza el último
   guardado (o el de referencia incluido en `data/master.json`).
4. Ponle nombre a la ola y confirma la fecha de referencia.
5. Click en **Procesar archivo** → revisa el preview (alertas, cobertura) →
   **Guardar esta ola**.

Recuerda seguir el "Flujo de trabajo" de arriba (Exportar todo → reemplazar
`data/dashboard-data.json` → commit → push) para que el dashboard público
se actualice.

## Estructura esperada del Excel

El parser ubica los datos **por posición de columna**, no por nombre de
encabezado (la plantilla tiene encabezados fusionados en 4 filas, lo que
hace poco confiable emparejar por texto). Esto significa:

- El cuestionario debe mantener el mismo orden y cantidad de preguntas que
  la plantilla "Piloto Cliente Incógnito" actual.
- El parser busca automáticamente la fila cuyo primer valor sea `ID` para
  ubicar dónde empiezan los datos (tolera que se agreguen o quiten filas de
  título arriba, pero no que cambie el orden de las columnas).
- Si la estructura no calza, el parser lo dice explícitamente en vez de
  procesar datos incorrectos en silencio.

Si el cuestionario cambia de forma importante en el futuro, hay que
actualizar el mapeo de columnas en `app.js` (objeto `COL` al inicio del
archivo) — está comentado para que sea fácil de ajustar.

## Reglas de normalización aplicadas

Definidas junto con Terrabit/ACTIVA a partir de la revisión de la primera
ola de datos:

| Campo | Regla |
|---|---|
| P5.6 (renta corta/larga) | Si P5.5 (¿pregunta objetivo uso/inversión?) no fue "Sí", P5.6 se limpia a *sin dato* — no aplica, sin importar lo que traiga la celda. Si P5.5 fue "Sí": `Si`→"Renta corta", `No`/`Larga`→"Renta larga / tradicional". |
| P6 (¿ofrece visitar el piloto?) | Los casos `NA` se dejan como categoría propia **"No aplica"** (no se fusionan con "No"). |
| P7 (¿acompaña a ver el piloto?) | Los casos `NA` se recodifican como **"No"**. |
| Nombre de vendedor | Se limpia formato (espacios, mayúsculas) y se fusionan automáticamente variantes del mismo nombre cuando una es subconjunto de tokens de la otra (ej. "Juliana Marin" → "Juliana Marin Tamayo"). Cada fusión queda registrada y visible en **Calidad de datos**. |
| SI/NO en general | Se normalizan sin distinguir mayúsculas/tildes. |
| Fecha de visita | Acepta `dd-mm-aaaa` y `dd/mm/aaaa`; si la fecha resultante está a más de 60 días de la fecha de referencia de la ola, se marca como alerta (no se corrige sola). |
| Hora de salida | Si es más de 3h anterior a la hora de llegada, se marca como alerta de posible error de tipeo. |

Cualquier regla nueva que surja se agrega a las funciones `norm*` en
`app.js` — quedan documentadas ahí mismo.

## Índice de calidad compuesto

Se calcula por visita (`computeVisitScores` en `app.js`), combinando 7
bloques normalizados a escala 0–100. Dos formas de cálculo se repiten en
casi todos los bloques:

- **Escala 1–7 → 0–100** (`scale17`): promedia los ítems respondidos (escala
  1 a 7) y los reescala con `((promedio − 1) / 6) × 100`.
- **% de "Sí"** (`pct01` + `yn01`): sobre los ítems Sí/No del bloque, calcula
  qué % contestó "Sí". En blanco o cualquier valor que no sea exactamente
  "Sí" cuenta como "No" (no se excluye del denominador), salvo que se diga
  lo contrario.

| # | Bloque | Cómo se calcula | Preguntas |
|---|---|---|---|
| 1 | **Sala de ventas** | Escala 1–7 → 0–100, promedio de 9 ítems. | P2 |
| 2 | **Protocolo de atención** | % de "Sí", 14 ítems. | P3 |
| 3 | **Indagación de necesidades** | % de "Sí", 5 ítems (presupuesto, plazo, tipo de producto, uso/inversión). | P5.1–P5.5 |
| 4 | **Financiamiento** | % de "Sí", 6 ítems: informa financiamiento espontáneamente, informa facilidades de pago del pie, indaga posibilidades de financiamiento, pregunta por preaprobación bancaria, ofrece alternativas de bancos en convenio, describe campaña de financiamiento del pie. | P14, P15, P16.1–P16.3, P17 |
| 5 | **Conocimiento del vendedor** | Escala 1–7 → 0–100, promedio de 4 ítems. | P10 |
| 6 | **Cierre y seguimiento** | Promedio ponderado (no es un simple % de "Sí") — ver detalle abajo. | P19, P20, P21, P23, P24, P25, P26 |
| 7 | **Satisfacción general** | Escala 1–7 → 0–100, un solo ítem. | P22 |

**Detalle del bloque "Cierre y seguimiento"** — es el único que combina
preguntas con distinto peso y distinta codificación (no todas son Sí/No):

| Pregunta | Qué mide | Codificación | Peso |
|---|---|---|---|
| P21 | ¿La atención facilita la compra? | Sí=100 / No=0 | 15% |
| P19 | Esfuerzo de cierre (resume aspectos positivos/claros) | Opción 1=100 / resto=0 | 15% |
| P20 | Identifica objeciones/obstáculos del cliente | Opción 1=100 / resto=0 | 15% |
| P23 | ¿Deja identificado el próximo paso? | Opción 1=100 / resto=0 | 15% |
| P24 | ¿Describe los siguientes pasos? | Sí=100 / No=0 | 15% |
| P25 | ¿Entrega la cotización? | Entrega en el momento=100 / la envía por mail=50 / no entrega=0 | 10% |
| P26 | ¿Hace seguimiento a los 7 días? | Sí=100 / No=0 | 15% |

Los **ponderadores de cada bloque** (tabla de abajo) son configurables en
**Configuración**, con estos valores por defecto:

| Bloque | Peso por defecto |
|---|---|
| Sala de ventas | 15% |
| Protocolo de atención | 15% |
| Indagación de necesidades | 10% |
| Financiamiento | 15% |
| Conocimiento del vendedor | 15% |
| Cierre y seguimiento | 15% |
| Satisfacción general | 15% |

El **índice compuesto** de cada visita es el promedio ponderado de los 7
bloques según esta tabla (`compositeScore` en `app.js`); si a una visita le
falta algún bloque, ese peso se excluye y se renormaliza sobre los bloques
disponibles, en vez de contar como 0. Al cambiar los ponderadores en
**Configuración**, se recalculan los índices de **todas** las olas
guardadas, para que la comparación siga siendo consistente en el tiempo.

## Datos y privacidad

- En `admin.html`, todo vive en `localStorage` del navegador/equipo donde se
  procesan los Excel — nada se sube a un servidor desde ahí.
- **Exportar todo** (en `admin.html → Configuración`) genera el mismo
  `.json` que consume `index.html` en producción: `{ waves, weights,
  master }`. Es también el formato de backup — sirve para mover el panel
  admin a otro equipo, además de ser el archivo que se publica.
- **Importar backup** (en `admin.html → Configuración`) lee ese mismo
  formato de vuelta.
- **Borrar todos los datos** limpia el `localStorage` de `admin.html` por
  completo (pide confirmación) — no afecta `index.html` en producción, que
  nunca toca `localStorage`.
- El dashboard público (`index.html`) es de solo lectura: no persiste nada,
  no acepta cargas, solo hace `fetch('data/dashboard-data.json')` al abrir.
