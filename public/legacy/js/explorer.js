// @ts-nocheck
// ════════════════════════════════════════════════════════════
//  INTEGRATION EXPLORER
//  Reutiliza parseBatchCsv() y parseIntegration() de docs.js
//  (globals top-level, no IIFE — accesibles directamente).
//
//  Namespace único "Explorer" para no colisionar con docs.js
//  que declara files, dz, addFiles, etc. a nivel global.
// ════════════════════════════════════════════════════════════

const Explorer = (function () {

  // ── Estado ───────────────────────────────────────────────
  let exFiles       = [];   // [{name, data: ArrayBuffer}]
  let integrations  = [];   // flat: un parsed por dataflow, con _zipName, _idx
  let filtered      = [];   // subset de integrations según búsqueda
  let indexes       = {};   // byTargetKey, bySourceKey, byFileWritten, byFileRead
  let chainEdges    = [];   // [{from, to, via:'table'|'file', label}]
  let selectedIdx   = null;
  let navStack      = [];   // pila de índices de la cadena recorrida; navStack[0] = raíz ("inicio"), tope === selectedIdx
  let currentView   = 'list';
  let currentDim    = 'integration'; // 'integration'|'dst-table'|'src-table'|'dst-field'|'src-field'
  let selectedDimKey = null;
  let visNetwork      = null;
  let dfVisNetwork    = null;   // network embebido del diagrama tipo CI-DS
  let dfVisNetworkFs  = null;   // network del mismo diagrama en modal fullscreen
  let dfFsIntIdx      = null;   // integración actualmente abierta en fullscreen
  let analyzing       = false;
  let activePA      = new Set(); // PAs seleccionados; vacío = todos
  let activeSrcDS   = new Set(); // Datastores origen seleccionados; vacío = todos
  let activeDstDS   = new Set(); // Datastores destino seleccionados; vacío = todos

  // ── Estado CI-DS ─────────────────────────────────────────────
  let cidsConn      = null;  // { hciUrl, orgName, isProduction, sessionId }
  let cidsProdTasks = null;  // Set<string> uppercase — null = no conectado
  let cidsLoading   = false;
  let showPromoted  = false;

  // ── Estado SAP IBP ───────────────────────────────────────────
  let ibpConn      = null;   // { base, user } — null = no conectado
  let ibpTaskIndex = null;   // { TASKID_UC: [{jobName, stepName, stepPos, stepType}] }
  let showIbpOnly  = false;

  // ── Normalización de claves para matching ───────────────
  function normTableKey(ds, tbl) {
    const d = (ds  || '').trim().toUpperCase();
    // No stripping de path: los nombres de tabla SAP con namespace ABAP (/SPMEAT/CUTK,
    // /BIC/AZPP_RVO022, etc.) deben preservarse completos. El stripping de rutas de
    // archivo se maneja en normFileKey; detectChains usa su propia variable local aTblNorm.
    const t = (tbl || '').trim().toUpperCase();
    return d + '::' + t;
  }
  function normFileKey(file) {
    if (!file) return '';
    return 'FILE::' + file.replace(/^.*[\\/]/, '').toUpperCase();
  }

  // ── Drop zone ────────────────────────────────────────────
  function initDropZone() {
    const dz = document.getElementById('ex-dz');
    const fi = document.getElementById('ex-fi');
    if (!dz || !fi) return;
    dz.addEventListener('click', e => { if (e.target !== fi) fi.click(); });
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag-over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
    dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('drag-over'); addFiles([...e.dataTransfer.files]); });
    fi.addEventListener('change', e => { addFiles([...e.target.files]); fi.value = ''; });
  }

  function addFiles(list) {
    list.filter(f => f.name.toLowerCase().endsWith('.zip')).forEach(f => {
      if (exFiles.find(x => x.name === f.name)) return;
      const r = new FileReader();
      r.onload = ev => { exFiles.push({ name: f.name, data: ev.target.result }); renderFiles(); };
      r.readAsArrayBuffer(f);
    });
  }

  function removeFile(i) {
    exFiles.splice(i, 1);
    renderFiles();
  }

  function renderFiles() {
    const el = document.getElementById('ex-file-list');
    const btn = document.getElementById('ex-analyze-btn');
    if (!el) return;
    el.innerHTML = exFiles.map((f, i) => `
      <div class="file-tag">
        <span class="ico">📦</span>
        <span class="name">${escH(f.name)}</span>
        <span class="size">${(f.data.byteLength / 1024).toFixed(0)} KB</span>
        <button class="rm" onclick="Explorer.removeFile(${i})">✕</button>
      </div>`).join('');
    if (btn) btn.disabled = exFiles.length === 0 || cidsLoading;
  }

  // ── Análisis principal ───────────────────────────────────
  async function analyze() {
    if (analyzing) return;
    analyzing = true;
    const btn = document.getElementById('ex-analyze-btn');
    if (btn) { btn.disabled = true; btn.textContent = I18n.t('ex.btn.analyzing'); }

    integrations   = [];
    chainEdges     = [];
    selectedIdx    = null;
    navStack       = [];
    selectedDimKey = null;
    currentDim     = 'integration';
    ALL_DIMS.forEach(d => {
      const b = document.getElementById('ex-dim-' + d);
      if (b) b.classList.toggle('active', d === 'integration');
    });
    const vt = document.getElementById('ex-view-toggle');
    if (vt) vt.style.display = '';

    for (const f of exFiles) {
      try {
        const zip = await JSZip.loadAsync(f.data);
        // parseBatchCsv y parseIntegration son globals de docs.js
        const batchMap = await parseBatchCsv(zip);
        const xmlNames = Object.keys(zip.files).filter(n => n.endsWith('.xml') && !n.includes('/'));
        for (const xmlName of xmlNames) {
          const xmlStr = await zip.file(xmlName).async('string');
          const arr = parseIntegration(xmlStr, batchMap[xmlName]);
          arr.forEach(p => {
            p._zipName = f.name;
            p._idx     = integrations.length;
            integrations.push(p);
          });
        }
      } catch (e) {
        console.error('Explorer: error en ZIP', f.name, e);
      }
    }

    buildIndexes();
    detectChains();
    activePA    = new Set();
    activeSrcDS = new Set();
    activeDstDS = new Set();
    renderPlanAreaFilter();
    renderDSFilter();
    filtered = integrations.slice();
    renderSidebarList(filtered);
    updateCounter(filtered.length, integrations.length);
    updateSidebarHeader();

    const results = document.getElementById('ex-results');
    if (results) results.style.display = 'block';

    const uploadPanel = document.getElementById('ex-upload-panel');
    if (uploadPanel) uploadPanel.classList.add('collapsed');

    // Log de diagnóstico en consola para ayudar a depurar cadenas
    console.debug(`[Explorer] ${integrations.length} dataflows, ${chainEdges.length} cadenas`);
    if (integrations.length > 0 && chainEdges.length === 0) {
      console.debug('[Explorer] Sin cadenas. Muestra de destinos:', integrations.slice(0,5).map(p => `${p.dstDSName}::${p.targetTable}`));
      console.debug('[Explorer] Muestra de orígenes:', integrations.slice(0,5).map(p => p.mappings.slice(0,2).map(m => `${m.srcDS}::${m.srcTable}`)));
    }

    analyzing = false;
    if (btn) { btn.disabled = false; btn.textContent = I18n.t('ex.analyzeBtn'); }
  }

  // ── Índices ──────────────────────────────────────────────
  // Regex para extraer tokens TABLA.CAMPO o CAMPO de expresiones de filtro.
  // Se excluyen palabras clave SQL comunes para evitar ruido.
  const _FILTER_SQL_KW = new Set([
    'AND','OR','NOT','IS','NULL','IN','LIKE','BETWEEN','EXISTS','SELECT',
    'FROM','WHERE','JOIN','ON','AS','CASE','WHEN','THEN','ELSE','END',
    'TRIM','UPPER','LOWER','SUBSTR','LENGTH','CONVERT','CAST','COALESCE',
    'IFTHENELSE','ISNULL','IFNULL','IIF','SYSDATE','GEN_UUID',
  ]);

  function extractFilterFields(expr) {
    // Captura TOKEN.CAMPO o TOKEN standalone (sin operadores ni literales)
    const tokens = new Set();
    const re = /\b([A-Za-z_][A-Za-z0-9_]*)(?:\.([A-Za-z_][A-Za-z0-9_]*))?\b/g;
    let m;
    while ((m = re.exec(expr)) !== null) {
      const schemaOrField = m[1].toUpperCase();
      const field         = m[2] ? m[2].toUpperCase() : null;
      if (field) {
        // TABLE.FIELD pattern — index the FIELD part
        if (!_FILTER_SQL_KW.has(field)) tokens.add(field);
      } else {
        // standalone token — only index if not a keyword and looks like a column
        if (!_FILTER_SQL_KW.has(schemaOrField) && schemaOrField.length >= 2)
          tokens.add(schemaOrField);
      }
    }
    return [...tokens];
  }

  function buildIndexes() {
    indexes = {
      byTargetKey:    {},   // normTableKey(dst, target) → [idx]
      bySourceKey:    {},   // normTableKey(srcDS, srcTable) → [idx]
      byFileWritten:  {},   // normFileKey(fileLoaderFileName) → [idx]
      byFileRead:     {},   // normFileKey(srcTable when srcDS≈FILE) → [idx]
      searchTokens:   [],   // [{idx, tokens: string}]
      // ── Dimensiones de exploración — mappings ──
      byDstTable:     {},   // normTableKey(dstDS, dstTable) → [{intIdx, mIdx}]
      bySrcTable:     {},   // normTableKey(srcDS, srcTable) → [{intIdx, mIdx}]
      byDstField:     {},   // FIELDNAME → [{intIdx, mIdx}]
      bySrcField:     {},   // FIELDNAME → [{intIdx, mIdx}]
      // ── Dimensiones de exploración — filtros/joins ──
      byFilterTable:  {},   // normTableKey('', table) → [{intIdx, fIdx}]
      byFilterField:  {},   // FIELDNAME → [{intIdx, fIdx}]
    };

    function push(map, key, idx) {
      if (!key) return;
      if (!map[key]) map[key] = [];
      if (!map[key].includes(idx)) map[key].push(idx);
    }
    function pushDim(map, key, intIdx, mIdx) {
      if (!key) return;
      if (!map[key]) map[key] = [];
      map[key].push({ intIdx, mIdx });
    }
    function pushDimF(map, key, intIdx, fIdx) {
      if (!key) return;
      if (!map[key]) map[key] = [];
      map[key].push({ intIdx, fIdx });
    }

    integrations.forEach(p => {
      // target
      push(indexes.byTargetKey, normTableKey(p.dstDSName, p.targetTable), p._idx);
      // file written
      if (p.fileLoaderFileName) push(indexes.byFileWritten, normFileKey(p.fileLoaderFileName), p._idx);
      // FILE datastore target
      if (/(FILE|ARCHIVOS)/i.test(p.dstDSName || '')) push(indexes.byFileWritten, normFileKey(p.targetTable), p._idx);

      // sources from mappings + dimension indexes
      p.mappings.forEach((m, mIdx) => {
        push(indexes.bySourceKey, normTableKey(m.srcDS, m.srcTable), p._idx);
        if (/(FILE|ARCHIVOS)/i.test(m.srcDS || '')) push(indexes.byFileRead, normFileKey(m.srcTable), p._idx);

        // Tabla Destino
        const dstKey = normTableKey(m.dstDS || p.dstDSName, m.dstTable || p.targetTable);
        if (dstKey) pushDim(indexes.byDstTable, dstKey, p._idx, mIdx);

        // Tabla Origen — puede ser multi-tabla separada por comas
        if (m.srcTable) {
          m.srcTable.split(/,\s*/).forEach(rawTbl => {
            const t = rawTbl.trim();
            if (t) pushDim(indexes.bySrcTable, normTableKey(m.srcDS, t), p._idx, mIdx);
          });
        }

        // Campo Destino
        if (m.dstField) pushDim(indexes.byDstField, m.dstField.toUpperCase(), p._idx, mIdx);

        // Campo Origen — puede ser "TABLE.FIELD, TABLE.FIELD2" o solo "FIELD"
        if (m.srcField) {
          m.srcField.split(/,\s*/).forEach(rawFld => {
            const f = rawFld.trim().replace(/^[^.]+\./, ''); // strip TABLE. prefix
            if (f) pushDim(indexes.bySrcField, f.toUpperCase(), p._idx, mIdx);
          });
        }
      });

      // ── Filtros y joins ───────────────────────────────────
      p.filters.forEach((f, fIdx) => {
        // Tabla origen — extraida por parseDataflow; puede ser multi-tabla
        if (f.sourceTable) {
          f.sourceTable.split(/,\s*/).forEach(rawTbl => {
            const t = rawTbl.trim();
            if (t) pushDimF(indexes.byFilterTable, normTableKey('', t), p._idx, fIdx);
          });
        }
        // Campos individuales extraidos de la expresion
        extractFilterFields(f.expression || '').forEach(field => {
          pushDimF(indexes.byFilterField, field, p._idx, fIdx);
        });
      });

      // search tokens (incluye tablas referenciadas en lookup expressions)
      const lookupTables = extractLookupPairs(p.lookups).map(pair => pair.file || pair.ds);
      const tokens = [
        p.jobName, p.dataflowName, p.srcDSName, p.dstDSName, p.targetTable,
        ...p.mappings.flatMap(m => [m.dstField, m.dstDesc, m.srcField, m.srcTable, m.ops]),
        ...p.filters.map(f => f.expression),
        ...p.variables.map(v => v.name),
        ...lookupTables,
        ...p.lookups.map(l => l.func),
      ].filter(Boolean).join(' ').toLowerCase();
      indexes.searchTokens.push({ idx: p._idx, tokens });
    });
  }

  // ── Detección de cadenas ─────────────────────────────────
  // Tres mecanismos de unión:
  //   table  – DS+tabla (L1) o solo tabla (L2) vía TableReader/FileReader
  //   file   – por nombre de archivo (fileLoaderFileName o targetTable en FILE DS)
  //   lookup – la integración B usa lookup(A.targetTable.FIELD, …) en sus expresiones

  // Extrae todos los nombres de tabla referenciados en expresiones lookup(TABLE.field, ...)
  // Returns [{ds, file}] from lookup(DATASTORE."file.csv", ...) expressions
  function extractLookupPairs(lookups) {
    const pairs = [];
    lookups.forEach(l => {
      const re = /lookup\s*\(\s*([A-Za-z_][A-Za-z0-9_\/]*)\s*\.\s*(?:"([^"]+)"|([A-Za-z0-9_][A-Za-z0-9_.\/-]*))/gi;
      let m;
      while ((m = re.exec(l.func)) !== null) {
        const ds   = (m[1] || '').toUpperCase();
        const file = (m[2] || m[3] || '').replace(/^.*[\\/]/, '').toUpperCase();
        if (ds) pairs.push({ ds, file });
      }
    });
    return pairs;
  }

  function detectChains() {
    chainEdges = [];
    const seen = new Set();

    integrations.forEach(a => {
      const targetKey     = normTableKey(a.dstDSName, a.targetTable);
      const targetKeyNoDS = normTableKey('', a.targetTable);
      const aTblNorm      = (a.targetTable || '').replace(/^.*[\\/]/, '').toUpperCase();
      const aFileNorm     = a.fileLoaderFileName
        ? a.fileLoaderFileName.replace(/^.*[\\/]/, '').toUpperCase()
        : '';
      const aIsFile       = a.tipoIntegracion === 'FILE';

      integrations.forEach(b => {
        if (b._idx === a._idx) return;

        const alreadyLinked = seen.has(`${a._idx}→${b._idx}:table`) ||
                              seen.has(`${a._idx}→${b._idx}:file`)  ||
                              seen.has(`${a._idx}→${b._idx}:lookup`);

        // ── Match por tabla (solo integraciones no-FILE) ─────────────────────
        // L2 requiere que ninguno de los dos lados sea tipo archivo para evitar
        // falsos positivos por nombres de formato coincidentes.
        if (!alreadyLinked) {
          const matchTable = b.mappings.some(m => {
            if (!m.srcTable) return false;
            if (normTableKey(m.srcDS, m.srcTable) === targetKey) return true;  // L1 exacto
            if (aIsFile) return false;  // A escribe archivo: sin L2
            const bDSNorm = (m.srcDS || '').toUpperCase();
            if (bDSNorm === 'FILE' || /(FILE|ARCHIVOS)/i.test(bDSNorm)) return false;  // B lee archivo: sin L2
            const srcNoDS = normTableKey('', m.srcTable);
            return srcNoDS === targetKeyNoDS && srcNoDS.replace('::', '').length >= 4;  // L2 solo DB
          });
          if (matchTable) {
            const k = `${a._idx}→${b._idx}:table`;
            seen.add(k);
            chainEdges.push({ from: a._idx, to: b._idx, via: 'table', label: a.targetTable });
          }
        }

        // ── Match por archivo (FileLoader → FileReader) ─────────────────────
        // Usa el nombre del formato (targetTable) como clave primaria.
        // Requiere tabla destino == tabla origen Y nombre de archivo == nombre de archivo.
        // Si el fileLoaderFileName está disponible, ambos deben coincidir con lo que lee B.
        if (aIsFile && aTblNorm.length >= 4 &&
            !seen.has(`${a._idx}→${b._idx}:table`) &&
            !seen.has(`${a._idx}→${b._idx}:file`)) {
          const matchFile = b.mappings.some(m => {
            if (!m.srcTable) return false;
            // El nombre de formato debe coincidir en ambos lados
            const bFmt = m.srcTable.replace(/^.*[\\/]/, '').toUpperCase();
            if (bFmt !== aTblNorm) return false;
            // El lado lector debe ser de tipo archivo
            const bDS = (m.srcDS || '').toUpperCase();
            if (bDS && bDS !== 'FILE' && !/(FILE|ARCHIVOS)/i.test(bDS)) return false;
            // Si A tiene nombre de archivo explícito, verificar que el formato y
            // el archivo base coincidan (el lector expone el nombre de formato, no el archivo físico)
            if (aFileNorm.length >= 4) {
              const aBase = aFileNorm.replace(/\.[^.]+$/, '');  // sin extensión
              return aBase === bFmt || bFmt === aTblNorm;
            }
            return true;
          });
          if (matchFile) {
            const k = `${a._idx}→${b._idx}:file`;
            seen.add(k);
            chainEdges.push({ from: a._idx, to: b._idx, via: 'file', label: a.targetTable });
          }
        }

        // ── Match vía lookup(DS."archivo.csv", ...) ──────────────────────────
        // Une por (a) nombre de formato (DS) == targetTable de A, o
        // (b) nombre de archivo físico del lookup == fileLoaderFileName de A.
        // El caso (b) es necesario porque el productor puede nombrar su formato
        // distinto al csv físico (p.ej. formato "ECC_AUSP_CTYTTS" → archivo
        // "ECC_AUSP_CTYTTS_ALL.csv"), mientras el lookup del consumidor referencia
        // el nombre físico. El archivo es la clave confiable presente en ambos lados.
        if (!seen.has(`${a._idx}→${b._idx}:table`) &&
            !seen.has(`${a._idx}→${b._idx}:file`)  &&
            !seen.has(`${a._idx}→${b._idx}:lookup`) &&
            b.lookups.length > 0 && (aTblNorm.length >= 4 || aFileNorm.length >= 4)) {

          const aFileBase = aFileNorm.replace(/\.[^.]+$/, '');
          const bPairs = extractLookupPairs(b.lookups);
          const lookupMatch = bPairs.find(p => {
            const pFileBase = p.file.replace(/\.[^.]+$/, '');
            // (a) match por nombre de formato (DS)
            if (p.ds === aTblNorm) {
              // Si ambos lados proveen nombre de archivo, deben coincidir
              if (aFileNorm.length >= 4 && p.file.length >= 4) return aFileBase === pFileBase;
              return true;  // solo nombre de formato disponible: suficiente
            }
            // (b) match por nombre de archivo físico (formato del productor difiere)
            if (aFileBase.length >= 4 && pFileBase.length >= 4 && aFileBase === pFileBase) return true;
            return false;
          });

          if (lookupMatch) {
            const label = lookupMatch.file || aTblNorm;
            const k = `${a._idx}→${b._idx}:lookup`;
            seen.add(k);
            chainEdges.push({ from: a._idx, to: b._idx, via: 'lookup', label });
          }
        }
      });
    });

    const byVia = chainEdges.reduce((acc, e) => { acc[e.via] = (acc[e.via] || 0) + 1; return acc; }, {});
    console.debug(`[Explorer] cadenas: ${chainEdges.length} total`, byVia);
  }

  // ── CI-DS connection ─────────────────────────────────────────
  async function cidsSoapCall(operation, params) {
    const res = await fetch('/api/cids', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'soap', hciUrl: cidsConn.hciUrl, sessionId: cidsConn.sessionId, operation, params }),
    });
    if (res.status === 401) throw Object.assign(new Error('Sesión CI-DS expirada'), { isSessionExpired: true });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  async function fetchProductionTasks() {
    const projects = await cidsSoapCall('getProjects', {});
    if (!Array.isArray(projects)) return new Set();
    const taskSet = new Set();
    for (const proj of projects) {
      if (!proj.guid) continue;
      try {
        const tasks = await cidsSoapCall('getProjectTasks', { projectGuid: proj.guid });
        if (Array.isArray(tasks))
          tasks.forEach(t => { if (t.taskName) taskSet.add(t.taskName.toUpperCase()); });
      } catch (e) {
        if (e.isSessionExpired) throw e;
      }
    }
    return taskSet;
  }

  function openCidsModal() {
    const m = document.getElementById('cids-modal');
    if (m) m.style.display = 'flex';
    setTimeout(() => { const f = document.getElementById('cids-hciUrl'); if (f) f.focus(); }, 50);
  }

  function closeCidsModal() {
    const m = document.getElementById('cids-modal');
    if (m) m.style.display = 'none';
  }

  async function submitCidsConnect() {
    const hciUrl       = (document.getElementById('cids-hciUrl')   ?.value || '').trim();
    const orgName      = (document.getElementById('cids-orgName')  ?.value || '').trim();
    const user         = (document.getElementById('cids-user')     ?.value || '').trim();
    const password     = (document.getElementById('cids-password') ?.value || '').trim();
    const isProduction = document.getElementById('cids-isProd')?.checked ?? true;
    const errEl        = document.getElementById('cids-modal-error');
    const btnEl        = document.getElementById('cids-modal-submit');

    if (!hciUrl || !orgName || !user || !password) {
      if (errEl) errEl.textContent = I18n.t('ex.cids.allRequired');
      return;
    }
    if (errEl) errEl.textContent = '';
    if (btnEl) { btnEl.disabled = true; btnEl.textContent = I18n.t('ex.cids.connecting'); }
    cidsLoading = true;
    renderFiles();

    try {
      const res = await fetch('/api/cids', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', hciUrl, orgName, user, password, isProduction }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      cidsConn = { hciUrl, orgName, isProduction, sessionId: data.sessionId };
      closeCidsModal();
      renderCidsBar();

      if (btnEl) btnEl.textContent = I18n.t('ex.cids.loadingTasks');
      cidsProdTasks = await fetchProductionTasks();
      renderCidsBar();
      const q = (document.getElementById('ex-search') || {}).value || '';
      applySearch(q);
    } catch (e) {
      if (e.isSessionExpired) {
        cidsDisconnect();
        if (errEl) errEl.textContent = I18n.t('ex.cids.sessionExpired');
      } else {
        if (errEl) errEl.textContent = e.message;
      }
    } finally {
      cidsLoading = false;
      renderFiles();
      if (btnEl) { btnEl.disabled = false; btnEl.textContent = I18n.t('cids.btnConnect'); }
    }
  }

  function cidsDisconnect() {
    if (cidsConn) {
      fetch('/api/cids', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'soap', hciUrl: cidsConn.hciUrl, sessionId: cidsConn.sessionId, operation: 'logout', params: { sessionId: cidsConn.sessionId } }),
      }).catch(() => {});
    }
    cidsConn      = null;
    cidsProdTasks = null;
    showPromoted  = false;
    renderCidsBar();
    const q = (document.getElementById('ex-search') || {}).value || '';
    applySearch(q);
  }

  function togglePromoted() {
    showPromoted = !showPromoted;
    const sw = document.querySelector('#ex-cids-toggle .ex-toggle-switch');
    if (sw) sw.className = showPromoted ? 'ex-toggle-switch on' : 'ex-toggle-switch';
    const q = (document.getElementById('ex-search') || {}).value || '';
    applySearch(q);
  }

  function renderCidsBar() {
    const bar    = document.getElementById('ex-cids-bar');
    const toggle = document.getElementById('ex-cids-toggle');

    if (!cidsConn) {
      if (bar)    bar.innerHTML = `<button class="ex-cids-connect-btn" onclick="Explorer.openCidsModal()">${escH(I18n.t('ex.cids.connectBtn'))}</button>`;
      if (toggle) { toggle.innerHTML = ''; toggle.style.display = 'none'; }
      return;
    }

    const repo    = cidsConn.isProduction ? I18n.t('cids.opt.prod') : I18n.t('cids.opt.sandbox');
    const count   = cidsProdTasks
      ? I18n.t(cidsProdTasks.size === 1 ? 'ex.cids.tasksCount.one' : 'ex.cids.tasksCount.many', { n: cidsProdTasks.size })
      : I18n.t('ex.cids.loading');
    const promCls = showPromoted ? 'ex-toggle-switch on' : 'ex-toggle-switch';

    if (bar) {
      bar.innerHTML = `
        <span class="ex-cids-pill">CI-DS: ${escH(cidsConn.orgName)} · ${escH(repo)} · ${escH(count)}</span>
        <button class="ex-cids-disconnect-btn" onclick="Explorer.cidsDisconnect()">${escH(I18n.t('ex.cids.disconnectBtn'))}</button>`;
    }

    if (toggle) {
      toggle.style.display = cidsProdTasks ? '' : 'none';
      if (cidsProdTasks) {
        toggle.innerHTML = `
          <label class="ex-promoted-label">
            <span class="ex-promoted-text">${escH(I18n.t('ex.cids.promotedLabel'))}</span>
            <span class="${promCls}" onclick="Explorer.togglePromoted()" title="${escH(I18n.t('ex.cids.tooltip.filterRepo', { repo }))}"><span class="ex-toggle-knob"></span></span>
          </label>`;
      }
    }
  }

  // ── Conexión SAP IBP ─────────────────────────────────────────
  function openIbpModal() {
    const m = document.getElementById('ibp-modal');
    if (m) m.style.display = 'flex';
    setTimeout(() => { const f = document.getElementById('ibp-base'); if (f) f.focus(); }, 50);
  }

  function closeIbpModal() {
    const m = document.getElementById('ibp-modal');
    if (m) m.style.display = 'none';
  }

  // Trae JobTemplates + Sequences + parámetros P_TSKID desde SAP IBP y construye
  // el índice inverso taskId(UC) → [{jobName, stepName, stepPos, stepType}].
  // Reutiliza fetchAllPages()/CFG (api.js/state.js), ya cargados en el iframe.
  async function loadIbpJobIndex(serviceUrl) {
    // #docs-log es un stub oculto presente en la página; evita que log() falle
    // si fetchAllPages pagina (llama a log() sólo a partir de la página 2).
    const logEl = document.getElementById('docs-log') || document.createElement('div');
    // Se usa EXACTAMENTE la URL del servicio que ingresó el usuario.
    const appjobBase = serviceUrl;
    // JobSequenceName NO es único entre templates (se repite en muchos jobs),
    // así que la clave para mapear step↔task debe componerse con el template y
    // su versión. De lo contrario, un step de un job contamina otras tasks.
    const seqKey = (tpl, ver, seq) => (tpl || '') + '|' + (ver || '') + '|' + (seq || '');

    const templates = await fetchAllPages(appjobBase + '/JobTemplateSet', logEl);
    const templateText = {};
    templates.forEach(t => {
      templateText[t.JobTemplateName] = t.JobTemplateText || t.Text || t.JobTemplateName;
    });

    const steps = await fetchAllPages(appjobBase + '/JobTemplateSequenceSet', logEl);

    // El filtro startswith(...) puede no estar soportado en algunos servicios;
    // si falla, se degrada a índice vacío (0 matches) en vez de romper la conexión.
    const seqToTaskId = {};
    try {
      const paramRows = await fetchAllPages(
        appjobBase + '/JobTemplateParameterValueDataSet', logEl,
        "startswith(JobTemplateParameterName,'P_TSKID') eq true"
      );
      paramRows.forEach(r => {
        const seqName = (r.JobTemplateParameterName || '').replace(/^P_TSKID\s*/, '').trim();
        const taskId  = (r.Low || '').trim();
        if (seqName && taskId) seqToTaskId[seqKey(r.JobTemplateName, r.JobTemplateVersion, seqName)] = taskId;
      });
    } catch (e) {
      console.warn('[ibp] No se pudo leer P_TSKID (task→step); índice sin mapeo.', e && e.message);
    }

    const index = {};
    steps.forEach(s => {
      const taskId = seqToTaskId[seqKey(s.JobTemplateName, s.JobTemplateVersion, s.JobSequenceName)];
      if (!taskId) return;
      const key = taskId.toUpperCase();
      if (!index[key]) index[key] = [];
      index[key].push({
        jobName:  templateText[s.JobTemplateName] || s.JobTemplateName || '',
        stepName: s.JobSequenceText || s.JobSequenceName || '',
        stepPos:  s.JobSequencePosition ?? '',
        stepType: s.JceText || '',
      });
    });
    // Orden estable por posición del step
    Object.keys(index).forEach(k => {
      index[k].sort((a, b) => (Number(a.stepPos) || 0) - (Number(b.stepPos) || 0));
    });
    return { index, templatesCount: templates.length };
  }

  function _ibpTaskCount() {
    return ibpTaskIndex ? Object.keys(ibpTaskIndex).length : 0;
  }

  function _ibpMatches(jobName) {
    if (!ibpTaskIndex) return null;
    return ibpTaskIndex[(jobName || '').toUpperCase().trim()] || null;
  }

  async function submitIbpConnect() {
    let url     = (document.getElementById('ibp-base')?.value || '').trim();
    const user  = (document.getElementById('ibp-user')?.value || '').trim();
    const pass  = (document.getElementById('ibp-pass')?.value || '').trim();
    const errEl = document.getElementById('ibp-modal-error');
    const btnEl = document.getElementById('ibp-modal-submit');

    if (!url || !user || !pass) {
      if (errEl) errEl.textContent = I18n.t('ex.ibp.allRequired');
      return;
    }
    // Se respeta la URL COMPLETA del servicio tal como la ingresa el usuario;
    // sólo se antepone https:// si falta y se quita una barra final para poder
    // concatenar /JobTemplateSet, /JobTemplateSequenceSet, etc.
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    url = url.replace(/\/+$/, '');
    if (errEl) errEl.textContent = '';
    if (btnEl) { btnEl.disabled = true; btnEl.textContent = I18n.t('ex.ibp.connecting'); }

    // CFG.url = origin (sólo para resolver nextLinks relativos de paginación);
    // las credenciales van por Basic Auth en cada request (api.js).
    try { CFG.url = new URL(url).origin; } catch { CFG.url = url; }
    CFG.user = user;
    CFG.pass = pass;

    try {
      const { index, templatesCount } = await loadIbpJobIndex(url);
      if (!templatesCount) {
        // 0 job templates ⇒ URL/servicio/autorización incorrectos: no conectar, avisar.
        CFG.url = ''; CFG.user = ''; CFG.pass = '';
        if (errEl) errEl.textContent = I18n.t('ex.ibp.noTemplates');
        return;
      }
      ibpConn = { base: url, user };
      ibpTaskIndex = index;
      closeIbpModal();
      renderIbpBar();
      const q = (document.getElementById('ex-search') || {}).value || '';
      applySearch(q);
      if (selectedIdx !== null) renderDetail(selectedIdx);
    } catch (e) {
      // credenciales inválidas / error de red → no dejar credenciales/URL colgando
      CFG.url = ''; CFG.user = ''; CFG.pass = '';
      if (errEl) errEl.textContent = e.message || String(e);
    } finally {
      if (btnEl) { btnEl.disabled = false; btnEl.textContent = I18n.t('ibp.btnConnect'); }
    }
  }

  function ibpDisconnect() {
    ibpConn      = null;
    ibpTaskIndex = null;
    showIbpOnly  = false;
    CFG.url = ''; CFG.user = ''; CFG.pass = '';
    renderIbpBar();
    const q = (document.getElementById('ex-search') || {}).value || '';
    applySearch(q);
    if (selectedIdx !== null) renderDetail(selectedIdx);
  }

  function toggleIbpOnly() {
    showIbpOnly = !showIbpOnly;
    const sw = document.querySelector('#ex-ibp-toggle .ex-toggle-switch');
    if (sw) sw.className = showIbpOnly ? 'ex-toggle-switch on' : 'ex-toggle-switch';
    const q = (document.getElementById('ex-search') || {}).value || '';
    applySearch(q);
  }

  function renderIbpBar() {
    const bar    = document.getElementById('ex-ibp-bar');
    const toggle = document.getElementById('ex-ibp-toggle');

    if (!ibpConn) {
      if (bar)    bar.innerHTML = `<button class="ex-ibp-connect-btn" onclick="Explorer.openIbpModal()">${escH(I18n.t('ex.ibp.connectBtn'))}</button>`;
      if (toggle) { toggle.innerHTML = ''; toggle.style.display = 'none'; }
      return;
    }

    let host = ibpConn.base;
    try { host = new URL(ibpConn.base).hostname; } catch { /* base no es URL absoluta */ }
    const n     = _ibpTaskCount();
    const count = I18n.t(n === 1 ? 'ex.ibp.tasksCount.one' : 'ex.ibp.tasksCount.many', { n });
    const swCls = showIbpOnly ? 'ex-toggle-switch on' : 'ex-toggle-switch';

    if (bar) {
      bar.innerHTML = `
        <span class="ex-ibp-pill">SAP IBP: ${escH(host)} · ${escH(count)}</span>
        <button class="ex-ibp-disconnect-btn" onclick="Explorer.ibpDisconnect()">${escH(I18n.t('ex.ibp.disconnectBtn'))}</button>`;
    }
    if (toggle) {
      toggle.style.display = '';
      toggle.innerHTML = `
        <label class="ex-promoted-label">
          <span class="ex-promoted-text">${escH(I18n.t('ex.ibp.onlyLabel'))}</span>
          <span class="${swCls}" onclick="Explorer.toggleIbpOnly()" title="${escH(I18n.t('ex.ibp.tooltip.filterOnly'))}"><span class="ex-toggle-knob"></span></span>
        </label>`;
    }
  }

  // ── Popover de ayuda "?" (compartido CI-DS / SAP IBP) ────────
  let _helpHandler = null;
  function _closeHelpPopovers() {
    document.querySelectorAll('.ex-help-popover').forEach(p => { p.style.display = 'none'; });
    if (_helpHandler) { document.removeEventListener('mousedown', _helpHandler); _helpHandler = null; }
  }
  function toggleHelpPopover(which) {
    const pop = document.getElementById('ex-help-' + which);
    if (!pop) return;
    const wasOpen = pop.style.display === 'block';
    _closeHelpPopovers();
    if (wasOpen) return;
    const titleKey = which === 'ibp' ? 'ex.ibp.help.title' : 'ex.cids.help.title';
    const bodyKey  = which === 'ibp' ? 'ex.ibp.help.body'  : 'ex.cids.help.body';
    pop.innerHTML = `<div class="ex-help-pop-title">${escH(I18n.t(titleKey))}</div><div class="ex-help-pop-body">${I18n.t(bodyKey)}</div>`;
    pop.style.display = 'block';
    _helpHandler = function (e) {
      if (!pop.contains(e.target) && !(e.target.closest && e.target.closest('.ex-help-btn'))) _closeHelpPopovers();
    };
    setTimeout(() => { if (_helpHandler) document.addEventListener('mousedown', _helpHandler); }, 0);
  }

  // ── Filtro Planning Area ─────────────────────────────────
  function computeBaseFiltered() {
    let base = integrations.slice();
    if (activePA.size > 0)
      base = base.filter(p => activePA.has(p.planArea || ''));
    if (activeSrcDS.size > 0)
      base = base.filter(p => activeSrcDS.has(p.srcDSName || ''));
    if (activeDstDS.size > 0)
      base = base.filter(p => activeDstDS.has(p.dstDSName || ''));
    if (showPromoted && cidsProdTasks)
      base = base.filter(p => cidsProdTasks.has((p.jobName || '').toUpperCase()));
    if (showIbpOnly && ibpTaskIndex)
      base = base.filter(p => !!ibpTaskIndex[(p.jobName || '').toUpperCase().trim()]);
    return base;
  }

  function renderPlanAreaFilter() {
    const el = document.getElementById('ex-pa-filter');
    if (!el) return;
    const paValues = [...new Set(integrations.map(p => p.planArea || ''))].sort();
    if (paValues.length <= 1) {
      el.style.display = 'none';
      return;
    }
    el.style.display = '';
    el.innerHTML = '<span class="ex-pa-label">PA:</span>' +
      paValues.map(pa => {
        const label = pa || I18n.t('ex.pa.empty');
        const active = activePA.has(pa);
        return `<button class="ex-pa-chip${active ? ' active' : ''}" onclick='Explorer.togglePA(${JSON.stringify(pa)})'>${escH(label)}</button>`;
      }).join('');
  }

  function togglePA(pa) {
    if (activePA.has(pa)) activePA.delete(pa); else activePA.add(pa);
    renderPlanAreaFilter();
    const q = (document.getElementById('ex-search') || {}).value || '';
    applySearch(q);
  }

  // ── Filtro Datastores ────────────────────────────────────
  function renderDSFilter() {
    const el = document.getElementById('ex-ds-filter');
    if (!el) return;
    const srcValues = [...new Set(integrations.map(p => p.srcDSName || ''))].sort();
    const dstValues = [...new Set(integrations.map(p => p.dstDSName || ''))].sort();
    const showSrc = srcValues.length > 1;
    const showDst = dstValues.length > 1;
    if (!showSrc && !showDst) { el.style.display = 'none'; return; }
    el.style.display = '';
    function rowHtml(values, activeSet, toggleFn, labelKey) {
      const chips = values.map(v => {
        const label  = v || I18n.t('ex.ds.empty');
        const active = activeSet.has(v);
        return `<button class="ex-pa-chip${active ? ' active' : ''}" onclick='Explorer.${toggleFn}(${JSON.stringify(v)})'>${escH(label)}</button>`;
      }).join('');
      return `<div class="ex-ds-row"><span class="ex-pa-label">${escH(I18n.t(labelKey))}:</span>${chips}</div>`;
    }
    el.innerHTML =
      (showSrc ? rowHtml(srcValues, activeSrcDS, 'toggleSrcDS', 'ex.ds.src') : '') +
      (showDst ? rowHtml(dstValues, activeDstDS, 'toggleDstDS', 'ex.ds.dst') : '');
  }

  function toggleSrcDS(ds) {
    if (activeSrcDS.has(ds)) activeSrcDS.delete(ds); else activeSrcDS.add(ds);
    renderDSFilter();
    const q = (document.getElementById('ex-search') || {}).value || '';
    applySearch(q);
  }

  function toggleDstDS(ds) {
    if (activeDstDS.has(ds)) activeDstDS.delete(ds); else activeDstDS.add(ds);
    renderDSFilter();
    const q = (document.getElementById('ex-search') || {}).value || '';
    applySearch(q);
  }

  // ── Sidebar (lista master) ───────────────────────────────
  // Badges de cadena (⬅ alimentado por / ➡ alimenta a) para un conjunto de _idx
  function _chainBadges(idxSet) {
    const viaColors = { table: '#34d399', file: '#E8622A', lookup: '#a78bfa' };
    const inEdges   = chainEdges.filter(e => idxSet.has(e.to));
    const outEdges  = chainEdges.filter(e => idxSet.has(e.from));
    const html = [
      ...inEdges.map(e  => `<span style="color:${viaColors[e.via]||'#aaa'};font-size:10px;" title="${escH(I18n.t('ex.label.feedBy'))} (${e.via})">⬅</span>`),
      ...outEdges.map(e => `<span style="color:${viaColors[e.via]||'#aaa'};font-size:10px;" title="${escH(I18n.t('ex.label.feedTo'))} (${e.via})">➡</span>`),
    ].join('');
    return html ? `<span style="margin-left:4px;">${html}</span>` : '';
  }

  function _isPromotedTask(jobName) {
    return !!(cidsProdTasks && cidsProdTasks.has((jobName || '').toUpperCase()));
  }

  // Fila simple (task con un solo dataflow)
  function _renderIntegrationItem(p) {
    const typeClass = `ex-type-${p.tipoIntegracion || 'MD'}`;
    const promBadge = _isPromotedTask(p.jobName)
      ? `<span class="ex-chain-prom" title="${escH(I18n.t('ex.cids.promotedLabel'))}">✓</span> ` : '';
    const ibpBadge = _ibpMatches(p.jobName)
      ? `<span class="ex-ibp-badge" title="${escH(I18n.t('ex.ibp.section.title'))}">IBP</span>` : '';
    return `<div class="ex-item${selectedIdx === p._idx ? ' active' : ''}" data-idx="${p._idx}" onclick="Explorer.navigateTo(${p._idx}, 'root')">
      <div class="ex-name">
        <span class="ex-type-badge ${typeClass}">${escH(p.tipoIntegracion || 'MD')}</span>${promBadge}${ibpBadge}${escH(p.jobName)}${_chainBadges(new Set([p._idx]))}
      </div>
      ${p.dataflowName && p.dataflowName !== p.jobName ? `<div class="ex-sub ex-sub-df">↳ ${escH(p.dataflowName)}</div>` : ''}
      <div class="ex-sub">${escH(p.targetTable)}</div>
    </div>`;
  }

  // Sub-fila de dataflow dentro de un grupo de task
  function _renderDataflowSubItem(p) {
    const dfName = p.dataflowName || p.targetTable;
    return `<div class="ex-item ex-item-df${selectedIdx === p._idx ? ' active' : ''}" data-idx="${p._idx}" onclick="Explorer.navigateTo(${p._idx}, 'root')">
      <div class="ex-name ex-name-df">↳ ${escH(dfName)}${_chainBadges(new Set([p._idx]))}</div>
      <div class="ex-sub">${escH(p.targetTable)}</div>
    </div>`;
  }

  // Cabecera colapsable de task con N dataflows
  function _renderTaskGroup(jobName, dfs) {
    const p0        = dfs[0];
    const typeClass = `ex-type-${p0.tipoIntegracion || 'MD'}`;
    const grpId     = 'ex-task-' + p0._idx;
    const idxSet    = new Set(dfs.map(d => d._idx));
    const hasActive = dfs.some(d => d._idx === selectedIdx);
    const promBadge = _isPromotedTask(jobName)
      ? `<span class="ex-chain-prom" title="${escH(I18n.t('ex.cids.promotedLabel'))}">✓</span> ` : '';
    const ibpBadge = _ibpMatches(jobName)
      ? `<span class="ex-ibp-badge" title="${escH(I18n.t('ex.ibp.section.title'))}">IBP</span>` : '';
    return `<div class="ex-task-group">
      <div class="ex-task-head" onclick="var b=document.getElementById('${grpId}');b.classList.toggle('collapsed');this.querySelector('.ex-tarr').textContent=b.classList.contains('collapsed')?'▶':'▼';">
        <div class="ex-name">
          <span class="ex-type-badge ${typeClass}">${escH(p0.tipoIntegracion || 'MD')}</span>${promBadge}${ibpBadge}${escH(jobName)}
          <span class="ex-df-count">${dfs.length}</span>${_chainBadges(idxSet)}
        </div>
        <span class="ex-tarr">${hasActive ? '▼' : '▶'}</span>
      </div>
      <div class="ex-task-body${hasActive ? '' : ' collapsed'}" id="${grpId}">
        ${dfs.map(_renderDataflowSubItem).join('')}
      </div>
    </div>`;
  }

  // Agrupa una lista por jobName (preservando orden); tasks con >1 dataflow → grupo colapsable
  function _renderTaskItems(list) {
    const order = [];
    const byTask = new Map();
    list.forEach(p => {
      const key = p.jobName || '';
      if (!byTask.has(key)) { byTask.set(key, []); order.push(key); }
      byTask.get(key).push(p);
    });
    return order.map(key => {
      const dfs = byTask.get(key);
      return dfs.length === 1 ? _renderIntegrationItem(dfs[0]) : _renderTaskGroup(key, dfs);
    }).join('');
  }

  function renderSidebarList(list) {
    const el = document.getElementById('ex-master');
    if (!el) return;
    if (!list || list.length === 0) {
      el.innerHTML = `<p style="padding:12px;color:var(--text2);font-size:13px;">${escH(I18n.t('ex.empty.noIntegrations'))}</p>`;
      return;
    }

    // Agrupar por ZIP; si solo hay uno, lista plana sin header
    const groups = new Map();
    list.forEach(p => {
      if (!groups.has(p._zipName)) groups.set(p._zipName, []);
      groups.get(p._zipName).push(p);
    });

    if (groups.size === 1) {
      el.innerHTML = _renderTaskItems(list);
      return;
    }

    let html = '';
    groups.forEach((items, zipName) => {
      const projName  = zipName.replace(/\.zip$/i, '');
      const secId     = 'ex-proj-' + projName.replace(/[^a-zA-Z0-9]/g, '_');
      const hasActive = items.some(p => p._idx === selectedIdx);
      html += `
        <div class="ex-proj-header" onclick="var b=document.getElementById('${secId}');b.classList.toggle('collapsed');this.querySelector('.ex-arr').textContent=b.classList.contains('collapsed')?'▶':'▼';">
          <span>${escH(projName)} <span style="font-weight:400">(${items.length})</span></span>
          <span class="ex-arr">${hasActive ? '▼' : '▶'}</span>
        </div>
        <div class="ex-proj-body${hasActive ? '' : ' collapsed'}" id="${secId}">
          ${_renderTaskItems(items)}
        </div>`;
    });
    el.innerHTML = html;
  }

  // ── Navegación con historial de la cadena recorrida ─────────
  // navStack[0] es la raíz ("inicio") de la exploración actual y el tope
  // siempre coincide con selectedIdx. 'root' reinicia la pila (nueva
  // exploración desde lista/grafo/dimensión); 'push' apila (salto a un
  // vecino Feed By / Feed To). Toda navegación de usuario pasa por aquí.
  function navigateTo(idx, mode) {
    if (mode === 'root') {
      navStack = [idx];
    } else if (navStack[navStack.length - 1] !== idx) {
      navStack.push(idx);
    }
    renderDetail(idx);
  }

  // Volver al paso anterior: descarta el nodo actual y re-renderiza el
  // previo sin re-apilar (mantiene la invariante tope === selectedIdx).
  function navBack() {
    if (navStack.length <= 1) return;
    navStack.pop();
    renderDetail(navStack[navStack.length - 1]);
  }

  // Volver a la integración inicial de la cadena (raíz de la pila).
  function navHome() {
    if (navStack.length <= 1) return;
    navStack = [navStack[0]];
    renderDetail(navStack[0]);
  }

  // ── Detalle del panel derecho ────────────────────────────
  function renderDetail(idx) {
    selectedIdx = idx;
    // actualizar estado activo en master
    document.querySelectorAll('#ex-master .ex-item').forEach(el => {
      el.classList.toggle('active', +el.dataset.idx === idx);
    });

    // Liberar el network del diagrama anterior antes de re-renderizar el panel
    if (dfVisNetwork)   { try { dfVisNetwork.destroy();   } catch (e) {} dfVisNetwork   = null; }
    // Si quedó el modal fullscreen abierto de otra integración, cerrarlo
    if (dfVisNetworkFs) { closeDataflowFullscreen(); }

    const p   = integrations[idx];
    const det = document.getElementById('ex-detail');
    if (!p || !det) return;

    // cadenas
    const incoming = chainEdges.filter(e => e.to === idx);
    const outgoing = chainEdges.filter(e => e.from === idx);

    function chainPill(e, neighborIdx, dir) {
      const nb    = integrations[neighborIdx];
      const task  = nb ? nb.jobName : String(neighborIdx);
      const df    = nb && nb.dataflowName && nb.dataflowName !== nb.jobName ? nb.dataflowName : '';
      const viaCls = { table: '', file: ' via-file', lookup: ' via-lookup' }[e.via] || '';
      const viaIcon = { table: '⬌', file: '📄', lookup: '🔍' }[e.via] || '→';
      const isProd  = !!(cidsProdTasks && nb && cidsProdTasks.has((nb.jobName || '').toUpperCase()));
      const promCls = isProd ? ' is-prod' : '';
      const promBadge = isProd ? `<span class="ex-chain-prom" title="${escH(I18n.t('ex.cids.promotedLabel'))}">✓</span>` : '';
      const dfHtml = df ? `<span class="ex-chain-df">↳ ${escH(df)}</span>` : '';
      const tip = `${dir} (${escH(e.via)}): ${escH(e.label)}${isProd ? ' · ' + escH(I18n.t('ex.cids.promotedLabel')) : ''}`;
      return `<span class="ex-chain-pill${viaCls}${promCls}" onclick="Explorer.navigateTo(${neighborIdx}, 'push')" title="${tip}">${viaIcon} ${promBadge}<span class="ex-chain-task">${escH(task)}</span>${dfHtml}</span>`;
    }

    const chainsHtml = (incoming.length || outgoing.length) ? `
      <div class="ex-chain-section">
        ${incoming.length ? `
          <div class="ex-chain-label">⬅ ${escH(I18n.t('ex.label.feedBy'))}</div>
          <div>${incoming.map(e => chainPill(e, e.from, I18n.t('ex.label.feedBy'))).join('')}</div>` : ''}
        ${outgoing.length ? `
          <div class="ex-chain-label" style="margin-top:${incoming.length ? 8 : 0}px">➡ ${escH(I18n.t('ex.label.feedTo'))}</div>
          <div>${outgoing.map(e => chainPill(e, e.to, I18n.t('ex.label.feedTo'))).join('')}</div>` : ''}
      </div>` : '';

    // header card
    const canGoBack  = navStack.length > 1;
    const navBarHtml = canGoBack ? `
        <div class="ex-navbar">
          <button type="button" class="ex-nav-btn" onclick="Explorer.navBack()" title="${escH(I18n.t('ex.nav.backTitle'))}">◀ ${escH(I18n.t('ex.nav.back'))}</button>
          <button type="button" class="ex-nav-btn" onclick="Explorer.navHome()" title="${escH(I18n.t('ex.nav.homeTitle'))}">⌂ ${escH(I18n.t('ex.nav.home'))}</button>
        </div>` : '';
    const headerHtml = `
      <div class="ex-header-card">
        ${navBarHtml}
        <div class="ex-h-title">
          <span class="ex-type-badge ex-type-${p.tipoIntegracion || 'MD'}">${escH(p.tipoIntegracion || 'MD')}</span>
          ${escH(p.jobName)}
        </div>
        ${p.dataflowName && p.dataflowName !== p.jobName ? `<div class="ex-h-sub">↳ ${escH(I18n.t('ex.label.dataflow'))}: ${escH(p.dataflowName)}</div>` : ''}
        <div class="ex-h-flow">${escH(p.srcDSName || '—')} → ${escH(p.dstDSName || '—')}</div>
        <div class="ex-h-sub">${escH(I18n.t('ex.label.target'))}: <b>${escH(p.targetTable)}</b>${p.fileLoaderFileName ? ` · ${escH(I18n.t('ex.label.file'))}: <b>${escH(p.fileLoaderFileName)}</b>` : ''}</div>
        <div class="ex-h-sub" style="margin-top:2px;">${escH(I18n.t('ex.label.zip'))}: ${escH(p._zipName)}</div>
      </div>`;

    // diagrama tipo CI-DS (nodos + connections del DataFlow)
    // Sección colapsada por defecto. El network se instancia solo al expandir
    // — instanciar vis.Network sobre un contenedor con display:none produciría
    // un canvas con dimensiones cero. El onclick detecta el primer expand y
    // llama a Explorer.renderDataflowDiagram(idx).
    const hasDiagram = p.diagram && Array.isArray(p.diagram.nodes) && p.diagram.nodes.length > 0;
    const dfSecId = 'ex-df-sec-' + idx;
    const diagramHtml = hasDiagram ? `
      <div class="ex-detail-section">
        <div class="ex-section-header" onclick="
          var b=document.getElementById('${dfSecId}');
          var wasCollapsed=b.classList.contains('collapsed');
          b.classList.toggle('collapsed');
          this.querySelector('.ex-arr').textContent = b.classList.contains('collapsed') ? '▶' : '▼';
          if(wasCollapsed){ Explorer.renderDataflowDiagram(${idx}); }
        ">
          <span>${escH(I18n.t('ex.section.diagram'))} <span style="color:var(--text2);font-weight:400">(${p.diagram.nodes.length})</span></span>
          <span class="ex-arr">▶</span>
        </div>
        <div class="ex-section-body collapsed" id="${dfSecId}">
          <div class="ex-df-diagram-wrap">
            <button class="ex-df-fs-btn" onclick="event.stopPropagation();Explorer.openDataflowFullscreen(${idx})" title="${I18n.t('ex.btn.fullscreen')}">⛶</button>
            <div id="ex-df-diagram-${idx}" class="ex-df-diagram"></div>
          </div>
          <div id="ex-df-node-detail-${idx}" class="ex-df-node-detail"></div>
        </div>
      </div>` : '';

    // mappings
    const mappingsHtml = buildSection('🗂️ Mappings', p.mappings.length,
      p.mappings.length === 0 ? `<p style="color:var(--text2);font-size:12px;">${escH(I18n.t('ex.label.noMappings'))}</p>` :
      `<div style="overflow-x:auto">
        <table class="ex-mapping-table">
          <thead><tr>
            <th style="min-width:130px">${escH(I18n.t('ex.table.dstField'))}</th>
            <th style="min-width:130px">${escH(I18n.t('ex.table.source'))}</th>
            <th style="min-width:180px">${escH(I18n.t('ex.table.transform'))}</th>
          </tr></thead>
          <tbody>${p.mappings.map(m => {
            const hasLookup = m.ops && /\blookup\s*\(/i.test(m.ops);
            const hasOps    = m.ops && m.ops.trim().length > 0;
            const srcParts  = [m.srcDS, m.srcTable, m.srcField].filter(Boolean);
            return `<tr>
              <td>
                <div class="ex-dst-field">${escH(m.dstField)}</div>
                ${m.dstDesc ? `<div class="ex-dst-desc">${escH(m.dstDesc)}</div>` : ''}
              </td>
              <td class="ex-src-info">${escH(srcParts.join(' · ') || '—')}</td>
              <td>${hasOps ? `<code class="ex-ops-code">${escH(m.ops)}</code>` : '<span style="color:var(--text2)">—</span>'}
                ${hasLookup ? `<div><span class="ex-lookup-badge">lookup</span></div>` : ''}
              </td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>`
    );

    // filtros
    const filtersHtml = buildSection(I18n.t('ex.section.filters'), p.filters.length,
      p.filters.length === 0 ? `<p style="color:var(--text2);font-size:12px;">${escH(I18n.t('ex.label.noFilters'))}</p>` :
      p.filters.map(f => `
        <div class="ex-filter-row">
          ${f.sourceTable ? `<div class="ex-filter-table">${escH(I18n.t('ex.label.table'))}: ${escH(f.sourceTable)}</div>` : ''}
          <pre class="ex-filter-expr">${escH(f.expression)}</pre>
        </div>`).join('')
    );

    // lookups
    const lookupsHtml = p.lookups.length ? buildSection('🔗 Lookups', p.lookups.length,
      p.lookups.map(l => `
        <div class="ex-lookup-item">
          ${l.transform ? `<div class="ex-lookup-tf">${escH(I18n.t('ex.label.transform'))}: ${escH(l.transform)}</div>` : ''}
          <pre class="ex-lookup-fn">${escH(l.func)}</pre>
        </div>`).join('')
    ) : '';

    // variables
    const varsHtml = p.variables && p.variables.length ? buildSection('⚙️ Variables', p.variables.length,
      p.variables.map(v => `
        <div class="ex-var-row">
          <span class="ex-var-name">${escH(v.name)}</span>
          <span class="ex-var-val">${escH(v.value || I18n.t('ex.var.empty'))}</span>
        </div>`).join('')
    ) : '';

    // SAP IBP · Jobs y Steps — sólo cuando hay conexión IBP activa
    let ibpHtml = '';
    if (ibpTaskIndex) {
      const matches = _ibpMatches(p.jobName) || [];
      const body = matches.length === 0
        ? `<p class="ex-ibp-empty">${escH(I18n.t('ex.ibp.noMatch'))}</p>`
        : `<div style="overflow-x:auto"><table class="ex-ibp-table">
            <thead><tr>
              <th>${escH(I18n.t('ex.ibp.col.job'))}</th>
              <th>${escH(I18n.t('ex.ibp.col.step'))}</th>
              <th style="width:48px">${escH(I18n.t('ex.ibp.col.pos'))}</th>
              <th>${escH(I18n.t('ex.ibp.col.type'))}</th>
            </tr></thead>
            <tbody>${matches.map(m => `<tr>
              <td>${escH(m.jobName || '—')}</td>
              <td>${escH(m.stepName || '—')}</td>
              <td>${escH(String(m.stepPos ?? ''))}</td>
              <td>${escH(m.stepType || '—')}</td>
            </tr>`).join('')}</tbody>
          </table></div>`;
      ibpHtml = buildSection(I18n.t('ex.ibp.section.title'), matches.length, body);
    }

    det.innerHTML = headerHtml + chainsHtml + ibpHtml + diagramHtml + mappingsHtml + filtersHtml + lookupsHtml + varsHtml;

    // El network del diagrama se renderiza lazy al expandir la sección (ver onclick en diagramHtml).

    // scroll master al item activo
    const activeItem = document.querySelector('#ex-master .ex-item.active');
    if (activeItem) activeItem.scrollIntoView({ block: 'nearest' });
  }

  // ── Diagrama tipo CI-DS por DataFlow ─────────────────────
  // Paleta sobria estilo enterprise / SAP CI-DS Designer:
  // readers = azul slate (origen), transforms = slate oscuro (núcleo),
  // loaders = terracotta apagada (destino), utilidades = warm gray.
  const DF_TYPE_STYLE = {
    TableReader:            { color: '#5b7a99', icon: '📋' },
    TableLoader:            { color: '#8a6450', icon: '🎯' },
    FileReader:             { color: '#6f7a8a', icon: '📄' },
    FileLoader:             { color: '#8a6450', icon: '📄' },
    QueryTransform:         { color: '#475569', icon: '▦' },
    XMLMapTransform:        { color: '#475569', icon: '⟨⟩' },
    RowGenerationTransform: { color: '#7d7866', icon: '🔢' },
    MergeTransform:         { color: '#5a5e6e', icon: '◆' },
    CaseTransform:          { color: '#5a5e6e', icon: '◆' },
    ValidationTransform:    { color: '#5a5e6e', icon: '✓' },
    SQLTransform:           { color: '#5a5e6e', icon: 'SQL' },
    MapOperationTransform:  { color: '#5a5e6e', icon: '⟲' },
  };

  // ── Layout por coordenadas XML con escala adaptativa y Y-nudge ──────────
  // Calcula un factor de escala dinamico que ajusta el bounding-box del XML
  // al area target del canvas de vis-network. Esto evita flechas largas en
  // dataflows grandes y espacio desperdiciado en dataflows pequenos, siempre
  // preservando la topologia izquierda-derecha del CI-DS Designer.
  function layoutDataflowNodes(diagramNodes) {
    const positions = new Map();
    const withLoc   = diagramNodes.filter(n => n.location);
    if (withLoc.length === 0) return positions;

    const MIN_X_GAP  = 140;   // distancia horizontal minima entre centros (px)
    const MIN_Y_GAP  = 50;    // distancia vertical minima entre centros (px)
    const TARGET_W   = 1200;  // ancho objetivo en unidades vis-network
    const TARGET_H   = 450;   // alto objetivo en unidades vis-network
    const SCALE_MIN  = 1.5;
    const SCALE_MAX  = 4.0;

    // Bounding box de coordenadas XML
    const xs = withLoc.map(n => n.location.x);
    const ys = withLoc.map(n => n.location.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;

    // Escala uniforme: la dimension mas restrictiva manda; luego clampar
    const rawScale = Math.min(TARGET_W / rangeX, TARGET_H / rangeY);
    const scale    = Math.max(SCALE_MIN, Math.min(SCALE_MAX, rawScale));

    // Paso 1: escalar y centrar; invertir Y (CI-DS Y crece hacia arriba, vis hacia abajo)
    const cx = ((minX + maxX) / 2) * scale;
    const cy = ((minY + maxY) / 2) * scale;
    const nodePos = withLoc.map(n => ({
      id: n.id,
      x:   n.location.x * scale - cx,
      y:  -(n.location.y * scale - cy)
    }));

    // Paso 2: nudge Y iterativo — desplazar el nodo mas bajo cuando dos nodos
    // estan horizontalmente solapados (|dx| < MIN_X_GAP) y verticalmente
    // demasiado cercanos (|dy| < MIN_Y_GAP).
    for (let iter = 0; iter < 8; iter++) {
      let changed = false;
      for (let i = 0; i < nodePos.length; i++) {
        for (let j = i + 1; j < nodePos.length; j++) {
          const a = nodePos[i];
          const b = nodePos[j];
          if (Math.abs(a.x - b.x) < MIN_X_GAP && Math.abs(a.y - b.y) < MIN_Y_GAP) {
            if (a.y <= b.y) b.y = a.y + MIN_Y_GAP;
            else             a.y = b.y + MIN_Y_GAP;
            changed = true;
          }
        }
      }
      if (!changed) break;
    }

    nodePos.forEach(np => positions.set(np.id, { x: np.x, y: np.y }));
    return positions;
  }

  // Construye datasets vis-network compartidos por la vista embebida y el modal fullscreen
  function buildDataflowVisData(p) {
    const positions    = layoutDataflowNodes(p.diagram.nodes);
    const hasPositions = positions.size === p.diagram.nodes.length;

    const nodes = new vis.DataSet(p.diagram.nodes.map(n => {
      const st = DF_TYPE_STYLE[n.xmiType] || { color: '#7d9abf', icon: '◇' };
      const node = {
        id:    n.id,
        label: `${st.icon}  ${n.displayName || n.xmiType}`,
        title: makeTooltip([
          `<b>${escH(n.displayName || '')}</b>`,
          `${escH(I18n.t('ex.tooltip.type'))} ${escH(n.xmiType)}`,
          n.tableName ? `${escH(I18n.t('ex.label.table'))}: ${escH(n.tableName)}` : '',
          n.dsName    ? `${escH(I18n.t('ex.label.datastore'))}: ${escH(n.dsName)}` : '',
          n.fileName  ? `${escH(I18n.t('ex.label.file'))}: ${escH(n.fileName)}` : '',
          n.rowCount  ? `${escH(I18n.t('ex.label.rowCount'))}: ${escH(n.rowCount)}` : '',
        ].filter(Boolean)),
        shape:           'box',
        margin:          6,
        widthConstraint: { minimum: 100, maximum: 140 },
        color:           { background: st.color, border: st.color, highlight: { background: '#1f2937', border: '#F7A800' } },
        font:            { color: '#f5f7fa', size: 11, multi: false }
      };
      const pos = positions.get(n.id);
      if (pos) {
        node.x = pos.x;
        node.y = pos.y;
      }
      return node;
    }));

    const edges = new vis.DataSet(p.diagram.edges.map((e, i) => {
      const rawLabel = e.schemaName || '';
      return {
      id:     i,
      from:   e.from,
      to:     e.to,
      label:  rawLabel.length > 14 ? rawLabel.slice(0, 13) + '…' : rawLabel,
      title:  rawLabel || undefined,
      arrows: 'to',
      color:  { color: '#9db4d0', highlight: '#F7A800' },
      font:   { size: 10, color: '#9db4d0', align: 'middle', strokeColor: '#0a1320', strokeWidth: 3 },
      smooth: { type: 'cubicBezier', forceDirection: 'horizontal', roundness: 0.3 }
      };
    }));

    const options = {
      physics:     false,
      interaction: { hover: true, tooltipDelay: 100, zoomView: true, dragView: true, dragNodes: true },
      nodes:       { borderWidth: 1, borderWidthSelected: 2 },
      edges:       { smooth: { type: 'cubicBezier' } },
      layout:      hasPositions
        ? { hierarchical: false }
        : { hierarchical: { direction: 'LR', sortMethod: 'directed', levelSeparation: 240, nodeSpacing: 100 } }
    };
    return { nodes, edges, options };
  }

  function renderDataflowDiagram(idx) {
    const p = integrations[idx];
    if (!p || !p.diagram || typeof vis === 'undefined') return;
    const container = document.getElementById('ex-df-diagram-' + idx);
    if (!container) return;

    if (dfVisNetwork) { try { dfVisNetwork.destroy(); } catch (e) {} dfVisNetwork = null; }

    const { nodes, edges, options } = buildDataflowVisData(p);
    dfVisNetwork = new vis.Network(container, { nodes, edges }, options);
    dfVisNetwork.once('afterDrawing', () => {
      try { dfVisNetwork.fit({ animation: false }); } catch (e) {}
    });
    dfVisNetwork.on('click', params => {
      if (params.nodes.length) renderDataflowNodeDetail(idx, params.nodes[0]);
    });
  }

  // ── Modal fullscreen del diagrama del DataFlow ────────────
  let dfFsResizerInit = false;   // listener mousedown se registra una sola vez

  function initDataflowFsResizer() {
    if (dfFsResizerInit) return;
    const resizer = document.getElementById('ex-df-fs-resizer');
    const modal   = document.getElementById('ex-df-fs-modal');
    const body    = modal ? modal.querySelector('.ex-df-fs-body') : null;
    if (!resizer || !modal || !body) return;

    const startDrag = (clientX) => {
      resizer.classList.add('dragging');
      document.body.style.cursor = 'col-resize';

      const onMove = (mvClientX) => {
        const rect    = body.getBoundingClientRect();
        const newW    = rect.right - mvClientX;
        const minW    = 240;
        const maxW    = Math.max(minW, Math.floor(window.innerWidth * 0.6));
        const clamped = Math.min(maxW, Math.max(minW, newW));
        modal.style.setProperty('--df-fs-detail-w', clamped + 'px');
        if (dfVisNetworkFs) { try { dfVisNetworkFs.redraw(); } catch (e) {} }
      };
      const endDrag = () => {
        resizer.classList.remove('dragging');
        document.body.style.cursor = '';
        document.removeEventListener('mousemove', mouseMoveH);
        document.removeEventListener('mouseup',   endDrag);
        document.removeEventListener('touchmove', touchMoveH);
        document.removeEventListener('touchend',  endDrag);
        if (dfVisNetworkFs) { try { dfVisNetworkFs.redraw(); } catch (e) {} }
      };
      const mouseMoveH = (e) => onMove(e.clientX);
      const touchMoveH = (e) => { if (e.touches[0]) { onMove(e.touches[0].clientX); e.preventDefault(); } };

      document.addEventListener('mousemove', mouseMoveH);
      document.addEventListener('mouseup',   endDrag);
      document.addEventListener('touchmove', touchMoveH, { passive: false });
      document.addEventListener('touchend',  endDrag);
    };

    resizer.addEventListener('mousedown',  e => { e.preventDefault(); startDrag(e.clientX); });
    resizer.addEventListener('touchstart', e => { if (e.touches[0]) { e.preventDefault(); startDrag(e.touches[0].clientX); } }, { passive: false });
    dfFsResizerInit = true;
  }

  function openDataflowFullscreen(idx) {
    const p = integrations[idx];
    if (!p || !p.diagram || typeof vis === 'undefined') return;
    const modal = document.getElementById('ex-df-fs-modal');
    const graph = document.getElementById('ex-df-fs-graph');
    const title = document.getElementById('ex-df-fs-title');
    const det   = document.getElementById('ex-df-fs-node-detail');
    if (!modal || !graph) return;

    if (dfVisNetworkFs) { try { dfVisNetworkFs.destroy(); } catch (e) {} dfVisNetworkFs = null; }

    dfFsIntIdx = idx;
    if (title) {
      const dfName = p.dataflowName || p.jobName || '';
      title.innerHTML = `<span class="ex-type-badge ex-type-${p.tipoIntegracion || 'MD'}">${escH(p.tipoIntegracion || 'MD')}</span>
        ${escH(p.jobName || '')}${p.dataflowName && p.dataflowName !== p.jobName ? ` <span class="ex-df-fs-sub">↳ ${escH(p.dataflowName)}</span>` : ''}`;
    }
    if (det) det.innerHTML = `<div class="ex-df-fs-detail-hint">${escH(I18n.t('ex.df.fs.hint'))}</div>`;

    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleFsKeydown);
    initDataflowFsResizer();

    const { nodes, edges, options } = buildDataflowVisData(p);
    dfVisNetworkFs = new vis.Network(graph, { nodes, edges }, options);
    dfVisNetworkFs.once('afterDrawing', () => {
      try { dfVisNetworkFs.fit({ animation: false }); } catch (e) {}
    });
    dfVisNetworkFs.on('click', params => {
      if (params.nodes.length) renderDataflowNodeDetail(idx, params.nodes[0]);
    });
  }

  function closeDataflowFullscreen() {
    const modal = document.getElementById('ex-df-fs-modal');
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = '';
    document.removeEventListener('keydown', handleFsKeydown);
    if (dfVisNetworkFs) { try { dfVisNetworkFs.destroy(); } catch (e) {} dfVisNetworkFs = null; }
    dfFsIntIdx = null;
  }

  function handleFsKeydown(e) {
    if (e.key === 'Escape') closeDataflowFullscreen();
  }

  function renderDataflowNodeDetail(intIdx, nodeId) {
    const p = integrations[intIdx];
    if (!p || !p.diagram) return;
    const n = p.diagram.nodes.find(x => x.id === nodeId);
    if (!n) return;
    // Targets: panel inline + panel del modal fullscreen si está abierto para esta integración
    const targets = [];
    const inline = document.getElementById('ex-df-node-detail-' + intIdx);
    if (inline) targets.push(inline);
    if (dfFsIntIdx === intIdx) {
      const fs = document.getElementById('ex-df-fs-node-detail');
      if (fs) targets.push(fs);
    }
    if (!targets.length) return;

    const st = DF_TYPE_STYLE[n.xmiType] || { color: '#7d9abf', icon: '◇' };

    let body = '';
    if (n.xmiType.includes('TableReader') || n.xmiType.includes('TableLoader')) {
      body = `
        <div class="ex-df-kv">${escH(I18n.t('ex.label.datastore'))}: <b>${escH(n.dsName || '—')}</b></div>
        <div class="ex-df-kv">${escH(I18n.t('ex.label.table'))}: <b>${escH(n.tableName || '—')}</b></div>`;
    } else if (n.xmiType.includes('FileReader') || n.xmiType.includes('FileLoader')) {
      body = `
        <div class="ex-df-kv">${escH(I18n.t('ex.label.datastore'))}: <b>${escH(n.dsName || '—')}</b></div>
        <div class="ex-df-kv">${escH(I18n.t('ex.label.file'))}: <b>${escH(n.fileName || '—')}</b></div>`;
    } else if (n.xmiType.includes('RowGenerationTransform')) {
      body = `<div class="ex-df-kv">${escH(I18n.t('ex.label.rowCount'))}: <b>${escH(n.rowCount || '—')}</b></div>`;
    } else if (n.xmiType.includes('QueryTransform') || n.xmiType.includes('XMLMapTransform')) {
      const inputs = (n.inputSchemas || []).map(s => `<span class="ex-df-input-chip">${escH(s)}</span>`).join('');
      const joins  = (n.joins || []).map(j => `
        <div class="ex-df-join">
          <div class="ex-df-join-heads">${escH(j.leftSchemaName)} ⋈ ${escH(j.rightSchemaName)}</div>
          <pre class="ex-filter-expr">${escH(j.expression)}</pre>
        </div>`).join('');
      const filterBlock = n.filterExpression ? `
        <div class="ex-df-filter-block">
          <div class="ex-df-filter-label">${escH(I18n.t('ex.label.where'))}</div>
          <pre class="ex-filter-expr">${escH(n.filterExpression)}</pre>
        </div>` : '';
      // Solo campos con projection (consistente con el tab Mappings)
      const mappedFields = (n.fields || []).filter(f => f.projectionExpression && f.projectionExpression.trim());
      const fieldsBody = mappedFields.length === 0 ? '' : `
        <div class="ex-df-section-label">Mappings (${mappedFields.length})</div>
        <div style="overflow-x:auto">
          <table class="ex-df-mapping-table">
            <thead><tr><th style="width:30%">Campo</th><th>Projection</th></tr></thead>
            <tbody>${mappedFields.map(f => `
              <tr>
                <td>
                  <b>${escH(f.name)}</b>
                  ${f.description ? `<div class="ex-dst-desc">${escH(f.description)}</div>` : ''}
                </td>
                <td><code class="ex-ops-code">${escH(f.projectionExpression)}</code></td>
              </tr>`).join('')}</tbody>
          </table>
        </div>`;
      body =
        (inputs ? `<div class="ex-df-inputs"><span class="ex-df-section-label">${escH(I18n.t('ex.label.inputs'))}:</span> ${inputs}</div>` : '') +
        joins + filterBlock + fieldsBody;
    } else {
      body = `<div style="color:var(--text2);">${escH(I18n.t('ex.label.noNodeDetail'))}</div>`;
    }

    const html = `
      <div class="ex-df-node-header">
        <span class="ex-df-type-badge" style="background:${st.color};">${escH(n.xmiType)}</span>
        <b>${escH(n.displayName || '')}</b>
      </div>
      ${body}`;
    targets.forEach(t => { t.innerHTML = html; });
  }

  function buildSection(title, count, body, collapsed = false) {
    const id = 'ex-sec-' + Math.random().toString(36).slice(2);
    return `
      <div class="ex-detail-section">
        <div class="ex-section-header" onclick="
          var b=document.getElementById('${id}');
          b.classList.toggle('collapsed');
          this.querySelector('.ex-arr').textContent = b.classList.contains('collapsed') ? '▶' : '▼';
        ">
          <span>${escH(title)} <span style="color:var(--text2);font-weight:400">(${count})</span></span>
          <span class="ex-arr">${collapsed ? '▶' : '▼'}</span>
        </div>
        <div class="ex-section-body${collapsed ? ' collapsed' : ''}" id="${id}">${body}</div>
      </div>`;
  }

  // ── Búsqueda global ──────────────────────────────────────
  function applySearch(q) {
    if (currentDim !== 'integration') {
      renderMasterForDim(currentDim, q);
      return;
    }
    applySearchIntegration(q);
  }

  function applySearchIntegration(q) {
    const base  = computeBaseFiltered();
    const query = (q || '').trim().toLowerCase();
    if (!query) {
      filtered = base;
    } else {
      const terms = query.split(/\s+/).filter(Boolean);
      filtered = base.filter(p => {
        const entry = indexes.searchTokens.find(s => s.idx === p._idx);
        if (!entry) return false;
        return terms.every(t => entry.tokens.includes(t));
      });
    }
    renderSidebarList(filtered);
    updateCounter(filtered.length, integrations.length);
    if (selectedIdx !== null && !filtered.find(p => p._idx === selectedIdx)) {
      document.getElementById('ex-detail').innerHTML = `<p class="docs-hint">${escH(I18n.t('ex.empty.selectIntegration'))}</p>`;
      selectedIdx = null;
      navStack = [];
    }
    updateSidebarHeader();
  }

  // ── Copiar listado de tareas (formato tabla) ─────────────
  // Genera TSV con cabecera: ZIP · Tarea · DS Origen · DS Destino · Tabla Destino.
  // Una fila por dataflow/integración del conjunto recibido (sin dedupe: cada
  // dataflow puede tener distinta tabla destino).
  function _tasksToTSV(list) {
    const header = [
      I18n.t('ex.copy.col.zip'),
      I18n.t('ex.copy.col.task'),
      I18n.t('ex.copy.col.srcDS'),
      I18n.t('ex.copy.col.dstDS'),
      I18n.t('ex.copy.col.targetTable'),
    ].join('\t');
    const clean = v => String(v == null ? '' : v).replace(/[\t\r\n]+/g, ' ').trim();
    const rows = list.map(p => [
      clean((p._zipName || '').replace(/\.zip$/i, '')),
      clean(p.jobName),
      clean(p.srcDSName),
      clean(p.dstDSName),
      clean(p.targetTable),
    ].join('\t'));
    return [header, ...rows].join('\n');
  }

  // Copia texto al portapapeles. Intenta la API moderna y cae al método
  // execCommand (más fiable dentro de iframes con permisos restringidos).
  function _copyText(text) {
    const fallback = () => {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
      } catch (e) { return false; }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(() => true).catch(() => fallback());
    }
    return Promise.resolve(fallback());
  }

  let _toastTimer = null;
  function _toast(msg, isError) {
    let el = document.getElementById('ex-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'ex-toast';
      el.className = 'ex-toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.toggle('is-error', !!isError);
    el.classList.add('show');
    if (_toastTimer) clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => { el.classList.remove('show'); }, 2200);
  }

  function _flashCopyBtn(btnId, ok) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    const ico = btn.querySelector('.ex-copy-ico');
    if (!ico) return;
    const prev = ico.textContent;
    ico.textContent = ok ? '✓' : '✕';
    btn.classList.add(ok ? 'copied' : 'copy-err');
    setTimeout(() => {
      ico.textContent = prev;
      btn.classList.remove('copied', 'copy-err');
    }, 1500);
  }

  function _doCopyTasks(list, btnId) {
    if (!list || !list.length) { _toast(I18n.t('ex.copy.toast.empty'), true); return; }
    _copyText(_tasksToTSV(list)).then(ok => {
      _flashCopyBtn(btnId, ok);
      if (ok) {
        const n = list.length;
        _toast(I18n.t(n === 1 ? 'ex.copy.toast.ok.one' : 'ex.copy.toast.ok.many', { n }));
      } else {
        _toast(I18n.t('ex.copy.toast.err'), true);
      }
    });
  }

  // Entradas [key, items] actualmente mostradas en la sidebar en vista dimensional
  // (se guardan al renderizar para que el botón copie exactamente lo visible).
  let _currentDimEntries = [];

  // TSV del listado de la sidebar en vista dimensional. Columnas según la dimensión:
  //  · tablas:  Datastore · Tabla · Integraciones · Mapeos/Filtros
  //  · campos:  Campo · Integraciones · Usos/Filtros
  function _dimEntriesToTSV(dim, entries) {
    const isField  = dim === 'dst-field' || dim === 'src-field' || dim === 'filter-field';
    const isFilter = dim === 'filter-table' || dim === 'filter-field';
    const countCol = isFilter ? I18n.t('ex.copy.col.filters') : (isField ? I18n.t('ex.copy.col.uses') : I18n.t('ex.copy.col.mappings'));
    const clean = v => String(v == null ? '' : v).replace(/[\t\r\n]+/g, ' ').trim();
    let header, rows;
    if (isField) {
      header = [I18n.t('ex.copy.col.field'), I18n.t('ex.copy.col.integrations'), countCol].join('\t');
      rows = entries.map(([key, items]) => {
        const intCount = new Set(items.map(x => x.intIdx)).size;
        return [clean(key), intCount, items.length].join('\t');
      });
    } else {
      header = [I18n.t('ex.copy.col.datastore'), I18n.t('ex.copy.col.table'), I18n.t('ex.copy.col.integrations'), countCol].join('\t');
      rows = entries.map(([key, items]) => {
        const parts = key.split('::');
        const intCount = new Set(items.map(x => x.intIdx)).size;
        return [clean(parts[0] || ''), clean(parts[1] || key), intCount, items.length].join('\t');
      });
    }
    return [header, ...rows].join('\n');
  }

  // Actualiza la cabecera de la sidebar (título + botón de copia). El botón se
  // muestra siempre que haya un listado, en cualquier dimensión.
  function updateSidebarHeader() {
    const head  = document.getElementById('ex-master-head');
    const title = document.getElementById('ex-master-title');
    if (!head || !title) return;
    let count, label;
    if (currentDim === 'integration') {
      count = (filtered || []).length;
      label = I18n.t('ex.list.tasks');
    } else {
      count = _currentDimEntries.length;
      label = dimLabel(currentDim) || currentDim;
    }
    const hasData = integrations && integrations.length > 0 && count > 0;
    head.style.display = hasData ? '' : 'none';
    title.textContent  = hasData ? `${label} (${count})` : '';
  }

  // Botón sidebar: copia el listado actualmente visible a la izquierda.
  //  · vista Integración → tareas (ZIP · Tarea · DS Origen · DS Destino · Tabla).
  //  · vistas dimensionales → el listado de tablas/campos mostrado.
  function copySidebarList() {
    if (currentDim === 'integration') {
      _doCopyTasks(filtered, 'ex-copy-master');
      return;
    }
    if (!_currentDimEntries.length) { _toast(I18n.t('ex.copy.toast.empty'), true); return; }
    _copyTSV(_dimEntriesToTSV(currentDim, _currentDimEntries), _currentDimEntries.length, 'ex-copy-master');
  }

  // Botón panel de detalle (derecha): copia las tareas listadas para la
  // dimensión seleccionada (p. ej. todas las que usan un datastore de origen).
  function copyDimDetailList() {
    if (selectedDimKey === null || currentDim === 'integration') return;
    const mapKey   = DIM_MAP_KEY[currentDim];
    const rawItems = mapKey && indexes[mapKey] ? (indexes[mapKey][selectedDimKey] || []) : [];
    const baseIdxSet = (activePA.size > 0 || activeSrcDS.size > 0 || activeDstDS.size > 0 || (showPromoted && cidsProdTasks))
      ? new Set(computeBaseFiltered().map(p => p._idx))
      : null;
    const items = baseIdxSet ? rawItems.filter(x => baseIdxSet.has(x.intIdx)) : rawItems;
    const seen = new Set();
    const list = [];
    items.forEach(x => {
      if (seen.has(x.intIdx)) return;
      seen.add(x.intIdx);
      const p = integrations[x.intIdx];
      if (p) list.push(p);
    });
    _doCopyTasks(list, 'ex-copy-dim');
  }

  // Copia un TSV ya generado y muestra feedback con el número de filas de datos.
  function _copyTSV(tsv, n, btnId) {
    _copyText(tsv).then(ok => {
      _flashCopyBtn(btnId, ok);
      if (ok) _toast(I18n.t(n === 1 ? 'ex.copy.toast.ok.one' : 'ex.copy.toast.ok.many', { n }));
      else    _toast(I18n.t('ex.copy.toast.err'), true);
    });
  }

  function updateCounter(visible, total) {
    const el = document.getElementById('ex-counter');
    if (!el || visible === null) return;
    if (currentDim !== 'integration') {
      const dimKeyMap = {
        'dst-table':    'ex.dim.counter.dstTable',
        'src-table':    'ex.dim.counter.srcTable',
        'dst-field':    'ex.dim.counter.dstField',
        'src-field':    'ex.dim.counter.srcField',
        'filter-table': 'ex.dim.counter.filterTable',
        'filter-field': 'ex.dim.counter.filterField',
      };
      const lbl = dimKeyMap[currentDim] ? I18n.t(dimKeyMap[currentDim]) : '';
      el.textContent = visible === total ? `${total} ${lbl}` : `${visible} / ${total} ${lbl}`;
    } else {
      el.textContent = visible === total
        ? I18n.t(total === 1 ? 'ex.unit.integration.one' : 'ex.unit.integration.many', { n: total })
        : `${visible} / ${total}`;
    }
  }

  // ── Dimensiones ──────────────────────────────────────────
  const DIM_MAP_KEY = {
    'dst-table':    'byDstTable',
    'src-table':    'bySrcTable',
    'dst-field':    'byDstField',
    'src-field':    'bySrcField',
    'filter-table': 'byFilterTable',
    'filter-field': 'byFilterField',
  };
  const DIM_LABEL_KEY = {
    'dst-table':    'ex.dim.dstTable',
    'src-table':    'ex.dim.srcTable',
    'dst-field':    'ex.dim.dstField',
    'src-field':    'ex.dim.srcField',
    'filter-table': 'ex.dim.filterTable',
    'filter-field': 'ex.dim.filterField',
  };
  function dimLabel(dim) {
    return DIM_LABEL_KEY[dim] ? I18n.t(DIM_LABEL_KEY[dim]) : '';
  }
  const ALL_DIMS = ['integration','dst-table','src-table','dst-field','src-field','filter-table','filter-field'];

  function switchDimension(dim) {
    currentDim     = dim;
    selectedDimKey = null;

    ALL_DIMS.forEach(d => {
      const btn = document.getElementById('ex-dim-' + d);
      if (btn) btn.classList.toggle('active', d === dim);
    });

    // grafo solo aplica en vista integracion
    const vt = document.getElementById('ex-view-toggle');
    if (vt) vt.style.display = dim === 'integration' ? '' : 'none';
    if (currentView === 'graph' && dim !== 'integration') switchView('list');

    const det = document.getElementById('ex-detail');
    if (det) det.innerHTML = `<p class="docs-hint">${escH(I18n.t('ex.empty.selectElement'))}</p>`;

    const q = (document.getElementById('ex-search') || {}).value || '';
    renderMasterForDim(dim, q);
    updateSidebarHeader();
  }

  function renderMasterForDim(dim, query) {
    if (dim === 'integration') { applySearchIntegration(query); return; }
    const mapKey = DIM_MAP_KEY[dim];
    if (!mapKey) return;
    renderMasterDimItems(indexes[mapKey], dim, query);
    if (selectedDimKey !== null) renderDetailDimByKey(selectedDimKey, dim);
  }

  // Para dimensiones de filtro, el contador muestra filtros (fIdx) en lugar de mapeos (mIdx)
  function isMappingDim(dim) {
    return dim === 'dst-table' || dim === 'src-table' || dim === 'dst-field' || dim === 'src-field';
  }
  function isFilterDim(dim) {
    return dim === 'filter-table' || dim === 'filter-field';
  }

  function renderMasterDimItems(dimMap, dim, filterQuery) {
    const el = document.getElementById('ex-master');
    if (!el) return;
    const isField  = dim === 'dst-field'    || dim === 'src-field'    || dim === 'filter-field';
    const isFilter = dim === 'filter-table' || dim === 'filter-field';

    const paSet = (activePA.size > 0 || (showPromoted && cidsProdTasks))
      ? new Set(computeBaseFiltered().map(p => p._idx))
      : null;

    let entries = Object.entries(dimMap || {});
    if (paSet) {
      entries = entries.map(([key, items]) => {
        const filtered = items.filter(x => paSet.has(x.intIdx));
        return filtered.length ? [key, filtered] : null;
      }).filter(Boolean);
    }
    if (filterQuery) {
      const q = filterQuery.toLowerCase();
      entries = entries.filter(([key]) => key.toLowerCase().includes(q));
    }
    entries.sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));

    updateCounter(entries.length, Object.keys(dimMap || {}).length);
    _currentDimEntries = entries;
    updateSidebarHeader();

    if (!entries.length) {
      el.innerHTML = `<p style="padding:12px;color:var(--text2);font-size:13px;">${escH(I18n.t('ex.empty.noResults'))}</p>`;
      return;
    }

    el.innerHTML = entries.map(([key, items]) => {
      const isActive = selectedDimKey === key;
      let label, sublabel;
      const intCount = new Set(items.map(x => x.intIdx)).size;
      if (isField) {
        label    = key;
        const unitKey = isFilter ? 'ex.unit.filter' : 'ex.unit.usage';
        sublabel = `${_plural(unitKey, items.length)} · ${_plural('ex.unit.integration', intCount)}`;
      } else {
        const parts = key.split('::');
        label = parts[1] || key;
        if (isFilter) {
          sublabel = `${_plural('ex.unit.integration', intCount)} · ${_plural('ex.unit.filter', items.length)}`;
        } else {
          sublabel = (parts[0] ? parts[0] + ' · ' : '') + `${_plural('ex.unit.integration', intCount)} · ${_plural('ex.unit.mapping', items.length)}`;
        }
      }
      return `<div class="ex-item${isActive ? ' active' : ''}" data-key="${escH(encodeURIComponent(key))}" onclick="Explorer.handleDimItemClick(this)">
        <div class="ex-name">${escH(label)}</div>
        <div class="ex-sub">${escH(sublabel)}</div>
      </div>`;
    }).join('');
  }

  function _plural(unitKey, n) {
    return I18n.t(unitKey + (n === 1 ? '.one' : '.many'), { n });
  }

  function handleDimItemClick(el) {
    const key = decodeURIComponent(el.getAttribute('data-key') || '');
    renderDetailDimByKey(key, currentDim);
  }

  function renderDetailDimByKey(key, dim) {
    selectedDimKey = key;
    document.querySelectorAll('#ex-master .ex-item').forEach(el => {
      el.classList.toggle('active', decodeURIComponent(el.getAttribute('data-key') || '') === key);
    });

    const det = document.getElementById('ex-detail');
    if (!det) return;

    const mapKey  = DIM_MAP_KEY[dim];
    const rawItems = mapKey && indexes[mapKey] ? (indexes[mapKey][key] || []) : [];
    const baseIdxSet = (activePA.size > 0 || (showPromoted && cidsProdTasks))
      ? new Set(computeBaseFiltered().map(p => p._idx))
      : null;
    const items = baseIdxSet ? rawItems.filter(x => baseIdxSet.has(x.intIdx)) : rawItems;
    if (!items.length) { det.innerHTML = `<p class="docs-hint">${escH(I18n.t('ex.empty.noData'))}</p>`; return; }

    const isField  = dim === 'dst-field'    || dim === 'src-field'    || dim === 'filter-field';
    const isDst    = dim === 'dst-table'    || dim === 'dst-field';
    const isFilter = dim === 'filter-table' || dim === 'filter-field';
    const parts    = key.split('::');
    const displayName = isField ? key : (parts[1] || key);
    const displayDS   = isField ? '' : (parts[0] || '');
    const intCount    = new Set(items.map(x => x.intIdx)).size;
    const unitKey     = isFilter ? 'ex.unit.filter' : 'ex.unit.mapping';

    let html = `
      <div class="ex-header-card">
        <button class="ex-copy-btn ex-copy-btn-detail" id="ex-copy-dim" onclick="Explorer.copyDimDetailList()" title="${escH(I18n.t('ex.btn.copyTasks'))}">
          <span class="ex-copy-ico" aria-hidden="true">⧉</span>
          <span class="ex-copy-lbl">${escH(I18n.t('ex.btn.copyShort'))}</span>
        </button>
        <div class="ex-h-title">${escH(displayName)}</div>
        ${displayDS ? `<div class="ex-h-flow">${escH(I18n.t('ex.label.datastore'))}: ${escH(displayDS)}</div>` : ''}
        <div class="ex-h-sub">${escH(dimLabel(dim) || dim)} · ${escH(_plural(unitKey, items.length))} · ${escH(_plural('ex.unit.integration', intCount))}</div>
      </div>`;

    if (isFilter) {
      // ── Vista para filtros/joins ──────────────────────────
      // Agrupar por integracion; items tiene {intIdx, fIdx}
      const byInt = new Map();
      items.forEach(({ intIdx, fIdx }) => {
        if (!byInt.has(intIdx)) byInt.set(intIdx, []);
        byInt.get(intIdx).push(fIdx);
      });

      byInt.forEach((fIdxList, intIdx) => {
        const p = integrations[intIdx];
        if (!p) return;
        // Eliminar duplicados de fIdx (una expresion puede matchear varios campos)
        const uniqueFIdx = [...new Set(fIdxList)];
        const secId = 'exsec-' + intIdx + '-' + Math.random().toString(36).slice(2, 6);
        html += `
          <div class="ex-detail-section">
            <div class="ex-section-header" onclick="var b=document.getElementById('${secId}');b.classList.toggle('collapsed');this.querySelector('.ex-arr').textContent=b.classList.contains('collapsed')?'▶':'▼';">
              <span>
                <span class="ex-type-badge ex-type-${p.tipoIntegracion || 'MD'}">${escH(p.tipoIntegracion || 'MD')}</span>
                ${escH(p.jobName)}${p.dataflowName && p.dataflowName !== p.jobName ? ` <span style="color:var(--text2);font-size:11px;">↳ ${escH(p.dataflowName)}</span>` : ''}
                <span style="color:var(--text2);font-weight:400;font-size:11px;margin-left:6px;">${escH(p._zipName)}</span>
              </span>
              <span style="display:flex;gap:6px;align-items:center">
                <span style="color:var(--text2);font-size:11px;">${escH(_plural('ex.unit.filter', uniqueFIdx.length))}</span>
                <span class="ex-chain-pill" onclick="event.stopPropagation();Explorer.goToIntegration(${intIdx})" title="${I18n.t('ex.btn.viewFull')}">${I18n.t('ex.btn.viewFull').split(' ')[0]}</span>
                <span class="ex-arr">▶</span>
              </span>
            </div>
            <div class="ex-section-body collapsed" id="${secId}">
              ${uniqueFIdx.map(fIdx => {
                const f = p.filters[fIdx];
                if (!f) return '';
                return `<div class="ex-filter-row">
                  ${f.sourceTable ? `<div class="ex-filter-table">${escH(I18n.t('ex.label.table'))}: ${escH(f.sourceTable)}</div>` : ''}
                  <pre class="ex-filter-expr">${escH(f.expression)}</pre>
                </div>`;
              }).join('')}
            </div>
          </div>`;
      });

    } else {
      // ── Vista para mappings (comportamiento original) ─────
      const byInt = new Map();
      items.forEach(({ intIdx, mIdx }) => {
        if (!byInt.has(intIdx)) byInt.set(intIdx, []);
        byInt.get(intIdx).push(mIdx);
      });

      byInt.forEach((mIdxList, intIdx) => {
        const p = integrations[intIdx];
        if (!p) return;
        const secId = 'exsec-' + intIdx + '-' + Math.random().toString(36).slice(2, 6);
        html += `
          <div class="ex-detail-section">
            <div class="ex-section-header" onclick="var b=document.getElementById('${secId}');b.classList.toggle('collapsed');this.querySelector('.ex-arr').textContent=b.classList.contains('collapsed')?'▶':'▼';">
              <span>
                <span class="ex-type-badge ex-type-${p.tipoIntegracion || 'MD'}">${escH(p.tipoIntegracion || 'MD')}</span>
                ${escH(p.jobName)}${p.dataflowName && p.dataflowName !== p.jobName ? ` <span style="color:var(--text2);font-size:11px;">↳ ${escH(p.dataflowName)}</span>` : ''}
                <span style="color:var(--text2);font-weight:400;font-size:11px;margin-left:6px;">${escH(p._zipName)}</span>
              </span>
              <span style="display:flex;gap:6px;align-items:center">
                <span style="color:var(--text2);font-size:11px;">${mIdxList.length} campo${mIdxList.length !== 1 ? 's' : ''}</span>
                <span class="ex-chain-pill" onclick="event.stopPropagation();Explorer.goToIntegration(${intIdx})" title="${I18n.t('ex.btn.viewFull')}">${I18n.t('ex.btn.viewFull').split(' ')[0]}</span>
                <span class="ex-arr">▶</span>
              </span>
            </div>
            <div class="ex-section-body collapsed" id="${secId}">
              <div style="overflow-x:auto">
                <table class="ex-mapping-table">
                  <thead><tr>
                    ${isDst
                      ? `<th style="min-width:120px">${escH(I18n.t('ex.table.dstField'))}</th><th style="min-width:130px">${escH(I18n.t('ex.table.source'))}</th><th>${escH(I18n.t('ex.table.transform'))}</th>`
                      : `<th style="min-width:130px">${escH(I18n.t('ex.table.srcField'))}</th><th style="min-width:120px">${escH(I18n.t('ex.table.dstField'))}</th><th>${escH(I18n.t('ex.table.transform'))}</th>`}
                  </tr></thead>
                  <tbody>${mIdxList.map(mIdx => {
                    const m = p.mappings[mIdx];
                    if (!m) return '';
                    const srcParts = [m.srcDS, m.srcTable, m.srcField].filter(Boolean);
                    const hasOps = m.ops && m.ops.trim().length > 0;
                    if (isDst) {
                      return `<tr>
                        <td><div class="ex-dst-field">${escH(m.dstField)}</div>${m.dstDesc ? `<div class="ex-dst-desc">${escH(m.dstDesc)}</div>` : ''}</td>
                        <td class="ex-src-info">${escH(srcParts.join(' · ') || '—')}</td>
                        <td>${hasOps ? `<code class="ex-ops-code">${escH(m.ops)}</code>` : '<span style="color:var(--text2)">—</span>'}</td>
                      </tr>`;
                    } else {
                      return `<tr>
                        <td class="ex-src-info">${escH(srcParts.join(' · ') || '—')}</td>
                        <td><div class="ex-dst-field">${escH(m.dstField)}</div>${m.dstTable ? `<div class="ex-dst-desc">${escH(m.dstTable)}</div>` : ''}</td>
                        <td>${hasOps ? `<code class="ex-ops-code">${escH(m.ops)}</code>` : '<span style="color:var(--text2)">—</span>'}</td>
                      </tr>`;
                    }
                  }).join('')}</tbody>
                </table>
              </div>
            </div>
          </div>`;
      });
    }

    det.innerHTML = html;
  }

  function goToIntegration(idx) {
    const searchEl = document.getElementById('ex-search');
    if (searchEl) searchEl.value = '';
    filtered = integrations.slice();
    currentDim = 'integration';
    selectedDimKey = null;
    ALL_DIMS.forEach(d => {
      const btn = document.getElementById('ex-dim-' + d);
      if (btn) btn.classList.toggle('active', d === 'integration');
    });
    const vt = document.getElementById('ex-view-toggle');
    if (vt) vt.style.display = '';
    renderSidebarList(filtered);
    updateCounter(filtered.length, integrations.length);
    updateSidebarHeader();
    navigateTo(idx, 'root');
  }

  // ── Vista grafo ──────────────────────────────────────────
  function switchView(v) {
    currentView = v;
    const listView  = document.getElementById('ex-list-view');
    const graphView = document.getElementById('ex-graph-view');
    const btnList   = document.getElementById('ex-view-list');
    const btnGraph  = document.getElementById('ex-view-graph');
    if (!listView || !graphView) return;

    listView.style.display  = v === 'list'  ? '' : 'none';
    const graphWrap = document.getElementById('ex-graph-wrap');
    if (graphWrap) graphWrap.style.display = v === 'graph' ? '' : 'none';
    if (btnList)  btnList.classList.toggle('active',  v === 'list');
    if (btnGraph) btnGraph.classList.toggle('active', v === 'graph');

    if (v === 'graph') renderGraph();
  }

  // vis-network 10.x renderiza title como texto plano cuando es string;
  // hay que pasar un elemento DOM para HTML en tooltips.
  function makeTooltip(lines) {
    const d = document.createElement('div');
    d.style.cssText = 'padding:6px 10px;font-size:12px;line-height:1.7;background:#0f1829;color:#dce6f5;border:1px solid #243350;border-radius:6px;max-width:280px;';
    d.innerHTML = lines.map(l => `<div>${l}</div>`).join('');
    return d;
  }

  function renderGraph() {
    const container = document.getElementById('ex-graph-view');
    if (!container || typeof vis === 'undefined') return;

    if (visNetwork) { visNetwork.destroy(); visNetwork = null; }

    const typeColors = { MD: '#F7A800', KF: '#29ABE2', FILE: '#E8622A' };

    const visibleInts  = computeBaseFiltered();
    const visibleIdxSet = new Set(visibleInts.map(p => p._idx));

    const nodes = new vis.DataSet(visibleInts.map(p => {
      const rawLabel = p.dataflowName || p.jobName || '';
      // Partir en dos líneas si es largo (vis-network respeta \n en label)
      const label = rawLabel.length > 30
        ? rawLabel.slice(0, 30).replace(/[_\s](?=[^_\s]*$)/, '\n') || rawLabel.slice(0, 15) + '\n' + rawLabel.slice(15, 30) + '…'
        : rawLabel;
      const col = typeColors[p.tipoIntegracion] || '#7d9abf';
      return {
        id:    p._idx,
        label,
        title: makeTooltip([
          `<b>${escH(p.dataflowName || p.jobName)}</b>`,
          p.dataflowName && p.jobName !== p.dataflowName ? `${escH(I18n.t('ex.label.job'))}: ${escH(p.jobName)}` : '',
          `${escH(p.srcDSName || '?')} → ${escH(p.dstDSName || '?')}`,
          `${escH(I18n.t('ex.label.target'))}: <b>${escH(p.targetTable)}</b>`,
          `${escH(I18n.t('ex.label.zip'))}: ${escH(p._zipName)}`,
        ].filter(Boolean)),
        color: { background: col, border: col, highlight: { background: '#fff', border: col } },
        font:  { color: '#000', size: 12, multi: false },
        shape: 'box',
        margin: 8
      };
    }));

    const edgeStyle = {
      table:  { color: '#34d399', dashes: false,      width: 2   },
      file:   { color: '#E8622A', dashes: [6, 4],     width: 1.5 },
      lookup: { color: '#a78bfa', dashes: [2, 3, 8, 3], width: 1.5 },
    };

    const edges = new vis.DataSet(chainEdges.filter(e => visibleIdxSet.has(e.from) && visibleIdxSet.has(e.to)).map((e, i) => {
      const st = edgeStyle[e.via] || edgeStyle.table;
      return {
        id:     i,
        from:   e.from,
        to:     e.to,
        label:  e.label && e.label.length > 24 ? e.label.slice(0, 22) + '…' : (e.label || ''),
        title:  makeTooltip([`${escH(I18n.t('ex.tooltip.type'))} <b>${escH(e.via)}</b>`, `${escH(I18n.t('ex.tooltip.via'))} ${escH(e.label)}`]),
        arrows: 'to',
        dashes: st.dashes,
        color:  { color: st.color, highlight: '#fff' },
        font:   { size: 10, color: '#9db4d0', align: 'middle' },
        width:  st.width
      };
    }));

    const options = {
      layout: chainEdges.length > 0
        ? { hierarchical: { direction: 'LR', sortMethod: 'directed', levelSeparation: 260, nodeSpacing: 130 } }
        : { randomSeed: 42 },
      physics: false,
      interaction: { hover: true, tooltipDelay: 100 },
      nodes: { borderWidth: 1, borderWidthSelected: 2 },
      edges: { smooth: { type: 'curvedCW', roundness: 0.15 } }
    };

    visNetwork = new vis.Network(container, { nodes, edges }, options);

    visNetwork.on('click', params => {
      if (params.nodes.length) {
        switchView('list');
        navigateTo(params.nodes[0], 'root');
      }
    });
  }

  // ── Resizer panel izquierdo ──────────────────────────────
  function initMasterResizer() {
    const resizer = document.getElementById('ex-resizer');
    const split   = document.getElementById('ex-list-view');
    const master  = document.getElementById('ex-master-col') || document.getElementById('ex-master');
    if (!resizer || !split || !master) return;

    const startDrag = (startX) => {
      resizer.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      const startW = master.offsetWidth;

      const onMove = (clientX) => {
        const newW = Math.max(160, Math.min(Math.floor(split.offsetWidth * 0.65), startW + (clientX - startX)));
        split.style.setProperty('--ex-master-w', newW + 'px');
      };
      const endDrag = () => {
        resizer.classList.remove('dragging');
        document.body.style.cursor = '';
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup',   endDrag);
        document.removeEventListener('touchmove', onTouchMove);
        document.removeEventListener('touchend',  endDrag);
      };
      const onMouseMove = (e) => onMove(e.clientX);
      const onTouchMove = (e) => { if (e.touches[0]) { onMove(e.touches[0].clientX); e.preventDefault(); } };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup',   endDrag);
      document.addEventListener('touchmove', onTouchMove, { passive: false });
      document.addEventListener('touchend',  endDrag);
    };

    resizer.addEventListener('mousedown',  (e) => { e.preventDefault(); startDrag(e.clientX); });
    resizer.addEventListener('touchstart', (e) => { if (e.touches[0]) { e.preventDefault(); startDrag(e.touches[0].clientX); } }, { passive: false });
  }

  function toggleUploadPanel() {
    const panel = document.getElementById('ex-upload-panel');
    if (panel) panel.classList.toggle('collapsed');
  }

  // ── Init ─────────────────────────────────────────────────
  function init() {
    initDropZone();
    initMasterResizer();
    I18n.ready.then(() => { renderCidsBar(); renderIbpBar(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeCidsModal(); closeIbpModal(); _closeHelpPopovers(); }
    });
  }

  // Re-render del Integration Explorer al cambiar idioma.
  // Reconstruye barras CI-DS/IBP, filtro PA, lista master/dim, contador y detalle activo.
  document.addEventListener('i18n:change', function () {
    try {
      if (!integrations || !integrations.length) return;
      renderCidsBar();
      renderIbpBar();
      renderPlanAreaFilter();
      renderDSFilter();
      const q = (document.getElementById('ex-search') || {}).value || '';
      if (currentDim === 'integration') {
        applySearch(q);
        if (selectedIdx !== null) renderDetail(selectedIdx);
      } else {
        renderMasterForDim(currentDim, q);
        if (selectedDimKey !== null) renderDetailDimByKey(selectedDimKey, currentDim);
      }
    } catch (e) { console.warn('[explorer i18n re-render]', e); }
  });

  // ── API pública ──────────────────────────────────────────
  return {
    analyze,
    removeFile,
    renderDetail,
    navigateTo,
    navBack,
    navHome,
    applySearch,
    switchView,
    switchDimension,
    handleDimItemClick,
    goToIntegration,
    copySidebarList,
    copyDimDetailList,
    togglePA,
    toggleSrcDS,
    toggleDstDS,
    openCidsModal,
    closeCidsModal,
    submitCidsConnect,
    cidsDisconnect,
    togglePromoted,
    openIbpModal,
    closeIbpModal,
    submitIbpConnect,
    ibpDisconnect,
    toggleIbpOnly,
    toggleHelpPopover,
    renderDataflowDiagram,
    renderDataflowNodeDetail,
    openDataflowFullscreen,
    closeDataflowFullscreen,
    toggleUploadPanel,
    init
  };

})();

window.Explorer = Explorer;
document.addEventListener('DOMContentLoaded', () => Explorer.init());
