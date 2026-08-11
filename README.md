# Panel de Calidad de Servicio · Cliente Incógnito ACTIVA

Sitio estático (sin backend) para cargar los resultados de cada ola del
estudio de cliente incógnito, normalizarlos y visualizar la evolución del
índice de calidad de servicio de ACTIVA vs. su competencia.

Todo el procesamiento ocurre **en el navegador**: al arrastrar el Excel, se
lee con SheetJS, se normaliza y se guarda en `localStorage` de ese
navegador/dispositivo. No hay servidor ni base de datos — si necesitas ver
el panel desde otro equipo, exporta el backup (`Configuración → Exportar
todo`) y cárgalo ahí.

## Desplegar en Cloudflare Pages

**Opción A — arrastrar y soltar (más simple):**
1. Entra a el dashboard de Cloudflare → Workers & Pages → Create → Pages → Upload assets.
2. Arrastra esta carpeta completa (`index.html`, `styles.css`, `app.js`, `ui.js`, `data/`).
3. Cloudflare te da una URL `*.pages.dev` al toque. Puedes conectar tu propio dominio después.

**Opción B — con Wrangler (si prefieres línea de comandos):**
```bash
npx wrangler pages deploy . --project-name activa-cliente-incognito
```

No requiere build step ni `npm install` — son archivos estáticos puros.

## Cómo cargar una nueva ola

1. Ve a **Cargar datos**.
2. Arrastra el Excel de la encuesta (`BBDD_Cliente_Incognito...xlsx`).
3. Si hubo cambios en el universo de proyectos (nuevo competidor, proyecto
   que ya no vende), arrastra también el maestro de proyectos actualizado.
   Si no subes uno, se reutiliza el último guardado (o el de referencia
   incluido en `data/master.json`).
4. Ponle nombre a la ola y confirma la fecha de referencia.
5. Click en **Procesar archivo** → revisa el preview (alertas, cobertura) →
   **Guardar esta ola**.

Con 2 o más olas guardadas, la pestaña **Evolución** se activa sola.

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

Se calcula por visita, combinando 6 bloques normalizados a escala 0–100:

- **Sala de ventas** — promedio de 9 ítems (escala 1–7) de P2.
- **Protocolo de atención** — % de "Sí" en los 14 ítems de P3.
- **Indagación de necesidades** — % de "Sí" combinando P5 (5 ítems) y P16 (3 ítems).
- **Conocimiento del vendedor** — promedio de 4 ítems (escala 1–7) de P10.
- **Cierre y seguimiento** — combinación ponderada de P21, P23, P24, P25 y P26 (seguimiento a 7 días).
- **Satisfacción general** — nota 1–7 de P22.

Los ponderadores de cada bloque son configurables en **Configuración**
(vienen con valores por defecto). Al cambiarlos, se recalculan los índices
de **todas** las olas guardadas, para que la comparación siga siendo
consistente en el tiempo.

## Datos y privacidad

- Todo vive en `localStorage` del navegador donde se use el panel.
- **Exportar todo** genera un `.json` de respaldo con olas, ponderadores y
  maestro — úsalo para mover el panel a otro equipo o como backup periódico.
- **Borrar todos los datos** limpia el `localStorage` por completo (pide
  confirmación).
