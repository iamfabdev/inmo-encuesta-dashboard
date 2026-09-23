# Panel de Calidad de Servicio · Cliente Incógnito (multi-cliente)

Sitio estático (sin backend) para cargar los resultados de cada ola del
estudio de cliente incógnito, normalizarlos y visualizar la evolución del
índice de calidad de servicio de una inmobiliaria vs. su competencia.

Se ofrece a varias inmobiliarias. **Cada cliente tiene su propio build y su
propio deploy**, así el sitio de un cliente nunca contiene datos de otro.

| Cliente | Carpeta | Worker de Cloudflare | URL |
|---|---|---|---|
| Inmobiliaria Activa | `tenants/activa/` | `inmo-encuesta-dashboard` | `activa.inmotrack.cl` |
| Demo (datos ficticios) | `tenants/demo/` | `inmo-demo-dashboard` | `demo.inmotrack.cl` |

## Estructura

```
src/                 código común (app.js, ui.js, styles.css, index.html, admin.html, assets/)
tenants/<slug>/
  tenant.json        nombre, inmobiliaria(s) propia(s), color, prefijo de localStorage
  data/              dashboard-data.json (lo publicado) y master.json (maestro de referencia)
  assets/            opcional: pisa los assets comunes (ej. logo propio)
build.mjs            arma dist/<slug>/ = src/ + tenants/<slug>/
wrangler.jsonc       un Worker por cliente (env por defecto = activa, --env demo)
```

`tenant.json`:

| Campo | Para qué |
|---|---|
| `shortName` / `clientName` | Textos de la UI ("ACTIVA vs. Competencia", subtítulos) |
| `ownInmobiliarias` | Valores de la columna INMOBILIARIA del maestro que cuentan como "propios" (se compara sin mayúsculas/tildes/espacios de más) |
| `brandColor` | Color de acento y de las barras "propias" en los gráficos |
| `storagePrefix` | Prefijo de las claves de `localStorage` del admin — separa los datos de cada cliente en el mismo navegador. Activa usa `msd` (las claves históricas) |

En los HTML de `src/` se usan placeholders `{{shortName}}`, `{{clientName}}`,
`{{brandColor}}`, `{{brandInitial}}` que reemplaza el build; en JS, la config
llega como `window.TENANT` (`tenant.js`, generado por el build).

El proyecto tiene **dos puntos de entrada** que comparten el mismo motor:

- **`admin.html`** — la herramienta completa (subir Excel, revisar calidad
  de datos, ajustar ponderadores). Todo el procesamiento ocurre en el
  navegador con SheetJS y se guarda en `localStorage` de ese equipo.
- **`index.html`** — el dashboard de **solo lectura**. Solo lee
  `data/dashboard-data.json`.

## Desarrollo local

```bash
node build.mjs                                   # todos los clientes (o: node build.mjs demo)
python3 -m http.server 8080 -d dist/activa       # http://localhost:8080/admin.html
```

Después de editar algo en `src/` o `tenants/`, vuelve a correr `node build.mjs`.

## Flujo de trabajo (cada vez que hay datos nuevos)

1. `node build.mjs <slug>` y levanta `dist/<slug>` como arriba; abre `admin.html`.
2. Carga el Excel de la ola (y el maestro, si cambió) — ver "Cómo cargar una
   nueva ola".
3. Revisa **Calidad de datos** y ajusta ponderadores en **Configuración**.
4. **Configuración → Exportar todo** — descarga `mystery_shopper_backup.json`.
5. Reemplaza `tenants/<slug>/data/dashboard-data.json` con ese archivo y
   revisa el diff antes de commitear.
6. Commit + push a `master`. Cloudflare Workers Builds construye y despliega
   cada Worker conectado al repo.

## Setup en Cloudflare (por cliente)

El dominio `inmotrack.cl` **no está en nuestra cuenta de Cloudflare** (su DNS
lo administra un tercero). Se publica con **Cloudflare for SaaS** sobre la
zona `terrabit.cl`:

1. **Worker**: Workers & Pages → Create → Import repo (este repo) →
   nombre `inmo-<slug>-dashboard` · build command `node build.mjs <slug>` ·
   deploy command `npx wrangler deploy --env <slug>` (Activa: sin `--env`).
2. **Custom hostname**: zona `terrabit.cl` → SSL/TLS → Custom Hostnames →
   Add `<slug>.inmotrack.cl` (el fallback origin ya es `fallback.terrabit.cl`).
   Cloudflare entrega un registro TXT de verificación.
3. **DNS (lo hace el dueño de inmotrack.cl)**:
   - `CNAME <slug>.inmotrack.cl → fallback.terrabit.cl`
   - `TXT _cf-custom-hostname.<slug>.inmotrack.cl → <valor que entrega Cloudflare>`
4. **Ruta**: zona `terrabit.cl` → Workers Routes → `<slug>.inmotrack.cl/*` →
   Worker `inmo-<slug>-dashboard`.
5. **Acceso**: Zero Trust → Access → Applications → Self-hosted →
   `<slug>.inmotrack.cl` → política con los correos permitidos → login
   One-time PIN.

## Cómo cargar una nueva ola

1. En **`admin.html`**, ve a **Cargar datos**.
2. Arrastra el Excel de la encuesta (`BBDD_Cliente_Incognito...xlsx`).
3. Si hubo cambios en el universo de proyectos (nuevo competidor, proyecto
   que ya no vende, cambio de cluster/Grupo), arrastra también el maestro
   de proyectos actualizado. Si no subes uno, se reutiliza el último
   guardado (o el de referencia incluido en `tenants/<slug>/data/master.json`).
4. Ponle nombre a la ola y confirma la fecha de referencia.
5. Click en **Procesar archivo** → revisa el preview (alertas, cobertura) →
   **Guardar esta ola**.

Recuerda seguir el "Flujo de trabajo" de arriba (Exportar todo → reemplazar
`tenants/<slug>/data/dashboard-data.json` → commit → push) para que el dashboard
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
actualizar el mapeo de columnas en `src/app.js` (objeto `COL` al inicio del
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
