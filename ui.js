/* ============================================================
   UI — construida sobre APP (app.js). Vanilla JS, sin build step.
   ============================================================ */

const state = {
  waves: APP.loadWaves(),
  weights: APP.loadWeights(),
  master: APP.loadMaster(),
  activeTab: 'cargar',
  selectedWaveId: null,
  pendingParse: null,
  detailFilter: { comuna: 'all', grupo: 'all', ola: 'all' },
  detailSort: { col: 'composite', dir: 'desc' },
  activaFilter: { projects: null, waveId: null, vendedor: 'todos', filtersOpen: true },
  configAiWaveId: null,
};
const charts = {};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const fmt1 = (n) => (n === null || n === undefined ? '—' : n.toFixed(1));
const fmtPct = (n) => (n === null || n === undefined ? '—' : `${n.toFixed(0)}%`);

function uid() { return 'w_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

async function ensureMaster() {
  if (state.master && state.master.length) return state.master;
  const res = await fetch('data/master.json');
  const json = await res.json();
  state.master = json.proyectos;
  return state.master;
}

function lastWave() {
  if (!state.waves.length) return null;
  return [...state.waves].sort((a, b) => new Date(b.refDate) - new Date(a.refDate))[0];
}
function getWave(id) { return state.waves.find((w) => w.id === id); }

/* ------------------------------------------------------------
   TABS
   ------------------------------------------------------------ */
function initTabs() {
  $$('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.activeTab = btn.dataset.tab;
      $$('.tab-btn').forEach((b) => b.classList.toggle('is-active', b === btn));
      $$('.tab-panel').forEach((p) => p.classList.toggle('is-active', p.id === `panel-${btn.dataset.tab}`));
      renderActiveTab();
    });
  });
}
function renderActiveTab() {
  if (!state.selectedWaveId) { const w = lastWave(); if (w) state.selectedWaveId = w.id; }
  if (state.activeTab === 'cargar') renderCargarTab();
  if (state.activeTab === 'resumen') renderResumenTab();
  if (state.activeTab === 'activa') renderProyectosActivaTab();
  if (state.activeTab === 'evolucion') renderEvolucionTab();
  if (state.activeTab === 'detalle') renderDetalleTab();
  if (state.activeTab === 'calidad') renderCalidadTab();
  if (state.activeTab === 'config') renderConfigTab();
}

/* ------------------------------------------------------------
   CARGAR
   ------------------------------------------------------------ */
let dropFiles = { bbdd: null, master: null };

function renderCargarTab() {
  const root = $('#panel-cargar');
  root.innerHTML = `
    <div class="grid-2">
      <div class="dropzone" id="dz-bbdd">
        <div class="dz-icon">＋</div>
        <p class="dz-title">Encuesta Cliente Incógnito</p>
        <p class="dz-sub">Arrastra el .xlsx acá, o haz clic para elegirlo</p>
        <p class="dz-file" id="dz-bbdd-file"></p>
        <input type="file" id="dz-bbdd-input" accept=".xlsx" hidden />
      </div>
      <div class="dropzone dropzone--secondary" id="dz-master">
        <div class="dz-icon">＋</div>
        <p class="dz-title">Maestro de proyectos <span class="tag-optional">opcional</span></p>
        <p class="dz-sub">Si no subes uno, se usa el maestro guardado o el de referencia</p>
        <p class="dz-file" id="dz-master-file"></p>
        <input type="file" id="dz-master-input" accept=".xlsx" hidden />
      </div>
    </div>

    <div class="wave-form">
      <div class="field">
        <label>Nombre de la ola</label>
        <input type="text" id="wave-label" value="Ola ${state.waves.length + 1}" />
      </div>
      <div class="field">
        <label>Fecha de referencia</label>
        <input type="date" id="wave-date" value="${new Date().toISOString().slice(0, 10)}" />
      </div>
      <button class="btn btn-primary" id="btn-procesar" disabled>Procesar archivo</button>
    </div>

    <div id="parse-preview"></div>

    <div class="waves-list">
      <h3>Olas cargadas (${state.waves.length})</h3>
      ${state.waves.length ? renderWavesTable() : '<p class="empty-hint">Todavía no hay olas cargadas. Sube el primer archivo arriba.</p>'}
    </div>
  `;

  const dzBbdd = $('#dz-bbdd'), dzMaster = $('#dz-master');
  setupDropzone(dzBbdd, $('#dz-bbdd-input'), (file) => {
    dropFiles.bbdd = file;
    $('#dz-bbdd-file').textContent = file.name;
    dzBbdd.classList.add('has-file');
    $('#btn-procesar').disabled = false;
  });
  setupDropzone(dzMaster, $('#dz-master-input'), (file) => {
    dropFiles.master = file;
    $('#dz-master-file').textContent = file.name;
    dzMaster.classList.add('has-file');
  });

  $('#btn-procesar').addEventListener('click', onProcesar);
}

function setupDropzone(zone, input, onFile) {
  zone.addEventListener('click', () => input.click());
  input.addEventListener('change', (e) => { if (e.target.files[0]) onFile(e.target.files[0]); });
  ['dragenter', 'dragover'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('is-dragover'); }));
  ['dragleave', 'drop'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove('is-dragover'); }));
  zone.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) onFile(f); });
}

async function onProcesar() {
  const btn = $('#btn-procesar');
  btn.disabled = true; btn.textContent = 'Procesando…';
  try {
    let master = state.master;
    if (dropFiles.master) {
      master = await APP.parseMasterFile(dropFiles.master);
    } else {
      master = await ensureMaster();
    }
    const refDate = $('#wave-date').value;
    const result = await APP.parseBBDDFile(dropFiles.bbdd, master, state.weights, refDate);
    state.pendingParse = {
      id: uid(),
      label: $('#wave-label').value.trim() || `Ola ${state.waves.length + 1}`,
      refDate,
      uploadedAt: new Date().toISOString(),
      masterUsed: master,
      ...result,
    };
    renderParsePreview();
  } catch (err) {
    $('#parse-preview').innerHTML = `<div class="alert alert-error"><strong>No se pudo procesar el archivo.</strong><br>${err.message}</div>`;
  } finally {
    btn.disabled = false; btn.textContent = 'Procesar archivo';
  }
}

function renderParsePreview() {
  const p = state.pendingParse;
  const nActiva = p.visits.filter((v) => v.is_activa).length;
  const nComp = p.visits.length - nActiva;
  const nComunas = new Set(p.visits.map((v) => v.comuna)).size;
  const errCount = p.notFoundInMaster.length;
  $('#parse-preview').innerHTML = `
    <div class="preview-card">
      <div class="preview-kpis">
        <div class="mini-kpi"><span>${p.visits.length}</span>visitas leídas</div>
        <div class="mini-kpi"><span>${nActiva}</span>ACTIVA</div>
        <div class="mini-kpi"><span>${nComp}</span>competencia</div>
        <div class="mini-kpi"><span>${nComunas}</span>comunas</div>
        <div class="mini-kpi ${p.flags.length ? 'mini-kpi--warn' : ''}"><span>${p.flags.length}</span>alertas</div>
        <div class="mini-kpi ${errCount ? 'mini-kpi--error' : ''}"><span>${errCount}</span>sin maestro</div>
        <div class="mini-kpi"><span>${p.vendorMerges.length}</span>vendedores fusionados</div>
      </div>
      ${errCount ? `<div class="alert alert-error">${errCount} respuesta(s) no calzan con ningún proyecto del maestro y quedaron fuera del análisis. Revísalas en la pestaña "Calidad de datos" luego de guardar, o corrige el maestro antes de guardar.</div>` : ''}
      <div class="preview-actions">
        <button class="btn btn-primary" id="btn-guardar-ola">Guardar esta ola</button>
        <button class="btn btn-ghost" id="btn-cancelar-ola">Cancelar</button>
      </div>
    </div>
  `;
  $('#btn-guardar-ola').addEventListener('click', () => {
    state.waves.push(state.pendingParse);
    APP.saveWaves(state.waves);
    if (dropFiles.master) { APP.saveMaster(state.pendingParse.masterUsed); state.master = state.pendingParse.masterUsed; }
    state.selectedWaveId = state.pendingParse.id;
    state.pendingParse = null;
    dropFiles = { bbdd: null, master: null };
    renderCargarTab();
  });
  $('#btn-cancelar-ola').addEventListener('click', () => {
    state.pendingParse = null;
    renderCargarTab();
  });
}

function renderWavesTable() {
  const rows = [...state.waves]
    .sort((a, b) => new Date(b.refDate) - new Date(a.refDate))
    .map((w) => `
      <tr>
        <td>${w.label}</td>
        <td>${w.refDate}</td>
        <td>${w.visits.length}</td>
        <td>${w.flags.length}</td>
        <td class="row-actions">
          <button class="link-btn" data-act="view" data-id="${w.id}">Ver resumen</button>
          <button class="link-btn" data-act="export" data-id="${w.id}">Exportar</button>
          <button class="link-btn link-btn--danger" data-act="delete" data-id="${w.id}">Eliminar</button>
        </td>
      </tr>`).join('');
  return `
    <table class="data-table">
      <thead><tr><th>Ola</th><th>Fecha ref.</th><th>Visitas</th><th>Alertas</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function bindWavesTableActions() {
  $$('#panel-cargar [data-act]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const act = btn.dataset.act;
      if (act === 'view') {
        state.selectedWaveId = id;
        document.querySelector('.tab-btn[data-tab="resumen"]').click();
      } else if (act === 'export') {
        const w = getWave(id);
        downloadJSON(w, `${w.label.replace(/\s+/g, '_')}.json`);
      } else if (act === 'delete') {
        if (confirm(`¿Eliminar la ola "${getWave(id).label}"? Esta acción no se puede deshacer.`)) {
          state.waves = state.waves.filter((w) => w.id !== id);
          APP.saveWaves(state.waves);
          if (state.selectedWaveId === id) state.selectedWaveId = null;
          renderCargarTab();
        }
      }
    });
  });
}

function downloadJSON(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

/* ------------------------------------------------------------
   RESUMEN
   ------------------------------------------------------------ */
function renderResumenTab() {
  const root = $('#panel-resumen');
  if (!state.waves.length) { root.innerHTML = emptyState('Sube una encuesta en "Cargar datos" para ver el resumen.'); return; }
  const wave = getWave(state.selectedWaveId) || lastWave();
  state.selectedWaveId = wave.id;

  const activa = wave.visits.filter((v) => v.is_activa);
  const comp = wave.visits.filter((v) => !v.is_activa);
  const avg = (arr, key) => { const vals = arr.map((v) => v.composite).filter((x) => x !== null); return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null; };
  const idxActiva = avg(activa), idxComp = avg(comp);
  const gap = idxActiva !== null && idxComp !== null ? idxActiva - idxComp : null;
  const coverage = Math.round((wave.visits.length / (wave.visits.length + wave.notSurveyed.length)) * 100);
  const segPct = Math.round((wave.visits.filter((v) => v.seguimiento_disponible).length / wave.visits.length) * 100);

  root.innerHTML = `
    <div class="wave-selector">
      <label>Ola:</label>
      <select id="resumen-wave-select">
        ${state.waves.map((w) => `<option value="${w.id}" ${w.id === wave.id ? 'selected' : ''}>${w.label} — ${w.refDate}</option>`).join('')}
      </select>
    </div>

    <div class="kpi-row">
      <div class="kpi-card kpi-card--activa">
        <div class="kpi-label">Índice ACTIVA</div>
        <div class="kpi-value">${fmt1(idxActiva)}</div>
        <div class="kpi-sub">n=${activa.length} proyectos</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Índice competencia</div>
        <div class="kpi-value">${fmt1(idxComp)}</div>
        <div class="kpi-sub">n=${comp.length} proyectos</div>
      </div>
      <div class="kpi-card ${gap >= 0 ? 'kpi-card--pos' : 'kpi-card--neg'}">
        <div class="kpi-label">Brecha ACTIVA vs competencia</div>
        <div class="kpi-value">${gap === null ? '—' : (gap >= 0 ? '+' : '') + fmt1(gap)}</div>
        <div class="kpi-sub">puntos sobre 100</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Cobertura del maestro</div>
        <div class="kpi-value">${coverage}%</div>
        <div class="kpi-sub">${wave.visits.length} de ${wave.visits.length + wave.notSurveyed.length} proyectos</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Seguimiento registrado</div>
        <div class="kpi-value">${segPct}%</div>
        <div class="kpi-sub">visitas con P26 completo</div>
      </div>
    </div>

    <div class="grid-2">
      <div class="chart-card">
        <h3>ACTIVA vs Competencia — por bloque</h3>
        <canvas id="chart-blocks"></canvas>
      </div>
      <div class="chart-card">
        <h3>Índice compuesto por comuna</h3>
        <canvas id="chart-comuna"></canvas>
      </div>
    </div>

    <div class="chart-card">
      <h3>Ranking de proyectos</h3>
      <canvas id="chart-ranking" style="min-height:${Math.max(280, wave.visits.length * 26)}px"></canvas>
    </div>
  `;

  $('#resumen-wave-select').addEventListener('change', (e) => { state.selectedWaveId = e.target.value; renderResumenTab(); });

  renderBlocksChart(activa, comp);
  renderComunaChart(wave.visits);
  renderRankingChart(wave.visits);
}

function blockAvg(arr, key) {
  const vals = arr.map((v) => v.scores[key]).filter((x) => x !== null && x !== undefined);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

function renderBlocksChart(activa, comp) {
  const keys = Object.keys(APP.BLOCK_LABELS);
  const labels = keys.map((k) => APP.BLOCK_LABELS[k]);
  destroyChart('blocks');
  charts.blocks = new Chart($('#chart-blocks'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'ACTIVA', data: keys.map((k) => blockAvg(activa, k)), backgroundColor: '#B8862B' },
        { label: 'Competencia', data: keys.map((k) => blockAvg(comp, k)), backgroundColor: '#5B6472' },
      ],
    },
    options: chartBaseOptions({ y: { max: 100 } }),
  });
}

function renderComunaChart(visits) {
  const comunas = [...new Set(visits.map((v) => v.comuna))].sort();
  const activaData = comunas.map((c) => blockAvgComposite(visits.filter((v) => v.comuna === c && v.is_activa)));
  const compData = comunas.map((c) => blockAvgComposite(visits.filter((v) => v.comuna === c && !v.is_activa)));
  destroyChart('comuna');
  charts.comuna = new Chart($('#chart-comuna'), {
    type: 'bar',
    data: {
      labels: comunas,
      datasets: [
        { label: 'ACTIVA', data: activaData, backgroundColor: '#B8862B' },
        { label: 'Competencia', data: compData, backgroundColor: '#5B6472' },
      ],
    },
    options: chartBaseOptions({ y: { max: 100 } }),
  });
}
function blockAvgComposite(arr) {
  const vals = arr.map((v) => v.composite).filter((x) => x !== null && x !== undefined);
  return vals.length ? round1sum(vals) : null;
}
function round1sum(vals) { return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10; }

function renderRankingChart(visits) {
  const sorted = [...visits].sort((a, b) => (b.composite || 0) - (a.composite || 0));
  destroyChart('ranking');
  charts.ranking = new Chart($('#chart-ranking'), {
    type: 'bar',
    data: {
      labels: sorted.map((v) => `${v.project_name} (${v.comuna[0]}${v.comuna.slice(1).toLowerCase()})`),
      datasets: [{
        data: sorted.map((v) => v.composite),
        backgroundColor: sorted.map((v) => (v.is_activa ? '#B8862B' : '#8B95A1')),
      }],
    },
    options: chartBaseOptions({ x: { max: 100 } }, true),
  });
}

function chartBaseOptions(scaleOverrides = {}, horizontal = false) {
  return {
    indexAxis: horizontal ? 'y' : 'x',
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: !horizontal, labels: { usePointStyle: true, boxWidth: 8 } } },
    scales: {
      x: { beginAtZero: true, grid: { display: horizontal }, ...(scaleOverrides.x || {}) },
      y: { beginAtZero: true, grid: { display: !horizontal }, ...(scaleOverrides.y || {}) },
    },
  };
}
function destroyChart(key) { if (charts[key]) { charts[key].destroy(); delete charts[key]; } }

/* ------------------------------------------------------------
   PROYECTOS ACTIVA (foco en los proyectos propios, multi-selección)
   ------------------------------------------------------------ */
const KPI_ICONS = {
  score_global: 'monitoring',
  sala_ventas: 'storefront',
  protocolo_atencion: 'support_agent',
  indagacion_necesidades: 'psychology',
  conocimiento_vendedor: 'school',
  cierre_seguimiento: 'task_alt',
  satisfaccion_general: 'sentiment_satisfied',
};
function kpiLabelHtml(iconKey, text, tooltip) {
  return `<div class="kpi-label tooltip" data-tooltip="${tooltip.replace(/"/g, '&quot;')}"><span class="material-symbols-outlined kpi-icon">${KPI_ICONS[iconKey]}</span>${text}</div>`;
}
function renderProyectosActivaTab() {
  const root = $('#panel-activa');
  if (!state.waves.length) { root.innerHTML = emptyState('Sube una encuesta en "Cargar datos" para ver los proyectos ACTIVA y su competencia.'); return; }

  const af = state.activaFilter;

  // resolver período: 'all' aplana todas las olas, si no se usa la ola seleccionada (o la última)
  let visits, wave = null;
  if (af.waveId === 'all') {
    visits = state.waves.flatMap((w) => w.visits);
  } else {
    wave = getWave(af.waveId) || lastWave();
    af.waveId = wave.id;
    visits = wave.visits;
  }

  // universo completo del período: proyectos propios de ACTIVA + competencia,
  // todos seleccionables por igual (la distinción ACTIVA/competencia queda
  // como marca visual en la pill/ranking, no como filtro de fondo).
  const poolVisits = visits;
  const projectIsActiva = {};
  poolVisits.forEach((v) => { projectIsActiva[v.project_name] = v.is_activa; });
  const projectNames = [...new Set(poolVisits.map((v) => v.project_name))].sort((a, b) => {
    if (projectIsActiva[a] !== projectIsActiva[b]) return projectIsActiva[a] ? -1 : 1;
    return a.localeCompare(b);
  });
  const activaProjectNames = projectNames.filter((p) => projectIsActiva[p]);

  if (!af.projects || [...af.projects].some((p) => !projectNames.includes(p))) {
    af.projects = new Set(projectNames);
  }
  if (af.projects.size === 0) af.projects = new Set(projectNames);

  const inSelection = poolVisits.filter((v) => af.projects.has(v.project_name));
  const execOptions = [...new Set(inSelection.map((v) => v.vendedor))].sort();
  if (af.vendedor !== 'todos' && !execOptions.includes(af.vendedor)) af.vendedor = 'todos';

  const sel = af.vendedor === 'todos' ? inSelection : inSelection.filter((v) => v.vendedor === af.vendedor);

  if (!projectNames.length) {
    root.innerHTML = `
      <div class="filterbar chart-card">
        ${activaPeriodSelectHtml(af)}
      </div>
      ${emptyState('No hay proyectos en el período seleccionado.')}
    `;
    $('#activa-period-select').addEventListener('change', (e) => { af.waveId = e.target.value; renderProyectosActivaTab(); });
    return;
  }

  // ---- agregados ----
  const scoreGlobal = blockAvgComposite(sel);
  const blockKeys = Object.keys(APP.BLOCK_LABELS);
  const blockScores = blockKeys.map((k) => ({ key: k, label: APP.BLOCK_LABELS[k], val: blockAvg(sel, k) }));

  const tacticoAvg = (key) => {
    const vals = sel.map((v) => v.tactico && v.tactico[key]).filter((x) => x !== null && x !== undefined);
    return vals.length ? round1sum(vals) : null;
  };
  const diferenciadorPct = sel.length ? Math.round((sel.filter((v) => v.elementos_diferenciadores.length > 0).length / sel.length) * 100) : null;

  // Los hallazgos comerciales son coaching interno — solo tienen sentido para
  // el propio equipo de ACTIVA, aunque la selección de pills incluya competencia.
  const activaSel = sel.filter((v) => v.is_activa);
  const findings = activaSel.flatMap((v) => APP.computeFindings(v).map((f) => ({ ...f, fecha: v.fecha_visita, proyecto: v.project_name, vendedor: v.vendedor })));
  const visitasConAlerta = new Set(activaSel.filter((v) => APP.computeFindings(v).length > 0).map((v) => v.id_respuesta)).size;
  const alertasPct = activaSel.length ? Math.round((visitasConAlerta / activaSel.length) * 100) : null;

  // embudo comercial
  const pctOf = (n) => (sel.length ? Math.round((n / sel.length) * 100) : 0);
  const funnelSteps = [
    { label: 'Visitas evaluadas', n: sel.length, pct: 100 },
    { label: 'Ofrece visita al piloto', n: sel.filter((v) => v.p6_ofrece_piloto === 'Si').length, pct: pctOf(sel.filter((v) => v.p6_ofrece_piloto === 'Si').length) },
    { label: 'Promete cotización', n: sel.filter((v) => v.tactico && v.tactico.cotizacion >= 50).length, pct: pctOf(sel.filter((v) => v.tactico && v.tactico.cotizacion >= 50).length) },
    { label: 'Deja próximo paso', n: sel.filter((v) => v.tactico && v.tactico.proximo_paso >= 50).length, pct: pctOf(sel.filter((v) => v.tactico && v.tactico.proximo_paso >= 50).length) },
    { label: 'Seguimiento en plazo', n: sel.filter((v) => v.seguimiento_disponible).length, pct: pctOf(sel.filter((v) => v.seguimiento_disponible).length) },
  ];

  // ranking por proyecto (dentro de la selección actual)
  const ranking = projectNames
    .filter((p) => af.projects.has(p))
    .map((p) => ({ name: p, isActiva: projectIsActiva[p], score: blockAvgComposite(sel.filter((v) => v.project_name === p)), n: sel.filter((v) => v.project_name === p).length }))
    .sort((a, b) => (b.score || 0) - (a.score || 0));

  const totalVisitas = sel.length;
  const nSel = af.projects.size;
  const selSummary = nSel === projectNames.length
    ? `Mostrando promedio de <strong>los ${nSel} proyectos</strong> · ${totalVisitas} visitas`
    : nSel === 1
      ? `Mostrando detalle de <strong>${[...af.projects][0]}</strong> · ${totalVisitas} visitas`
      : `Promedio de <strong>${nSel} proyectos seleccionados</strong> · ${totalVisitas} visitas`;

  const periodLabel = af.waveId === 'all' ? 'Todas las olas' : (wave ? `${wave.label} — ${wave.refDate}` : '');
  const execLabel = af.vendedor === 'todos' ? 'Todos los ejecutivos' : af.vendedor;
  const filterCompactSummary = `${nSel} proyecto${nSel === 1 ? '' : 's'} · ${periodLabel} · ${execLabel}`;

  const aiText = wave ? (wave.aiSummary || '').trim() : '';

  root.innerHTML = `
    <div class="filterbar chart-card">
      <div class="filterbar-header" id="activa-filters-toggle">
        <div class="filterbar-header-text">
          <span class="filter-label" style="margin:0;">Filtros</span>
          <span class="filterbar-compact">${filterCompactSummary}</span>
        </div>
        <button class="filterbar-chevron ${af.filtersOpen ? 'is-open' : ''}" type="button" aria-label="Mostrar/ocultar filtros">▾</button>
      </div>
      <div class="filterbar-body" ${af.filtersOpen ? '' : 'style="display:none;"'}>
        <div>
          <label class="filter-label">Proyectos (selección múltiple)</label>
          <div class="project-pills" id="activa-pills">
            <div class="pill all ${nSel === projectNames.length ? 'active' : ''}" data-all="1">Todos los proyectos</div>
            <div class="pill all ${af.projects.size === activaProjectNames.length && activaProjectNames.every((p) => af.projects.has(p)) ? 'active' : ''}" data-onlyactiva="1">Solo ACTIVA</div>
            ${projectNames.map((p) => `<div class="pill ${projectIsActiva[p] ? 'pill--activa' : ''} ${af.projects.has(p) ? 'active' : ''}" data-name="${p}">${p}${projectIsActiva[p] ? ' <span class="badge-activa">ACTIVA</span>' : ''}</div>`).join('')}
          </div>
        </div>
        <div class="filterbar-row">
          <div class="filterbar-selects">
            ${activaPeriodSelectHtml(af)}
            <div>
              <label class="filter-label">Ejecutivo</label>
              <select id="activa-exec-select">
                <option value="todos" ${af.vendedor === 'todos' ? 'selected' : ''}>Todos los ejecutivos</option>
                ${execOptions.map((e) => `<option value="${e}" ${af.vendedor === e ? 'selected' : ''}>${e}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="selection-summary">${selSummary}</div>
        </div>
      </div>
    </div>

    ${aiText ? `
    <div class="ai-summary">
      <div class="ai-summary-icon">✨</div>
      <div>
        <h3>Resumen ejecutivo <span class="tag-ai">Pegado desde LLM</span></h3>
        <p>${aiText.replace(/</g, '&lt;')}</p>
      </div>
    </div>` : ''}

    <div class="kpi-row kpi-row--activa">
      <div class="kpi-card kpi-card--activa">
        ${kpiLabelHtml('score_global', 'Score global', 'Promedio ponderado de los 6 bloques del cuestionario, según los ponderadores definidos en Configuración.')}
        <div class="kpi-value">${fmt1(scoreGlobal)}</div><div class="kpi-sub">/100</div>
      </div>
      ${blockScores.map((b) => `
        <div class="kpi-card">
          ${kpiLabelHtml(b.key, b.label, APP.BLOCK_DESCRIPTIONS[b.key])}
          <div class="kpi-value">${fmt1(b.val)}</div><div class="kpi-sub">/100</div>
        </div>`).join('')}
    </div>

    <div class="grid-2">
      <div class="chart-card">
        <h3>Score por bloque del cuestionario</h3>
        <div class="bars">
          ${blockScores.map((b) => barRowHtml(b.label, b.val, 100, fmt1(b.val))).join('')}
        </div>
      </div>
      <div class="chart-card">
        <h3>Indicadores tácticos</h3>
        <div class="tactical-grid">
          ${Object.keys(APP.TACTICAL_LABELS).map((k) => `<div class="metric-box"><div class="metric-label tooltip" data-tooltip="${APP.TACTICAL_DESCRIPTIONS[k].replace(/"/g, '&quot;')}">${APP.TACTICAL_LABELS[k]}</div><div class="metric-big">${fmtPct(tacticoAvg(k))}</div></div>`).join('')}
          <div class="metric-box"><div class="metric-label tooltip" data-tooltip="${APP.TACTICAL_DESCRIPTIONS.diferenciador.replace(/"/g, '&quot;')}">Destaca diferenciador</div><div class="metric-big">${fmtPct(diferenciadorPct)}</div></div>
          <div class="metric-box"><div class="metric-label tooltip" data-tooltip="${APP.TACTICAL_DESCRIPTIONS.hallazgo.replace(/"/g, '&quot;')}">Visitas ACTIVA con hallazgo</div><div class="metric-big">${fmtPct(alertasPct)}</div></div>
        </div>
      </div>
    </div>

    <div class="grid-2">
      <div class="chart-card">
        <h3>Embudo del proceso comercial</h3>
        <div class="funnel">
          ${funnelSteps.map((s) => `<div class="funnel-step" style="width:${Math.max(s.pct, 30)}%;margin:0 auto;"><span>${s.label}</span><span class="step-val">${s.n} · ${s.pct}%</span></div>`).join('')}
        </div>
      </div>
      <div class="chart-card">
        <h3>Detalle por proyecto seleccionado</h3>
        <div class="bars">
          ${ranking.length ? ranking.map((r) => barRowHtml(r.isActiva ? `${r.name} <span class="badge-activa">ACTIVA</span>` : r.name, r.score, 100, fmt1(r.score))).join('') : '<p class="empty-hint">Sin visitas para la selección actual.</p>'}
        </div>
      </div>
    </div>

    <div class="chart-card">
      <h3>Hallazgos comerciales (${findings.length})</h3>
      <p class="config-hint" style="margin-bottom:12px;">Coaching interno — solo considera visitas a proyectos ACTIVA, aunque la selección de arriba incluya competencia.</p>
      <div class="table-wrap">
        <table class="data-table data-table--dense">
          <thead><tr><th>Fecha</th><th>Proyecto</th><th>Ejecutivo</th><th>Hallazgo</th><th>Severidad</th><th>Acción sugerida</th></tr></thead>
          <tbody>
            ${findings.length ? findings.map((f) => `
              <tr>
                <td>${f.fecha || '—'}</td>
                <td>${f.proyecto}</td>
                <td>${f.vendedor}</td>
                <td>${f.hallazgo}</td>
                <td><span class="tag ${severityTagClass(f.severidad)}">${f.severidad}</span></td>
                <td>${f.accion}</td>
              </tr>`).join('') : `<tr><td colspan="6" class="empty-hint">${activaSel.length ? 'Sin hallazgos para los proyectos ACTIVA seleccionados.' : 'Selecciona al menos un proyecto ACTIVA para ver hallazgos comerciales.'}</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;

  $('#activa-filters-toggle').addEventListener('click', () => {
    af.filtersOpen = !af.filtersOpen;
    renderProyectosActivaTab();
  });
  $('#activa-pills').addEventListener('click', (e) => {
    const pill = e.target.closest('.pill');
    if (!pill) return;
    if (pill.dataset.all) {
      af.projects = new Set(projectNames);
    } else if (pill.dataset.onlyactiva) {
      af.projects = new Set(activaProjectNames);
    } else {
      const name = pill.dataset.name;
      if (af.projects.has(name)) af.projects.delete(name); else af.projects.add(name);
      if (af.projects.size === 0) af.projects = new Set(projectNames);
    }
    renderProyectosActivaTab();
  });
  $('#activa-period-select').addEventListener('change', (e) => { af.waveId = e.target.value; af.projects = null; renderProyectosActivaTab(); });
  $('#activa-exec-select').addEventListener('change', (e) => { af.vendedor = e.target.value; renderProyectosActivaTab(); });
}

function activaPeriodSelectHtml(af) {
  return `
    <div class="period-block">
      <label class="filter-label">Período</label>
      <select id="activa-period-select">
        <option value="all" ${af.waveId === 'all' ? 'selected' : ''}>Todas las olas</option>
        ${[...state.waves].sort((a, b) => new Date(b.refDate) - new Date(a.refDate)).map((w) => `<option value="${w.id}" ${af.waveId === w.id ? 'selected' : ''}>${w.label} — ${w.refDate}</option>`).join('')}
      </select>
    </div>`;
}

function barRowHtml(label, val, max, displayText) {
  const pct = val === null || val === undefined ? 0 : Math.max(2, Math.min(100, (val / max) * 100));
  const cls = val === null || val === undefined ? '' : pct >= 75 ? '' : pct >= 60 ? 'warn' : 'bad';
  return `<div class="bar-row"><div>${label}</div><div class="track"><div class="fill ${cls}" style="width:${pct}%"></div></div><div class="bar-row-val">${val === null || val === undefined ? '—' : displayText}</div></div>`;
}

function severityTagClass(sev) {
  if (sev === 'Alta') return 'tag--alta';
  if (sev === 'Baja') return 'tag--baja';
  return 'tag--media';
}

/* ------------------------------------------------------------
   EVOLUCIÓN
   ------------------------------------------------------------ */
function renderEvolucionTab() {
  const root = $('#panel-evolucion');
  if (state.waves.length < 2) {
    root.innerHTML = emptyState(`Vas ${state.waves.length} de 2 olas mínimo para ver evolución. Cuando cargues la próxima medición, este panel mostrará tendencia automáticamente.`);
    return;
  }
  const waves = [...state.waves].sort((a, b) => new Date(a.refDate) - new Date(b.refDate));
  root.innerHTML = `
    <div class="chart-card">
      <h3>Evolución del índice compuesto — ACTIVA vs Competencia</h3>
      <canvas id="chart-evo-composite"></canvas>
    </div>
    <div class="chart-card">
      <h3>Evolución por bloque (ACTIVA)</h3>
      <canvas id="chart-evo-blocks"></canvas>
    </div>
  `;
  const labels = waves.map((w) => `${w.label}\n${w.refDate}`);
  destroyChart('evoComposite');
  charts.evoComposite = new Chart($('#chart-evo-composite'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'ACTIVA', data: waves.map((w) => blockAvgComposite(w.visits.filter((v) => v.is_activa))), borderColor: '#B8862B', backgroundColor: '#B8862B33', tension: 0.25, fill: true },
        { label: 'Competencia', data: waves.map((w) => blockAvgComposite(w.visits.filter((v) => !v.is_activa))), borderColor: '#5B6472', backgroundColor: '#5B647233', tension: 0.25, fill: true },
      ],
    },
    options: chartBaseOptions({ y: { max: 100 } }),
  });
  const keys = Object.keys(APP.BLOCK_LABELS);
  const palette = ['#B8862B', '#1F6F5C', '#8B5E3C', '#5B6472', '#A45C6B', '#3E6E8E'];
  destroyChart('evoBlocks');
  charts.evoBlocks = new Chart($('#chart-evo-blocks'), {
    type: 'line',
    data: {
      labels,
      datasets: keys.map((k, i) => ({
        label: APP.BLOCK_LABELS[k],
        data: waves.map((w) => blockAvg(w.visits.filter((v) => v.is_activa), k)),
        borderColor: palette[i], backgroundColor: palette[i], tension: 0.25,
      })),
    },
    options: chartBaseOptions({ y: { max: 100 } }),
  });
}

/* ------------------------------------------------------------
   DETALLE
   ------------------------------------------------------------ */
function renderDetalleTab() {
  const root = $('#panel-detalle');
  if (!state.waves.length) { root.innerHTML = emptyState('Sube una encuesta para ver el detalle por proyecto.'); return; }
  const comunas = [...new Set(state.waves.flatMap((w) => w.visits.map((v) => v.comuna)))].sort();

  root.innerHTML = `
    <div class="filters-row">
      <select id="f-ola"><option value="all">Todas las olas</option>${state.waves.map((w) => `<option value="${w.id}">${w.label}</option>`).join('')}</select>
      <select id="f-comuna"><option value="all">Todas las comunas</option>${comunas.map((c) => `<option value="${c}">${c}</option>`).join('')}</select>
      <select id="f-grupo"><option value="all">ACTIVA + competencia</option><option value="activa">Solo ACTIVA</option><option value="comp">Solo competencia</option></select>
    </div>
    <div class="table-wrap" id="detalle-table"></div>
  `;
  $('#f-ola').value = state.detailFilter.ola;
  $('#f-comuna').value = state.detailFilter.comuna;
  $('#f-grupo').value = state.detailFilter.grupo;
  ['f-ola', 'f-comuna', 'f-grupo'].forEach((id) => $('#' + id).addEventListener('change', () => {
    state.detailFilter = { ola: $('#f-ola').value, comuna: $('#f-comuna').value, grupo: $('#f-grupo').value };
    renderDetalleTable();
  }));
  renderDetalleTable();
}

function renderDetalleTable() {
  let rows = state.waves.flatMap((w) => w.visits.map((v) => ({ ...v, olaLabel: w.label, olaId: w.id })));
  const f = state.detailFilter;
  if (f.ola !== 'all') rows = rows.filter((r) => r.olaId === f.ola);
  if (f.comuna !== 'all') rows = rows.filter((r) => r.comuna === f.comuna);
  if (f.grupo === 'activa') rows = rows.filter((r) => r.is_activa);
  if (f.grupo === 'comp') rows = rows.filter((r) => !r.is_activa);

  const cols = [
    { key: 'olaLabel', label: 'Ola' },
    { key: 'project_name', label: 'Proyecto' },
    { key: 'comuna', label: 'Comuna' },
    { key: 'inmobiliaria', label: 'Inmobiliaria' },
    { key: 'vendedor', label: 'Vendedor' },
    { key: 'composite', label: 'Índice' },
    { key: 'sala_ventas', label: 'Sala vtas.' },
    { key: 'protocolo_atencion', label: 'Protocolo' },
    { key: 'indagacion_necesidades', label: 'Indagación' },
    { key: 'conocimiento_vendedor', label: 'Conocim.' },
    { key: 'cierre_seguimiento', label: 'Cierre/seg.' },
    { key: 'satisfaccion_general', label: 'Satisf.' },
    { key: 'seguimiento_disponible', label: 'Seg. reg.' },
  ];
  const val = (r, k) => (k === 'composite' ? r.composite : k in r.scores ? r.scores[k] : r[k]);
  const { col, dir } = state.detailSort;
  rows.sort((a, b) => {
    let av = val(a, col), bv = val(b, col);
    if (typeof av === 'string') { av = av || ''; bv = bv || ''; return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av); }
    av = av ?? -Infinity; bv = bv ?? -Infinity;
    return dir === 'asc' ? av - bv : bv - av;
  });

  const thead = cols.map((c) => `<th data-col="${c.key}" class="${col === c.key ? 'sorted-' + dir : ''}">${c.label}</th>`).join('');
  const tbody = rows.map((r) => `
    <tr>
      <td>${r.olaLabel}</td>
      <td>${r.project_name}${r.is_activa ? ' <span class="badge-activa">ACTIVA</span>' : ''}</td>
      <td>${titleCaseLite(r.comuna)}</td>
      <td>${r.inmobiliaria}</td>
      <td>${r.vendedor}</td>
      <td class="num strong">${fmt1(r.composite)}</td>
      <td class="num">${fmt1(r.scores.sala_ventas)}</td>
      <td class="num">${fmt1(r.scores.protocolo_atencion)}</td>
      <td class="num">${fmt1(r.scores.indagacion_necesidades)}</td>
      <td class="num">${fmt1(r.scores.conocimiento_vendedor)}</td>
      <td class="num">${fmt1(r.scores.cierre_seguimiento)}</td>
      <td class="num">${fmt1(r.scores.satisfaccion_general)}</td>
      <td>${r.seguimiento_disponible ? '✓' : '—'}</td>
    </tr>`).join('');

  $('#detalle-table').innerHTML = `
    <table class="data-table data-table--dense">
      <thead><tr>${thead}</tr></thead>
      <tbody>${tbody || `<tr><td colspan="${cols.length}" class="empty-hint">Sin resultados para este filtro.</td></tr>`}</tbody>
    </table>`;

  $$('#detalle-table th').forEach((th) => th.addEventListener('click', () => {
    const key = th.dataset.col;
    state.detailSort = state.detailSort.col === key ? { col: key, dir: state.detailSort.dir === 'asc' ? 'desc' : 'asc' } : { col: key, dir: 'desc' };
    renderDetalleTable();
  }));
}
function titleCaseLite(s) { return s ? s[0] + s.slice(1).toLowerCase() : s; }

/* ------------------------------------------------------------
   CALIDAD DE DATOS
   ------------------------------------------------------------ */
function renderCalidadTab() {
  const root = $('#panel-calidad');
  if (!state.waves.length) { root.innerHTML = emptyState('Sube una encuesta para ver el reporte de calidad de datos.'); return; }
  const wave = getWave(state.selectedWaveId) || lastWave();

  root.innerHTML = `
    <div class="wave-selector">
      <label>Ola:</label>
      <select id="calidad-wave-select">${state.waves.map((w) => `<option value="${w.id}" ${w.id === wave.id ? 'selected' : ''}>${w.label}</option>`).join('')}</select>
    </div>

    <div class="quality-section">
      <h3>Alertas detectadas (${wave.flags.length})</h3>
      ${wave.flags.length ? `<ul class="flag-list">${wave.flags.map((f) => `<li>${f}</li>`).join('')}</ul>` : '<p class="empty-hint">Sin alertas en esta ola.</p>'}
    </div>

    <div class="quality-section">
      <h3>Nombres de vendedor fusionados (${wave.vendorMerges.length})</h3>
      ${wave.vendorMerges.length ? `<ul class="flag-list">${wave.vendorMerges.map((m) => `<li>"${m.de}" → <strong>${m.a}</strong></li>`).join('')}</ul>` : '<p class="empty-hint">No se detectaron variantes de nombres a fusionar.</p>'}
    </div>

    <div class="quality-section">
      <h3>Proyectos del maestro no evaluados en esta ola (${wave.notSurveyed.length})</h3>
      ${wave.notSurveyed.length ? `<ul class="flag-list">${wave.notSurveyed.map((p) => `<li>${p.nombre} — ${titleCaseLite(p.comuna)} (${p.inmobiliaria})</li>`).join('')}</ul>` : '<p class="empty-hint">Se evaluó el 100% del maestro.</p>'}
    </div>

    ${wave.notFoundInMaster.length ? `
    <div class="quality-section">
      <h3 class="text-error">Respuestas sin proyecto en el maestro (${wave.notFoundInMaster.length})</h3>
      <ul class="flag-list">${wave.notFoundInMaster.map((p) => `<li>Respuesta ${p.id_respuesta} — ID de proyecto ${p.project_id} no encontrado</li>`).join('')}</ul>
    </div>` : ''}
  `;
  $('#calidad-wave-select').addEventListener('change', (e) => { state.selectedWaveId = e.target.value; renderCalidadTab(); });
}

/* ------------------------------------------------------------
   CONFIGURACIÓN
   ------------------------------------------------------------ */
function renderConfigTab() {
  const root = $('#panel-config');
  const w = state.weights;
  const total = Object.values(w).reduce((a, b) => a + b, 0);
  const aiWave = getWave(state.configAiWaveId) || lastWave();
  if (aiWave) state.configAiWaveId = aiWave.id;

  root.innerHTML = `
    ${state.waves.length ? `
    <div class="config-section">
      <h3>Resumen ejecutivo (pestaña "Proyectos ACTIVA")</h3>
      <p class="config-hint">El bloque "Resumen ejecutivo" de la pestaña Proyectos ACTIVA no llama a ningún LLM — pega acá el texto que generaste externamente (ej. con Claude) para esta ola. Se guarda por ola.</p>
      <div class="wave-selector">
        <label>Ola:</label>
        <select id="ai-wave-select">${state.waves.map((w2) => `<option value="${w2.id}" ${w2.id === aiWave.id ? 'selected' : ''}>${w2.label} — ${w2.refDate}</option>`).join('')}</select>
      </div>
      <textarea class="ai-config-textarea" id="ai-summary-text" placeholder="Pega acá el resumen ejecutivo generado con un LLM...">${aiWave.aiSummary || ''}</textarea>
      <div class="config-actions">
        <button class="btn btn-primary" id="btn-guardar-ai-summary">Guardar resumen</button>
      </div>
    </div>` : ''}

    <div class="config-section">
      <h3>Ponderadores del índice compuesto</h3>
      <p class="config-hint">Definen cómo se combinan los 6 bloques de la encuesta en un solo índice (0–100). Vienen con valores por defecto; ajústalos si el negocio necesita otro énfasis. La suma debe dar 100%.</p>
      <div class="weights-grid">
        ${Object.keys(APP.BLOCK_LABELS).map((k) => `
          <div class="weight-row">
            <label>${APP.BLOCK_LABELS[k]}</label>
            <input type="number" min="0" max="100" step="1" data-weight="${k}" value="${w[k]}" />
            <span>%</span>
          </div>`).join('')}
      </div>
      <div class="weights-total ${total === 100 ? 'ok' : 'warn'}" id="weights-total">Suma actual: ${total}% ${total === 100 ? '✓' : '(debe ser 100%)'}</div>
      <div class="config-actions">
        <button class="btn btn-primary" id="btn-guardar-pesos">Guardar ponderadores</button>
        <button class="btn btn-ghost" id="btn-reset-pesos">Restablecer por defecto</button>
      </div>
    </div>

    <div class="config-section">
      <h3>Maestro de proyectos</h3>
      <p class="config-hint">${(state.master || []).length} proyectos cargados (fuente: ${state.waves.length ? 'última ola guardada o archivo por defecto' : 'archivo de referencia por defecto'}). Para actualizarlo, sube un nuevo maestro junto con la próxima encuesta en "Cargar datos".</p>
    </div>

    <div class="config-section">
      <h3>Datos y respaldo</h3>
      <div class="config-actions">
        <button class="btn btn-ghost" id="btn-export-all">Exportar todo (backup .json)</button>
        <label class="btn btn-ghost" for="import-all-input">Importar backup</label>
        <input type="file" id="import-all-input" accept=".json" hidden />
        <button class="btn btn-danger" id="btn-clear-all">Borrar todos los datos</button>
      </div>
    </div>
  `;

  if (state.waves.length) {
    $('#ai-wave-select').addEventListener('change', (e) => { state.configAiWaveId = e.target.value; renderConfigTab(); });
    $('#btn-guardar-ai-summary').addEventListener('click', () => {
      aiWave.aiSummary = $('#ai-summary-text').value;
      APP.saveWaves(state.waves);
      alertToast('Resumen ejecutivo guardado para esta ola.');
    });
  }

  $$('.weight-row input').forEach((inp) => inp.addEventListener('input', () => {
    const vals = {};
    $$('.weight-row input').forEach((i) => (vals[i.dataset.weight] = Number(i.value) || 0));
    const t = Object.values(vals).reduce((a, b) => a + b, 0);
    const totalEl = $('#weights-total');
    totalEl.textContent = `Suma actual: ${t}% ${t === 100 ? '✓' : '(debe ser 100%)'}`;
    totalEl.className = `weights-total ${t === 100 ? 'ok' : 'warn'}`;
  }));

  $('#btn-guardar-pesos').addEventListener('click', () => {
    const vals = {};
    $$('.weight-row input').forEach((i) => (vals[i.dataset.weight] = Number(i.value) || 0));
    state.weights = vals;
    APP.saveWeights(vals);
    state.waves.forEach((wave) => APP.recomputeWaveComposites(wave, vals));
    APP.saveWaves(state.waves);
    renderConfigTab();
    alertToast('Ponderadores guardados. Los índices se recalcularon en todas las olas.');
  });
  $('#btn-reset-pesos').addEventListener('click', () => { state.weights = { ...APP.DEFAULT_WEIGHTS }; renderConfigTab(); });

  $('#btn-export-all').addEventListener('click', () => downloadJSON({ waves: state.waves, weights: state.weights, master: state.master }, 'mystery_shopper_backup.json'));
  $('#import-all-input').addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const text = await file.text();
    try {
      const obj = JSON.parse(text);
      if (obj.waves) { state.waves = obj.waves; APP.saveWaves(state.waves); }
      if (obj.weights) { state.weights = obj.weights; APP.saveWeights(state.weights); }
      if (obj.master) { state.master = obj.master; APP.saveMaster(state.master); }
      renderConfigTab();
      alertToast('Backup importado correctamente.');
    } catch (err) { alertToast('El archivo de backup no es válido.', true); }
  });
  $('#btn-clear-all').addEventListener('click', () => {
    if (confirm('Esto borra todas las olas, ponderadores personalizados y el maestro guardado en este navegador. ¿Continuar?')) {
      localStorage.clear();
      state.waves = []; state.weights = { ...APP.DEFAULT_WEIGHTS }; state.master = null; state.selectedWaveId = null;
      renderActiveTab();
    }
  });
}

function alertToast(msg, isError = false) {
  const el = document.createElement('div');
  el.className = `toast ${isError ? 'toast--error' : ''}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('is-visible'), 10);
  setTimeout(() => { el.classList.remove('is-visible'); setTimeout(() => el.remove(), 300); }, 3200);
}

function emptyState(msg) { return `<div class="empty-state">${msg}</div>`; }

/* ------------------------------------------------------------
   INIT
   ------------------------------------------------------------ */
(async function init() {
  await ensureMaster();
  initTabs();
  renderActiveTab();
  const origRenderCargar = renderCargarTab;
  renderCargarTab = function () { origRenderCargar(); bindWavesTableActions(); };
  renderActiveTab();
})();
