/* ============================================================
   ACTIVA · Panel de Calidad de Servicio (Cliente Incógnito)
   Motor de carga, normalización y scoring — 100% cliente,
   sin backend. Pensado para desplegarse como sitio estático
   (Cloudflare Pages).
   ============================================================ */

const APP = {};

/* ------------------------------------------------------------
   1. MAPEO DE COLUMNAS DE LA PLANTILLA
   La plantilla del cuestionario "Piloto Cliente Incógnito" tiene
   4 filas de encabezado fusionado. Los datos empiezan en la fila
   donde la primera celda dice "ID". Estas posiciones son fijas
   mientras no cambie el cuestionario base.
   ------------------------------------------------------------ */
const COL = {
  ID: 0, EMAIL: 1, RUT: 2, INICIO: 3, FIN: 4, TMO: 5, ESTADO: 6,
  LAT_O: 7, LNG_O: 8, LAT_D: 9, LNG_D: 10, ARCHIVOS: 11,
  NOMBRE_ENCUESTADOR: 12, RUT_ENCUESTADOR: 13,
  PROYECTO_ID: 14, FECHA_VISITA: 15, HORA_LLEGADA: 16, HORA_SALIDA: 17,
  VENDEDOR: 18,
  P1: [19, 20, 21, 22],
  P2: [23, 24, 25, 26, 27, 28, 29, 30, 31],
  P3: [32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45],
  P4: 46,
  P5_1: 47, P5_2: 48, P5_3: 49, P5_4: 50, P5_5: 51, P5_6: 52,
  P6: 53, P7: 54, P8: 55, P9: 56,
  P10: [57, 58, 59, 60],
  P11: 61, P12: 62, P13: 63, P14: 64, P15: 65,
  P16: [66, 67, 68],
  P17: 69, P18: 70, P19: 71, P20: 72, P21: 73, P22: 74, P23: 75, P24: 76, P25: 77, P26: 78,
};

const DEFAULT_WEIGHTS = {
  sala_ventas: 15,
  protocolo_atencion: 20,
  indagacion_necesidades: 15,
  conocimiento_vendedor: 20,
  cierre_seguimiento: 15,
  satisfaccion_general: 15,
};

const BLOCK_LABELS = {
  sala_ventas: 'Sala de ventas',
  protocolo_atencion: 'Protocolo de atención',
  indagacion_necesidades: 'Indagación de necesidades',
  conocimiento_vendedor: 'Conocimiento del vendedor',
  cierre_seguimiento: 'Cierre y seguimiento',
  satisfaccion_general: 'Satisfacción general',
};

/* Descripciones cortas de cada bloque, para tooltips en la UI. */
const BLOCK_DESCRIPTIONS = {
  sala_ventas: 'Infraestructura y presentación del espacio de ventas: comodidad, iluminación, orden, material del proyecto (P2).',
  protocolo_atencion: '% de conductas de atención cumplidas por el vendedor durante la visita: saludo, trato, manejo de tiempos, etc. (P3).',
  indagacion_necesidades: '% de preguntas de indagación realizadas sobre presupuesto, plazos, tipo de producto y financiamiento (P5 y P16).',
  conocimiento_vendedor: 'Conocimiento del vendedor sobre el proyecto y la competencia, y su disposición a resolver dudas (P10).',
  cierre_seguimiento: 'Combina si facilita la compra, deja próximo paso, entrega cotización y hace seguimiento a 7 días (P21, P23-P26).',
  satisfaccion_general: 'Nota 1-7 de satisfacción del cliente incógnito con la experiencia de compra, convertida a escala 0-100 (P22).',
};

/* Indicadores tácticos individuales — mapeo confirmado contra la
   plantilla real "Piloto Cliente Incógnito" (ver computeVisitScores):
   - cotizacion              ← P25 ("Finalmente, el vendedor le entrega la
     cotización física... RU": 1=entrega=100, 2=la enviará por mail=50,
     3=no entrega=0). P25 también sigue alimentando el bloque "Cierre y
     seguimiento" — es la misma pregunta usada con dos propósitos.
   - proximo_paso            ← promedio de P23 ("¿deja algún tema
     pendiente... o se limita a despedirse sin dejar identificado el
     próximo paso?") y P24 ("El vendedor describe cuáles son los
     siguientes pasos..."), ambas Sí/No sobre lo mismo desde ángulos
     distintos.
   - descuentos              ← P18 ("Al preguntar si la inmobiliaria hace
     descuento y/o promociones, ¿qué responde? RU": 1=no hacen
     descuentos=0; 2/3/4=explica alguna forma de descuento=100).
   - financiamiento_espontaneo ← P14 ("¿El vendedor le informa de manera
     espontánea las posibilidades de financiamiento?": 1=espontáneamente
     =100, 2=sólo cuando se lo preguntó=0).
   P21 ("¿la atención facilita la compra?") y P24 en solitario ya no se
   exponen como indicador táctico propio — P21 no corresponde a ninguno
   de los 4 conceptos de este grid; P24 se fusiona con P23 arriba. Ambas
   siguen intactas dentro del bloque "Cierre y seguimiento". */
const TACTICAL_LABELS = {
  cotizacion: 'Entrega/promete cotización',
  proximo_paso: 'Deja próximo paso',
  descuentos: 'Explica descuentos',
  financiamiento_espontaneo: 'Financiamiento espontáneo',
};

/* Pregunta completa del cuestionario detrás de cada indicador táctico,
   para mostrar como tooltip en la UI (ver TACTICAL_LABELS arriba). */
const TACTICAL_DESCRIPTIONS = {
  cotizacion: 'P25 — "Finalmente, el vendedor le entrega la cotización física del producto cotizado junto con todo el material del proyecto": 1) Sí, entrego cotización, 2) La enviará por mail, 3) No entregó nada ni se comprometió a enviarla.',
  proximo_paso: 'Promedio de P23 — "Al concluir la visita, ¿el vendedor intenta dejar algún tema pendiente que le dé motivos para llamarlo en unos días más, o se limita a despedirse sin dejar identificado el próximo paso?" — y P24 — "El vendedor describe cuáles son los siguientes pasos, de no existir impedimentos en la compra de la vivienda" (Sí/No).',
  descuentos: 'P18 — "Al preguntar si la inmobiliaria hace algún descuento y/o promociones, ¿qué responde el vendedor?": 1) No hacen descuentos, 2) Solo cuando hay unidades en promoción, 3) Depende de la oferta del comprador, 4) Está considerado un descuento en la cotización.',
  financiamiento_espontaneo: 'P14 — "¿El vendedor le informa de manera espontánea las posibilidades de financiamiento existentes?": 1) Espontáneamente, 2) Solo cuando se lo preguntó.',
  diferenciador: 'P12/P13 — "¿Destaca algún elemento como diferenciador del proyecto con respecto a la competencia?" y, si la respuesta es Sí, "¿Qué elementos diferenciadores destaca el vendedor?" (multiple).',
  hallazgo: 'Porcentaje de visitas a proyectos ACTIVA con al menos un hallazgo de coaching comercial (ver tabla "Hallazgos comerciales" más abajo).',
};

/* ------------------------------------------------------------
   2. UTILIDADES DE NORMALIZACIÓN
   ------------------------------------------------------------ */
function stripAccents(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function cleanStr(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\s+/g, ' ').trim();
}
function normYesNo(raw) {
  const v = stripAccents(cleanStr(raw)).toLowerCase();
  if (v === 'si') return 'Si';
  if (v === 'no') return 'No';
  return null;
}
function yn01(raw) {
  return normYesNo(raw) === 'Si' ? 1 : 0;
}

/* Regla de negocio #1: P5.6 (renta corta/larga) depende de P5.5
   (¿pregunta objetivo uso/inversión?). Si P5.5 no fue "Si", el
   dato de P5.6 no aplica y se limpia a null, sin importar lo que
   traiga la celda origen (evita respuestas fantasma). */
function normRentaTipo(p5_5_raw, p5_6_raw) {
  if (normYesNo(p5_5_raw) !== 'Si') return null;
  const v = stripAccents(cleanStr(p5_6_raw)).toLowerCase();
  if (v === 'si' || v === 'corta') return 'Renta corta';
  if (v === 'no' || v === 'larga') return 'Renta larga / tradicional';
  return null;
}

/* Regla de negocio #2: en P7 (¿lo acompaña a ver el piloto?), los
   casos "NA" se recodifican como "No" (el vendedor no acompañó). */
function normP7(raw) {
  const v = cleanStr(raw);
  if (stripAccents(v).toUpperCase() === 'NA') return 'No';
  const yn = normYesNo(v);
  if (yn) return yn;
  if (stripAccents(v).toLowerCase().includes('responsable')) return 'Existe responsable en Piloto';
  return v || null;
}

/* Regla de negocio #3 (confirmada): en P6 (¿le ofrece visitar el
   piloto?), "NA" se deja como categoría propia "No aplica" — no se
   fusiona con "No", porque puede significar que no hay piloto que
   mostrar. */
function normP6(raw) {
  const v = cleanStr(raw);
  if (stripAccents(v).toUpperCase() === 'NA') return 'No aplica';
  const yn = normYesNo(v);
  return yn || v || null;
}

function parseMultiselect(raw) {
  const v = cleanStr(raw);
  if (!v) return [];
  return v.split(',').map((x) => x.trim()).filter(Boolean);
}

/* Nombres de vendedor: limpieza básica + fusión automática de
   variantes (ej. "Juliana Marin" y "Juliana Marin Tamayo") cuando
   los tokens de un nombre son subconjunto del otro. Se registra
   cada fusión para dejarla visible en "Calidad de datos". */
function titleCase(s) {
  return cleanStr(s)
    .split(' ')
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(' ');
}
function mergeVendorNames(rawNames) {
  const cleaned = rawNames.map(titleCase);
  const uniq = [...new Set(cleaned.filter(Boolean))];
  const tokensOf = (n) => stripAccents(n).toLowerCase().split(' ').filter(Boolean);
  const canonical = {};
  const merges = [];
  // orden: nombres más largos (más tokens) primero, para que sean el "destino" de la fusión
  const sorted = [...uniq].sort((a, b) => tokensOf(b).length - tokensOf(a).length);
  for (const name of uniq) canonical[name] = name;
  for (const short of sorted) {
    const shortTok = tokensOf(short);
    for (const long of sorted) {
      if (long === short) continue;
      if (tokensOf(long).length <= shortTok.length) continue;
      const longTok = tokensOf(long);
      const isSubset = shortTok.every((t, i) => longTok[i] === t);
      if (isSubset && canonical[short] === short) {
        canonical[short] = long;
        merges.push({ de: short, a: long });
      }
    }
  }
  return { cleanName: (raw) => canonical[titleCase(raw)] || titleCase(raw), merges };
}

/* ------------------------------------------------------------
   3. FECHAS Y HORAS
   ------------------------------------------------------------ */
function parseFechaVisita(raw) {
  const v = cleanStr(raw);
  const m = v.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (!m) return { iso: null, raw: v };
  const [, d, mo, y] = m;
  const iso = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  return { iso, raw: v };
}
function parseHora(raw) {
  const v = cleanStr(raw);
  const m = v.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

/* ------------------------------------------------------------
   4. SCORING POR BLOQUE (0-100)
   ------------------------------------------------------------ */
function pct01(arr) {
  const vals = arr.filter((v) => v !== null && v !== undefined);
  if (!vals.length) return null;
  return round1((100 * vals.reduce((a, b) => a + b, 0)) / vals.length);
}
function scale17(arr) {
  const vals = arr.filter((v) => typeof v === 'number' && !isNaN(v));
  if (!vals.length) return null;
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return round1(((avg - 1) / 6) * 100);
}
function round1(n) {
  return Math.round(n * 10) / 10;
}

function computeVisitScores(row) {
  const sala_ventas = scale17(COL.P2.map((c) => row[c]));
  const protocolo_atencion = pct01(COL.P3.map((c) => yn01(row[c])));
  const indagacionItems = [
    yn01(row[COL.P5_1]), yn01(row[COL.P5_2]), yn01(row[COL.P5_3]), yn01(row[COL.P5_4]), yn01(row[COL.P5_5]),
    ...COL.P16.map((c) => yn01(row[c])),
  ];
  const indagacion_necesidades = pct01(indagacionItems);
  const conocimiento_vendedor = scale17(COL.P10.map((c) => row[c]));

  const p21 = yn01(row[COL.P21]) * 100;
  const p23 = cleanStr(row[COL.P23]).startsWith('1') ? 100 : 0;
  const p24 = yn01(row[COL.P24]) * 100;
  const p25raw = cleanStr(row[COL.P25]);
  const p25 = p25raw.startsWith('1') ? 100 : p25raw.startsWith('2') ? 50 : 0;
  const p26answer = normYesNo(row[COL.P26]);

  let cierre_seguimiento, seguimientoDisponible;
  if (p26answer !== null) {
    const p26 = p26answer === 'Si' ? 100 : 0;
    cierre_seguimiento = round1(0.25 * p21 + 0.2 * p23 + 0.25 * p24 + 0.15 * p25 + 0.15 * p26);
    seguimientoDisponible = true;
  } else {
    cierre_seguimiento = round1((0.25 * p21 + 0.2 * p23 + 0.25 * p24 + 0.15 * p25) / 0.85);
    seguimientoDisponible = false;
  }
  const satisfaccion_general = scale17([row[COL.P22]]);

  // Indicadores tácticos — columnas P14/P18 no se usan en ningún bloque
  // del índice, se leen solo para este grid (ver comentario en TACTICAL_LABELS).
  const p14raw = cleanStr(row[COL.P14]);
  const p14 = p14raw ? (p14raw.startsWith('1') ? 100 : 0) : null;
  const p18raw = cleanStr(row[COL.P18]);
  const p18 = p18raw ? (p18raw.startsWith('1') ? 0 : 100) : null;
  const proximoPasoTactico = (p23 + p24) / 2;

  return {
    scores: { sala_ventas, protocolo_atencion, indagacion_necesidades, conocimiento_vendedor, cierre_seguimiento, satisfaccion_general },
    tactico: { cotizacion: p25, proximo_paso: proximoPasoTactico, descuentos: p18, financiamiento_espontaneo: p14 },
    seguimientoDisponible,
  };
}

function compositeScore(scores, weights) {
  const totalW = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  let sum = 0, wSum = 0;
  for (const k of Object.keys(BLOCK_LABELS)) {
    const v = scores[k];
    const w = weights[k] || 0;
    if (v === null || v === undefined) continue;
    sum += v * w;
    wSum += w;
  }
  if (!wSum) return null;
  return round1(sum / (wSum)); // ya pesado; wSum normaliza si faltan bloques
}

/* ------------------------------------------------------------
   4b. HALLAZGOS COMERCIALES (reglas de coaching, por visita)
   Distinto de los "flags" de calidad de datos que ya se generan en
   parseBBDDFile (esos son de integridad del dato, ej. fecha fuera de
   rango). Estas reglas son de coaching comercial: una visita puede
   generar 0 o varios hallazgos, cada uno independiente.
   ------------------------------------------------------------ */
const FINDING_RULES = [
  {
    check: (v) => v.p6_ofrece_piloto === 'No',
    hallazgo: 'No ofreció visitar el piloto',
    severidad: 'Alta',
    accion: 'Reforzar guion de cierre y oferta de piloto.',
  },
  {
    check: (v) => v.tactico && v.tactico.proximo_paso !== null && v.tactico.proximo_paso < 50,
    hallazgo: 'No dejó próximo paso definido',
    severidad: 'Media',
    accion: 'Coaching en cierre consultivo.',
  },
  {
    check: (v) => v.seguimiento_disponible === false,
    hallazgo: 'Sin seguimiento registrado a 7 días',
    severidad: 'Media',
    accion: 'Automatizar recordatorio de seguimiento en CRM.',
  },
  {
    check: (v) => v.scores.indagacion_necesidades !== null && v.scores.indagacion_necesidades < 60,
    hallazgo: 'Baja indagación de necesidades',
    severidad: 'Media',
    accion: 'Reforzar guion de indagación de necesidades.',
  },
  {
    check: (v) => v.tactico && v.tactico.financiamiento_espontaneo === 0,
    hallazgo: 'No ofreció financiamiento espontáneamente',
    severidad: 'Baja',
    accion: 'Entrenar argumentario de financiamiento.',
  },
];
function computeFindings(visit) {
  return FINDING_RULES
    .filter((r) => r.check(visit))
    .map((r) => ({ hallazgo: r.hallazgo, severidad: r.severidad, accion: r.accion }));
}

/* ------------------------------------------------------------
   5. PARSER DE EXCEL (SheetJS)
   ------------------------------------------------------------ */
function findHeaderRowIdx(rows, keyCol, keyValue) {
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const cell = cleanStr(rows[i] ? rows[i][keyCol] : '');
    if (cell.toUpperCase() === keyValue) return i;
  }
  return -1;
}

function sheetToRows(ws) {
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
}

function pickSheet(wb, matcher) {
  const name = wb.SheetNames.find(matcher);
  return name ? wb.Sheets[name] : null;
}

async function parseBBDDFile(file, master, weights, refDate) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: false });

  const mainSheet = pickSheet(wb, (n) => /cliente/i.test(n) && /incog/i.test(n)) || wb.Sheets[wb.SheetNames[0]];
  if (!mainSheet) throw new Error('No se encontró una hoja principal en el archivo.');

  const mainRows = sheetToRows(mainSheet);
  const headerIdx = findHeaderRowIdx(mainRows, COL.ID, 'ID');
  if (headerIdx === -1) {
    throw new Error(
      'No se reconoce la estructura del archivo: no se encontró la fila de encabezado ("ID") en las primeras filas. ' +
      'Verifica que estás subiendo la planilla de "Cliente Incógnito" con el mismo formato de siempre.'
    );
  }
  const dataRows = mainRows.slice(headerIdx + 1).filter((r) => r && r[COL.ID] !== null && r[COL.ID] !== '');

  const masterById = {};
  master.forEach((p) => (masterById[p.id] = p));

  const flags = [];
  const notFoundInMaster = [];
  const rawVendorNames = dataRows.map((r) => r[COL.VENDEDOR]).filter(Boolean);
  const { cleanName, merges } = mergeVendorNames(rawVendorNames);

  const visits = [];
  for (const row of dataRows) {
    const pid = parseInt(row[COL.PROYECTO_ID], 10);
    if (isNaN(pid)) continue;
    const meta = masterById[pid];
    if (!meta) {
      notFoundInMaster.push({ project_id: pid, id_respuesta: row[COL.ID] });
      flags.push(`Respuesta ${row[COL.ID]}: el proyecto ID ${pid} no está en el maestro de competencia cargado — no se pudo clasificar (ACTIVA/competencia, comuna). Revisa si falta actualizar el maestro.`);
      continue;
    }

    const fecha = parseFechaVisita(row[COL.FECHA_VISITA]);
    if (refDate && fecha.iso) {
      const diffDays = Math.abs((new Date(fecha.iso) - new Date(refDate)) / 86400000);
      if (diffDays > 60) {
        flags.push(`Proyecto ${pid} (${meta.nombre}): fecha de visita "${fecha.raw}" está a ${Math.round(diffDays)} días de la fecha de referencia de la ola — revisar posible error de tipeo.`);
      }
    }
    const llegada = parseHora(row[COL.HORA_LLEGADA]);
    const salida = parseHora(row[COL.HORA_SALIDA]);
    if (llegada !== null && salida !== null && salida < llegada && llegada - salida > 180) {
      flags.push(`Proyecto ${pid} (${meta.nombre}): hora de salida (${cleanStr(row[COL.HORA_SALIDA])}) es anterior a la de llegada (${cleanStr(row[COL.HORA_LLEGADA])}) por más de 3h — probable error de tipeo.`);
    }

    const { scores, tactico, seguimientoDisponible } = computeVisitScores(row);
    if (!seguimientoDisponible) {
      flags.push(`Respuesta ${row[COL.ID]} — Proyecto ${pid} (${meta.nombre}): P26 (seguimiento a 7 días) sin responder.`);
    }

    visits.push({
      id_respuesta: row[COL.ID],
      project_id: pid,
      project_name: meta.nombre,
      comuna: meta.comuna,
      inmobiliaria: meta.inmobiliaria,
      grupo: meta.grupo ?? null,
      is_activa: meta.inmobiliaria === 'ACTIVA GRUPO INMOBILIARIO',
      vendedor: cleanName(row[COL.VENDEDOR]),
      vendedor_raw: cleanStr(row[COL.VENDEDOR]),
      encuestador: row[COL.NOMBRE_ENCUESTADOR],
      fecha_visita: fecha.iso || fecha.raw,
      p6_ofrece_piloto: normP6(row[COL.P6]),
      p7_acompana_piloto: normP7(row[COL.P7]),
      tipo_renta: normRentaTipo(row[COL.P5_5], row[COL.P5_6]),
      aspectos_destacados: parseMultiselect(row[COL.P9]),
      elementos_diferenciadores: parseMultiselect(row[COL.P13]),
      scores,
      tactico,
      composite: compositeScore(scores, weights),
      seguimiento_disponible: seguimientoDisponible,
    });
  }

  const surveyedIds = new Set(visits.map((v) => v.project_id));
  const notSurveyed = master.filter((p) => !surveyedIds.has(p.id));

  return { visits, flags, notFoundInMaster, notSurveyed, vendorMerges: merges };
}

async function parseMasterFile(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = sheetToRows(ws);
  // El maestro trae columnas antes de "ID" (en la versión actual, "Grupo";
  // en versiones viejas, una columna vacía) — por eso buscamos "ID" en
  // cualquiera de las primeras 3 columnas y todo lo demás se ubica en
  // relación a esa posición ("offset"), no por nombre de encabezado.
  let headerIdx = -1, offset = 0;
  outer: for (let i = 0; i < Math.min(rows.length, 6); i++) {
    for (let c = 0; c < 3; c++) {
      if (cleanStr(rows[i] ? rows[i][c] : '').toUpperCase() === 'ID') {
        headerIdx = i; offset = c; break outer;
      }
    }
  }
  if (headerIdx === -1) throw new Error('No se reconoce la estructura del maestro de proyectos (no se encontró columna "ID").');
  const proyectos = [];
  rows.slice(headerIdx + 1).forEach((r) => {
    if (!r || r[offset] === null || r[offset] === '') return;
    const id = parseInt(r[offset], 10);
    if (isNaN(id)) return;
    proyectos.push({
      id,
      tpo: cleanStr(r[offset + 1]),
      comuna: cleanStr(r[offset + 2]),
      nombre: cleanStr(r[offset + 3]),
      direccion: cleanStr(r[offset + 4]),
      inmobiliaria: cleanStr(r[offset + 5]),
      // "Grupo": cluster de competencia directa de una sala ACTIVA (1..5,
      // puede crecer). Va en la columna justo antes de "ID"; si el archivo
      // no la trae (maestro viejo, offset=0), queda null.
      grupo: offset > 0 ? (cleanStr(r[offset - 1]) || null) : null,
      link: cleanStr(r[offset + 6]) || null,
    });
  });
  return proyectos;
}

/* ------------------------------------------------------------
   6. STORAGE (localStorage) — multi-ola
   ------------------------------------------------------------ */
const LS_KEYS = { waves: 'msd_waves_v1', weights: 'msd_weights_v1', master: 'msd_master_v1' };

function loadWaves() {
  try { return JSON.parse(localStorage.getItem(LS_KEYS.waves)) || []; } catch (e) { return []; }
}
function saveWaves(waves) { localStorage.setItem(LS_KEYS.waves, JSON.stringify(waves)); }
function loadWeights() {
  try { return { ...DEFAULT_WEIGHTS, ...(JSON.parse(localStorage.getItem(LS_KEYS.weights)) || {}) }; }
  catch (e) { return { ...DEFAULT_WEIGHTS }; }
}
function saveWeights(w) { localStorage.setItem(LS_KEYS.weights, JSON.stringify(w)); }
function loadMaster() {
  try { const m = JSON.parse(localStorage.getItem(LS_KEYS.master)); if (m && m.length) return m; } catch (e) {}
  return null;
}
function saveMaster(m) { localStorage.setItem(LS_KEYS.master, JSON.stringify(m)); }

function recomputeWaveComposites(wave, weights) {
  wave.visits.forEach((v) => { v.composite = compositeScore(v.scores, weights); });
  return wave;
}

Object.assign(APP, {
  COL, DEFAULT_WEIGHTS, BLOCK_LABELS, BLOCK_DESCRIPTIONS, TACTICAL_LABELS, TACTICAL_DESCRIPTIONS,
  normYesNo, normP6, normP7, normRentaTipo, parseMultiselect, mergeVendorNames,
  parseFechaVisita, parseHora,
  computeVisitScores, compositeScore, computeFindings,
  parseBBDDFile, parseMasterFile,
  loadWaves, saveWaves, loadWeights, saveWeights, loadMaster, saveMaster,
  recomputeWaveComposites,
});
