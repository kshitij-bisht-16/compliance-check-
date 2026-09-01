(function () {
  var fileInput = document.getElementById('file-input');
  var uploadBox = document.getElementById('upload-box');
  var preview = document.getElementById('preview');
  var runBtn = document.getElementById('run-btn');
  var statusEl = document.getElementById('status');
  var resultsSection = document.getElementById('results-section');
  var roomsTable = document.getElementById('rooms-table');
  var infoCards = document.getElementById('info-cards');
  var confidenceNote = document.getElementById('confidence-note');
  var rawToggle = document.getElementById('toggle-raw');
  var rawOutput = document.getElementById('raw-output');
  var authorityNote = document.getElementById('authority-note');
  var complyBtn = document.getElementById('comply-btn');
  var complianceTable = document.getElementById('compliance-table');
  var promptBox = document.getElementById('prompt-box');
  var copyPromptBtn = document.getElementById('copy-prompt');
  var pasteBox = document.getElementById('paste-box');
  var loadPastedBtn = document.getElementById('load-pasted');

  var inputs = {
    plotw: document.getElementById('in-plotw'),
    plotd: document.getElementById('in-plotd'),
    plot: document.getElementById('in-plot'),
    floors: document.getElementById('in-floors'),
    footprint: document.getElementById('in-footprint'),
    units: document.getElementById('in-units'),
    front: document.getElementById('in-front'),
    rear: document.getElementById('in-rear'),
    side: document.getElementById('in-side'),
    height: document.getElementById('in-height'),
    road: document.getElementById('in-road'),
    parking: document.getElementById('in-parking')
  };

  var genSheetBtn = document.getElementById('gen-sheet-btn');
  var printSheetBtn = document.getElementById('print-sheet-btn');
  var sheetStatus = document.getElementById('sheet-status');
  var sheetWrap = document.getElementById('sheet-wrap');
  var metaProject = document.getElementById('meta-project');
  var metaSheet = document.getElementById('meta-sheet');
  var metaBy = document.getElementById('meta-by');

  var selectedFile = null;
  var uploadedImage = null; // data URL of the uploaded drawing, saved with the project
  var lastExtraction = null;
  var massingBlocks = null; // optional extracted footprint blocks for complex 3D massing

  // Theme toggle — the early inline script already set data-theme to avoid a flash.
  var themeToggle = document.getElementById('theme-toggle');
  function syncThemeLabel() {
    var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    themeToggle.textContent = isDark ? 'Light' : 'Dark';
  }
  themeToggle.addEventListener('click', function () {
    var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.classList.add('theme-switching');
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('dfi-theme', next); } catch (e) {}
    syncThemeLabel();
    // Drop the suppression after the swap has painted.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { document.documentElement.classList.remove('theme-switching'); });
    });
  });
  syncThemeLabel();

  // ---- Toast notifications ----
  var toastHost = document.getElementById('toast-host');
  function toast(msg, type) {
    if (!toastHost) return;
    var el = document.createElement('div');
    el.className = 'toast' + (type ? ' ' + type : '');
    var mark = type === 'ok' ? '✓' : type === 'err' ? '!' : '›';
    el.innerHTML = '<span class="ti">' + mark + '</span><span>' + escapeHtml(msg) + '</span>';
    toastHost.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('show'); });
    setTimeout(function () {
      el.classList.remove('show');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 240);
    }, type === 'err' ? 4200 : 2600);
  }

  // ---- Worked sample project (dimensioned G+1 row house) ----
  // Lets the whole pipeline run with no image and no API credit — the fastest way
  // to see extraction → compliance → 3D → draft sheet end to end.
  function sampleProject() {
    function R(x0, y0, x1, y1) { return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]; }
    var ground = [
      { label: 'Bedroom', level: 0, approx_area_sqm: 12, polygon_m: R(0, 0, 3.5, 3.66) },
      { label: 'Wash Area', level: 0, approx_area_sqm: 3, polygon_m: R(3.5, 0, 5.79, 1.5) },
      { label: 'Kitchen', level: 0, approx_area_sqm: 8, polygon_m: R(3.5, 1.5, 5.79, 5.34) },
      { label: 'Toilet', level: 0, approx_area_sqm: 3, polygon_m: R(0, 3.66, 1.83, 5.34) },
      { label: 'Wide Entrance', level: 0, approx_area_sqm: 2, polygon_m: R(1.83, 3.66, 3.5, 5.34) },
      { label: 'Stair / Hall', level: 0, approx_area_sqm: 11, polygon_m: R(0, 5.34, 3.5, 8.5) },
      { label: 'Passage', level: 0, approx_area_sqm: 7, polygon_m: R(3.5, 5.34, 5.79, 8.5) },
      { label: 'Living Room', level: 0, approx_area_sqm: 16, polygon_m: R(0, 8.5, 4.0, 12.57) },
      { label: 'Puja', level: 0, approx_area_sqm: 3, polygon_m: R(4.0, 8.5, 5.79, 10.6) },
      { label: 'Open / Passage', level: 0, approx_area_sqm: 3, polygon_m: R(4.0, 10.6, 5.79, 12.57) },
      { label: 'Parking', level: 0, approx_area_sqm: 15, polygon_m: R(0, 12.57, 5.79, 15.24) }
    ];
    var first = [
      { label: 'Dress', level: 1, approx_area_sqm: 2, polygon_m: R(0, 0, 1.5, 1.55) },
      { label: 'Toilet', level: 1, approx_area_sqm: 2, polygon_m: R(1.5, 0, 3.3, 1.55) },
      { label: 'Wash Area', level: 1, approx_area_sqm: 3, polygon_m: R(3.3, 0, 5.79, 1.55) },
      { label: 'Master Bedroom', level: 1, approx_area_sqm: 22, polygon_m: R(0, 1.55, 5.79, 5.5) },
      { label: 'Stair', level: 1, approx_area_sqm: 10, polygon_m: R(0, 5.5, 3.3, 8.6) },
      { label: 'Lobby', level: 1, approx_area_sqm: 7, polygon_m: R(3.3, 5.5, 5.79, 8.6) },
      { label: 'Toilet 2', level: 1, approx_area_sqm: 2, polygon_m: R(0, 8.6, 2.0, 9.8) },
      { label: 'Dress 2', level: 1, approx_area_sqm: 2, polygon_m: R(2.0, 8.6, 4.2, 9.8) },
      { label: 'Wide Passage', level: 1, approx_area_sqm: 7, polygon_m: R(4.2, 8.6, 5.79, 13.46) },
      { label: 'Bedroom 2', level: 1, approx_area_sqm: 15, polygon_m: R(0, 9.8, 4.2, 13.46) },
      { label: 'Balcony', level: 1, approx_area_sqm: 10, polygon_m: R(0, 13.46, 5.79, 15.24) }
    ];
    return {
      typology_guess: 'Row house G+1',
      dimensions_present: true,
      plot: { width_m: 5.79, depth_m: 15.24, area_sqm: 88 },
      setbacks_m: { front: 0, rear: 0, side: 0 },
      building_height_m: 6.1,
      floor_count: 2,
      rooms: ground.concat(first),
      total_footprint_sqm_estimate: 88,
      unit_count_estimate: 1,
      confidence_notes: 'Sample project — a dimensioned 19′×50′ G+1 row house, loaded for demonstration (not read from an uploaded image).'
    };
  }

  var sampleBtn = document.getElementById('sample-btn');
  if (sampleBtn) sampleBtn.addEventListener('click', function () {
    var d = sampleProject();
    rawOutput.textContent = JSON.stringify(d, null, 2);
    renderExtraction(d);
    if (metaProject && !metaProject.value) metaProject.value = 'Sample · G+1 Row House';
    setStatus('Sample project loaded.', false);
    toast('Sample loaded — continue to Compliance check', 'ok');
    refreshSteps();
  });

  // Stepper — guided but not locked: steps are clickable so you can jump back to tweak inputs.
  var stepBtns = Array.prototype.slice.call(document.querySelectorAll('.step-btn'));
  var stepPanels = Array.prototype.slice.call(document.querySelectorAll('.panel.step'));
  var stepPrev = document.getElementById('step-prev');
  var stepNext = document.getElementById('step-next');
  var stepPos = document.getElementById('step-pos');
  var totalSteps = stepPanels.length;
  var currentStep = 1;
  var stepDone = { 1: false, 2: false, 3: false };

  // Reflect real progress (not just position): a green tick on completed steps,
  // and a gentle pulse on "Next" once the current step has produced its output.
  function refreshSteps() {
    stepBtns.forEach(function (b, i) { b.classList.toggle('complete', !!stepDone[i + 1]); });
    var ready = !!stepDone[currentStep] && currentStep < totalSteps;
    stepNext.classList.toggle('step-next-ready', ready);
  }
  function markStep(n, done) { stepDone[n] = !!done; refreshSteps(); }

  function goToStep(n, opts) {
    currentStep = Math.max(1, Math.min(totalSteps, n));
    stepPanels.forEach(function (p, i) { p.classList.toggle('active', i + 1 === currentStep); });
    stepBtns.forEach(function (b, i) {
      b.classList.toggle('active', i + 1 === currentStep);
      b.classList.toggle('done', i + 1 < currentStep);
      if (i + 1 === currentStep) b.setAttribute('aria-current', 'step');
      else b.removeAttribute('aria-current');
    });
    stepPrev.disabled = currentStep === 1;
    stepNext.disabled = currentStep === totalSteps;
    stepNext.textContent = currentStep === totalSteps ? 'Done' : 'Next →';
    stepPos.textContent = 'Step ' + currentStep + ' of ' + totalSteps;
    if (currentStep === 2 && typeof renderDiagram === 'function') renderDiagram();
    refreshSteps();
    if (!(opts && opts.silent)) {
      var top = document.getElementById('stepper');
      if (top && top.getBoundingClientRect().top < 0) top.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  stepBtns.forEach(function (b) {
    b.addEventListener('click', function () { goToStep(parseInt(b.getAttribute('data-step'), 10)); });
  });
  stepPrev.addEventListener('click', function () { goToStep(currentStep - 1); });
  stepNext.addEventListener('click', function () { goToStep(currentStep + 1); });
  goToStep(1, { silent: true });

  fetch('/api/bylaw-config')
    .then(function (r) { return r.json(); })
    .then(function (cfg) {
      authorityNote.textContent = 'Bylaw source: ' + cfg.authority;
    })
    .catch(function () {});

  var extractionPrompt = '';
  fetch('/api/extraction-prompt')
    .then(function (r) { return r.json(); })
    .then(function (p) {
      extractionPrompt = p.prompt || '';
      promptBox.textContent = extractionPrompt;
    })
    .catch(function () { promptBox.textContent = 'Could not load prompt.'; });

  copyPromptBtn.addEventListener('click', function () {
    if (!extractionPrompt) return;
    navigator.clipboard.writeText(extractionPrompt).then(function () {
      copyPromptBtn.textContent = 'Copied ✓';
      setTimeout(function () { copyPromptBtn.textContent = 'Copy prompt'; }, 1500);
    });
  });

  loadPastedBtn.addEventListener('click', function () {
    var raw = (pasteBox.value || '').trim();
    if (!raw) { setStatus('Paste the model reply first.', true); return; }
    setStatus('Parsing pasted output…', false);
    fetch('/api/parse-extraction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: raw })
    })
      .then(function (r) { return r.json(); })
      .then(function (payload) {
        rawOutput.textContent = payload.raw || '';
        if (payload.error || !payload.data) {
          setStatus(payload.error || 'Could not parse pasted output.', true);
          resultsSection.hidden = false;
          rawOutput.style.display = 'block';
          rawOutput.hidden = false;
          rawToggle.textContent = 'Hide raw model output';
          roomsTable.innerHTML = '<tr><td>Pasted text was not valid JSON.</td></tr>';
          infoCards.innerHTML = '';
          confidenceNote.textContent = '';
          return;
        }
        renderExtraction(payload.data);
        setStatus('Loaded from pasted output.', false);
      })
      .catch(function (err) { setStatus('Parse failed: ' + err.message, true); });
  });

  fileInput.addEventListener('change', function (e) {
    var file = e.target.files[0];
    if (!file) return;
    selectedFile = file;
    var reader = new FileReader();
    reader.onload = function () {
      uploadedImage = reader.result;
      preview.src = reader.result;
      preview.style.display = 'block';
      uploadBox.classList.add('has-file');
      runBtn.disabled = false;
      setStatus('');
      scheduleSave(); // persist the uploaded drawing with the project
    };
    reader.readAsDataURL(file);
  });

  rawToggle.addEventListener('click', function () {
    var showing = rawOutput.style.display === 'block';
    rawOutput.style.display = showing ? 'none' : 'block';
    rawOutput.hidden = showing;
    rawToggle.textContent = showing ? 'Show raw model output' : 'Hide raw model output';
  });

  runBtn.addEventListener('click', function () {
    if (!selectedFile) return;
    if (window.__guestMode) { toast('AI extraction needs an account — sign in to use it. The demo loads a ready-made sample instead.', 'err'); setStatus('Sign in to run AI extraction (protects the demo’s API usage). Use “Load sample project” to continue.', true); return; }
    runBtn.disabled = true;
    showExtractionLoading();
    setStatus('Sending image to Claude for extraction…', false);

    var formData = new FormData();
    formData.append('image', selectedFile);

    fetch('/api/extract', { method: 'POST', body: formData })
      .then(function (res) { return res.json().then(function (body) { return { ok: res.ok, body: body }; }); })
      .then(function (result) {
        runBtn.disabled = false;
        if (!result.ok) {
          setStatus(result.body.error || 'Extraction failed.', true);
          return;
        }
        var payload = result.body;
        rawOutput.textContent = payload.raw || '';
        if (payload.error || !payload.data) {
          setStatus('Model responded, but not in the expected format — see raw output below.', true);
          resultsSection.hidden = false;
          rawOutput.style.display = 'block';
          rawOutput.hidden = false;
          rawToggle.textContent = 'Hide raw model output';
          roomsTable.innerHTML = '<tr><td>Could not parse structured data this time.</td></tr>';
          infoCards.innerHTML = '';
          confidenceNote.textContent = '';
          return;
        }
        renderExtraction(payload.data);
        setStatus('Done.', false);
      })
      .catch(function (err) {
        runBtn.disabled = false;
        setStatus('Request failed: ' + err.message, true);
      });
  });

  // Shimmer placeholder while the model call is in flight.
  function showExtractionLoading() {
    resultsSection.hidden = false;
    roomsTable.innerHTML = '<tbody><tr><td><div class="skeleton-block"><div class="sk"></div><div class="sk"></div><div class="sk"></div><div class="sk"></div></div></td></tr></tbody>';
    infoCards.innerHTML = '<div class="skeleton-block" style="flex:1"><div class="sk wide"></div></div><div class="skeleton-block" style="flex:1"><div class="sk wide"></div></div><div class="skeleton-block" style="flex:1"><div class="sk wide"></div></div>';
    confidenceNote.textContent = '';
  }

  function renderExtraction(d) {
    lastExtraction = d;
    massingBlocks = Array.isArray(d.massing_blocks) && d.massing_blocks.length ? d.massing_blocks : null;
    resultsSection.hidden = false;
    var rows = (d.rooms || [])
      .map(function (r) {
        return (
          '<tr><td>' + escapeHtml(r.label || '—') + '</td><td class="num">' +
          (r.approx_area_sqm != null ? r.approx_area_sqm + ' sq.m' : '—') + '</td></tr>'
        );
      })
      .join('');
    roomsTable.innerHTML =
      '<thead><tr><th>Room / space</th><th class="num">Approx. area</th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="2">No individual rooms identified.</td></tr>') +
      '</tbody>';

    var dimBadge = d.dimensions_present === false
      ? '<span class="dim-badge unscaled">Unscaled — areas unreliable</span>'
      : d.dimensions_present === true
        ? '<span class="dim-badge scaled">Dimensioned</span>'
        : '';
    infoCards.innerHTML =
      infoCard('Typology guess', d.typology_guess) +
      infoCard('Footprint estimate', d.total_footprint_sqm_estimate != null ? d.total_footprint_sqm_estimate + ' sq.m' : '—') +
      infoCard('Units estimate', d.unit_count_estimate != null ? d.unit_count_estimate : '—') +
      (dimBadge ? '<div class="card">' + dimBadge + '</div>' : '');

    confidenceNote.textContent = d.confidence_notes || '';

    // Pre-fill everything the extraction actually read — including the values the
    // compliance check hinges on (setbacks, plot, height), when the drawing gave them.
    var plot = d.plot || {};
    var sb = d.setbacks_m || {};
    prefill(inputs.footprint, d.total_footprint_sqm_estimate);
    prefill(inputs.units, d.unit_count_estimate);
    prefill(inputs.plotw, plot.width_m);
    prefill(inputs.plotd, plot.depth_m);
    if (plot.width_m == null && plot.depth_m == null) prefill(inputs.plot, plot.area_sqm);
    prefill(inputs.front, sb.front);
    prefill(inputs.rear, sb.rear);
    prefill(inputs.side, sb.side);
    prefill(inputs.height, d.building_height_m);
    prefill(inputs.floors, d.floor_count);
    markStep(1, true);
    scheduleSave();
  }

  function prefill(el, val) {
    if (val != null && el) { el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); }
  }

  function infoCard(label, value) {
    return (
      '<div class="card"><div class="k">' + escapeHtml(label) + '</div><div class="v">' +
      escapeHtml(String(value == null ? '—' : value)) + '</div></div>'
    );
  }

  // ---- Compliance + live schematic editor ----
  var resolveSvg = document.getElementById('resolve-svg');
  var webglCanvas = document.getElementById('webgl-canvas');
  var use3DWebGL = true; // GPU-shaded 3D when three.js is available, else SVG fallback
  var resolveHint = document.getElementById('resolve-hint');
  var resolveTag = document.getElementById('resolve-tag');
  var complyStatus = document.getElementById('comply-status');
  var lastChecks = [];
  var view = null; // px↔metre transform for drag mapping
  var complyTimer = null;

  // 2D (editable plan) ↔ 3D (massing preview) toggle.
  var viewMode = '2d';
  var rot3d = -0.6;    // yaw (spin around vertical axis), radians
  var tilt3d = 0.62;   // pitch (tilt up/down), radians
  var spin3d = false, spinRAF = null, lastSpinT = 0;
  var showInterior = false;
  var viewToggle = document.getElementById('view-toggle');
  var viewportWrap = document.getElementById('viewport-wrap');
  var spinBtn = document.getElementById('spin-btn');
  var interiorBtn = document.getElementById('interior-btn');
  viewToggle.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-view]');
    if (!b) return;
    viewMode = b.getAttribute('data-view'); // '2d' | '3d' | 'both'
    Array.prototype.forEach.call(viewToggle.querySelectorAll('button'), function (x) {
      x.classList.toggle('active', x === b);
    });
    if (viewMode === '2d') { spin3d = false; spinBtn.classList.remove('active'); }
    renderDiagram(); // renderDiagram handles spin/skel visibility per view
  });

  var skel3d = false;
  var skelBtn = document.getElementById('skel-btn');
  skelBtn.addEventListener('click', function () {
    skel3d = !skel3d;
    skelBtn.classList.toggle('active', skel3d);
    if (window.DFI3D && window.DFI3D.ready) window.DFI3D.setSkeleton(skel3d);
  });

  // Hand (pan) tool — drag moves the view instead of orbiting.
  var pan3d = false;
  var handBtn = document.getElementById('hand-btn');
  handBtn.addEventListener('click', function () {
    pan3d = !pan3d;
    handBtn.classList.toggle('active', pan3d);
    if (window.DFI3D && window.DFI3D.ready) window.DFI3D.setPanMode(pan3d);
    if (webglCanvas) webglCanvas.style.cursor = pan3d ? 'grab' : '';
  });

  interiorBtn.addEventListener('click', function () {
    showInterior = !showInterior;
    interiorBtn.classList.toggle('active', showInterior);
    renderDiagram();
  });

  // Re-render the diagram on viewport resize so it keeps using the full width.
  var diagResizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(diagResizeTimer);
    diagResizeTimer = setTimeout(function () { renderDiagram(); }, 150);
  });

  var currentFloor = 0;
  var stackFloors = false; // in "All" view: stack storeys vertically vs. lay them side by side
  var floorBtn = document.getElementById('floor-btn');
  var stackBtn = document.getElementById('stack-btn');
  var floorGroup = document.getElementById('tbg-floor');
  stackBtn.addEventListener('click', function () {
    stackFloors = !stackFloors;
    stackBtn.classList.toggle('active', stackFloors);
    renderDiagram();
  });
  function setFloorLabel(txt) { var s = floorBtn.querySelector('span'); if (s) s.textContent = txt; else floorBtn.textContent = txt; }
  // Hide a toolbar group whose every button is hidden (avoids empty bordered pills).
  function refreshToolbarGroups() {
    Array.prototype.forEach.call(document.querySelectorAll('.viewer-toolbar .tb-group:not(.view-toggle)'), function (g) {
      var btns = g.querySelectorAll('.tb-btn');
      var allHidden = Array.prototype.every.call(btns, function (b) { return b.hidden; });
      g.hidden = allHidden;
    });
  }
  floorBtn.addEventListener('click', function () {
    var seq = roomLevels().concat(['all']); // …G, 1F, …, All
    var i = seq.indexOf(currentFloor);
    currentFloor = seq[(i + 1) % seq.length];
    setFloorLabel('Floor: ' + floorLabel(currentFloor));
    renderDiagram();
  });

  function roomList() {
    var d = lastExtraction;
    if (!d || !Array.isArray(d.rooms)) return [];
    return d.rooms.filter(function (r) { return r && r.approx_area_sqm > 0; })
      .map(function (r) { return { label: r.label || 'room', area: r.approx_area_sqm, level: r.level || 0 }; });
  }

  // Real drawn room polygons (metres, plot frame) when the extraction provides them —
  // this is the faithful layout. Returns null unless ≥2 rooms have valid polygons.
  function roomPolys() {
    var d = lastExtraction;
    if (!d || !Array.isArray(d.rooms)) return null;
    var out = d.rooms.filter(function (r) { return r && Array.isArray(r.polygon_m) && r.polygon_m.length >= 3; })
      .map(function (r) { return { label: r.label || 'room', poly: r.polygon_m, area: r.approx_area_sqm, level: r.level || 0 }; });
    return out.length >= 2 ? out : null;
  }

  // Distinct floor levels present in the extraction (sorted).
  function roomLevels() {
    var src = roomPolys() || roomList();
    var set = {}; src.forEach(function (r) { set[r.level || 0] = 1; });
    return Object.keys(set).map(Number).sort(function (a, b) { return a - b; });
  }
  function floorLabel(l) { return l === 'all' ? 'All' : (l === 0 ? 'G' : l + 'F'); }
  function floorName(l) { return l === 0 ? 'Ground Floor' : (l === 1 ? 'First Floor' : l + 'th Floor'); }

  function renderDiagram() {
    var wants2D = viewMode === '2d' || viewMode === 'both';
    var wants3D = viewMode === '3d' || viewMode === 'both';
    // Toggle the side-by-side split first so the panes have their real widths
    // before sizeDiagram() measures the 2D host.
    viewportWrap.classList.toggle('split', viewMode === 'both');
    if (typeof sizeDiagram === 'function') sizeDiagram();
    var canInterior = !!roomPolys() || roomList().length >= 2;
    interiorBtn.hidden = !canInterior;
    if (!canInterior && showInterior) { showInterior = false; interiorBtn.classList.remove('active'); }
    var levels = roomLevels();
    // Floor switcher for any multi-floor interior (2D or 3D): G / 1F / All.
    floorBtn.hidden = !(canInterior && showInterior && levels.length > 1);
    // Stack toggle only matters when several floors are shown together ("All").
    stackBtn.hidden = !(canInterior && showInterior && levels.length > 1 && currentFloor === 'all');
    stackBtn.classList.toggle('active', stackFloors);
    spinBtn.hidden = !wants3D;
    skelBtn.hidden = !wants3D || !(window.DFI3D && window.DFI3D.ready);
    handBtn.hidden = !wants3D || !(window.DFI3D && window.DFI3D.ready);
    handBtn.classList.toggle('active', pan3d);
    refreshToolbarGroups();
    if (currentFloor !== 'all' && levels.indexOf(currentFloor) < 0) currentFloor = levels[0] || 0;
    setFloorLabel('Floor: ' + floorLabel(currentFloor));
    // Visibility: renderDiagram owns the 2D pane; draw3D owns the canvas.
    resolveSvg.style.display = wants2D ? '' : 'none';
    if (!wants3D && webglCanvas) webglCanvas.style.display = 'none';
    resolveSvg.style.cursor = (wants3D && !wants2D) ? 'grab' : '';
    renderLegend();
    if (wants2D) { if (showInterior) drawRooms(); else drawResolve(); }
    if (wants3D) draw3D();
    if (viewMode === 'both') {
      resolveTag.textContent = '· 2D + 3D';
      resolveHint.textContent = 'Left: editable 2D plan · Right: shaded 3D — drag the plan edges to edit, drag the 3D to orbit.';
    }
  }

  // Room-type colour key — shown only in Interior mode, built from the rooms present.
  var legendEl = document.getElementById('room-legend');
  var LEGEND_NAMES = { bed: 'Bedroom', dining: 'Dining', living: 'Living / Hall', kitchen: 'Kitchen', bath: 'Bath / WC', parking: 'Parking', balcony: 'Balcony / Terrace', stair: 'Stair', puja: 'Puja', store: 'Store / Dress', passage: 'Passage / Entry', room: 'Other' };
  function renderLegend() {
    if (!legendEl) return;
    if (!showInterior) { legendEl.hidden = true; legendEl.innerHTML = ''; return; }
    var src = roomPolys() || roomList();
    var seen = {}, items = [];
    src.forEach(function (r) { var st = roomStyle(r.label); if (!seen[st.cat]) { seen[st.cat] = 1; items.push(st); } });
    legendEl.innerHTML = items.map(function (st) {
      return '<span class="lg"><span class="sw" style="background:' + st.fill + '"></span>' + escapeHtml(LEGEND_NAMES[st.cat] || st.cat) + '</span>';
    }).join('');
    legendEl.hidden = items.length === 0;
  }

  spinBtn.addEventListener('click', function () {
    spin3d = !spin3d;
    spinBtn.classList.toggle('active', spin3d);
    if (use3DWebGL && window.DFI3D && window.DFI3D.ready) { window.DFI3D.setAutoRotate(spin3d); return; }
    if (spin3d && !spinRAF) { lastSpinT = 0; spinRAF = requestAnimationFrame(spinTick); }
  });
  function spinTick(t) {
    if (!spin3d || viewMode !== '3d') { spinRAF = null; return; }
    var r = resolveSvg.getBoundingClientRect();
    var onScreen = r.bottom > 0 && r.top < (window.innerHeight || 800);
    if (document.hidden || !onScreen) { lastSpinT = 0; spinRAF = requestAnimationFrame(spinTick); return; }
    if (lastSpinT) rot3d += (t - lastSpinT) * 0.0006; // ~ one turn / ~10s
    lastSpinT = t;
    draw3D();
    spinRAF = requestAnimationFrame(spinTick);
  }

  complyBtn.addEventListener('click', function () { runCompliance(true); });

  // Live re-check + redraw as any planning input changes.
  ['plotw', 'plotd', 'plot', 'floors', 'footprint', 'units', 'front', 'rear', 'side', 'height', 'road', 'parking'].forEach(function (k) {
    inputs[k].addEventListener('input', onEdit);
  });

  function onEdit() {
    renderDiagram();
    clearTimeout(complyTimer);
    complyTimer = setTimeout(function () { runCompliance(false); }, 180);
    scheduleSave();
  }

  function numEl(el) { var n = parseFloat(el && el.value); return isFinite(n) ? n : null; }
  function round1(n) { return Math.round(n * 10) / 10; }

  // If plot width & depth are given, they drive plot area and an envelope-derived
  // footprint (setbacks carve the building out of the plot). Otherwise fall back to
  // a rough square from plot area, for display only.
  function updateDerived() {
    var W = numEl(inputs.plotw), D = numEl(inputs.plotd);
    if (W && D) {
      inputs.plot.value = round1(W * D);
      var side = numEl(inputs.side) || 0, front = numEl(inputs.front) || 0, rear = numEl(inputs.rear) || 0;
      var bW = W - 2 * side, bD = D - front - rear;
      var valid = bW > 0 && bD > 0;
      // Keep footprint honest: no buildable envelope → footprint 0, not a stale value.
      inputs.footprint.value = valid ? round1(bW * bD) : 0;
      var msg = null;
      if (!valid) {
        if (bW <= 0) msg = 'Side setbacks (2 × ' + round1(side) + ' = ' + round1(2 * side) + ' m) leave no width on a ' + round1(W) + ' m plot.';
        else msg = 'Front + rear setbacks (' + round1(front) + ' + ' + round1(rear) + ' = ' + round1(front + rear) + ' m) leave no depth on a ' + round1(D) + ' m plot.';
      }
      return { W: W, D: D, parametric: true, valid: valid, invalidMsg: msg };
    }
    var area = numEl(inputs.plot);
    if (area) { var s = Math.sqrt(area); return { W: s, D: s, parametric: false, valid: true }; }
    return null;
  }

  function runCompliance(manual) {
    var body = readInputs();
    if (manual) { complyStatus.textContent = 'Checking…'; complyStatus.className = 'status'; }
    fetch('/api/comply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
      .then(function (r) { return r.json(); })
      .then(function (result) {
        renderCompliance(result);
        var fails = (result.checks || []).filter(function (c) { return c.status === 'fail'; }).length;
        complyStatus.textContent = fails ? fails + ' to resolve' : 'All clear';
        complyStatus.className = 'status' + (fails ? ' err' : '');
        if (manual) toast(fails ? fails + ' check' + (fails > 1 ? 's' : '') + ' to resolve' : 'All checks pass', fails ? 'err' : 'ok');
      })
      .catch(function (err) {
        complianceTable.innerHTML = '<tr><td>Request failed: ' + escapeHtml(err.message) + '</td></tr>';
      });
  }

  var roomChecksEl = document.getElementById('room-checks');
  function renderCompliance(result) {
    lastChecks = result.checks || [];
    var rows = lastChecks
      .map(function (c) {
        var rowClass = c.status === 'pass' ? 'row-pass' : c.status === 'fail' ? 'row-fail' : 'row-insufficient';
        var statusText = c.status === 'pass' ? '✓ Pass' : c.status === 'fail' ? '✗ Review' : '— Needs data';
        var permissible = c.permissible != null ? c.permissible : '—';
        var proposed = c.proposed != null ? c.proposed : '—';
        var sev = c.severity === 'advisory' ? '<span class="sev advisory">advisory</span>' : '';
        var clause = c.clause ? '<div class="clause">' + escapeHtml(c.clause) + '</div>' : '';
        var reason = (c.status !== 'pass' && c.reason) ? '<div class="reason">' + escapeHtml(c.reason) + '</div>' : '';
        return (
          '<tr class="' + rowClass + '"><td><span class="param-name">' + escapeHtml(c.parameter) + '</span> ' + sev + clause + reason + '</td><td class="num">' +
          escapeHtml(String(permissible)) + '</td><td class="num">' + escapeHtml(String(proposed)) +
          '</td><td class="status">' + statusText + '</td></tr>'
        );
      })
      .join('');
    var road = result.derived && result.derived.road_width_m;
    var cap = '<caption class="tbl-cap">Checked against ' + escapeHtml(result.authority || 'bylaw config') +
      (road ? ' · abutting road ' + road + ' m' : '') + '</caption>';
    complianceTable.innerHTML = cap +
      '<thead><tr><th>Parameter</th><th class="num">Permissible</th><th class="num">Proposed</th><th>Status</th></tr></thead><tbody>' +
      rows + '</tbody>';
    renderRoomChecks(result.roomChecks || []);
    lastComplianceSummary = {
      total: lastChecks.length,
      fails: lastChecks.filter(function (c) { return c.status === 'fail'; }).length,
      needs: lastChecks.filter(function (c) { return c.status === 'insufficient_data'; }).length
    };
    if (lastChecks.length) { markStep(2, true); scheduleSave(); }
    renderDiagram(); // reflect pass/fail edge colours
  }

  // Per-room min area / width table.
  function renderRoomChecks(rc) {
    if (!roomChecksEl) return;
    if (!rc.length) { roomChecksEl.innerHTML = ''; return; }
    var rows = rc.map(function (r) {
      var cls = r.status === 'pass' ? 'row-pass' : r.status === 'fail' ? 'row-fail' : 'row-insufficient';
      var st = r.status === 'pass' ? '✓ Pass' : r.status === 'fail' ? '✗ Review' : '— n/a';
      var fl = roomLevels().length > 1 ? ' <span class="room-lvl">' + escapeHtml(floorLabel(r.level)) + '</span>' : '';
      var area = r.area != null ? r.area + ' m²' : '—';
      var minA = r.minArea != null ? '≥ ' + r.minArea : '—';
      var wid = r.width != null ? r.width + ' m' : '—';
      var minW = r.minWidth != null ? '≥ ' + r.minWidth : '—';
      var iss = r.issues && r.issues.length ? '<div class="reason">' + escapeHtml(r.issues.join(' · ')) + '</div>' : '';
      return '<tr class="' + cls + '"><td>' + escapeHtml(cap1(r.room)) + fl + iss + '</td><td>' + escapeHtml(r.category) +
        '</td><td class="num">' + area + '</td><td class="num">' + minA + '</td><td class="num">' + wid + '</td><td class="num">' + minW +
        '</td><td class="status">' + st + '</td></tr>';
    }).join('');
    roomChecksEl.innerHTML =
      '<h3 class="rc-title">Room-by-room standards</h3>' +
      '<p class="rc-sub">Min area &amp; width per room, from the extracted geometry (bbox width is a proxy). Ventilation needs a window schedule a plan rarely carries.</p>' +
      '<table class="table"><thead><tr><th>Room</th><th>Type</th><th class="num">Area</th><th class="num">Min</th><th class="num">Width</th><th class="num">Min</th><th>Status</th></tr></thead><tbody>' +
      rows + '</tbody></table>';
  }
  function cap1(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }

  var DW = 320, DH = 260, DPAD = 44;

  // Size the diagram to its container so wide viewports get a big canvas,
  // not a 320px island. Called before every render.
  function sizeDiagram() {
    var host = resolveSvg.parentElement; // .resolve-diagram
    var w = (host && host.clientWidth ? host.clientWidth - 30 : 320);
    DW = Math.max(320, Math.min(w, 1400));
    // Tall-narrow plots are height-limited, so give the diagram generous height —
    // the interior plans grow with the window rather than sitting as small islands.
    DH = Math.max(380, Math.min(Math.round(window.innerHeight * 0.74), 980));
  }

  function drawResolve() {
    var geom = updateDerived();
    if (!geom) {
      resolveSvg.innerHTML = '<div class="resolve-empty">Enter plot area — or plot width &amp; depth — to see the editable schematic.</div>';
      resolveTag.textContent = '';
      resolveHint.textContent = '';
      view = null;
      return;
    }
    var W = geom.W, D = geom.D;
    var scale = Math.min((DW - DPAD * 2) / W, (DH - DPAD * 2) / D);
    var pxW = W * scale, pxH = D * scale;
    var ox = (DW - pxW) / 2, oy = (DH - pxH) / 2;
    view = { scale: scale, ox: ox, oy: oy, W: W, D: D, parametric: geom.parametric };

    // Impossible geometry (setbacks exceed the plot): show the plot + a clear
    // warning instead of a misleading sliver, and don't offer drag handles.
    if (geom.parametric && !geom.valid) {
      var sInv = '<svg width="' + DW + '" height="' + DH + '" viewBox="0 0 ' + DW + ' ' + DH + '" xmlns="http://www.w3.org/2000/svg">';
      sInv += '<rect x="' + ox.toFixed(1) + '" y="' + oy.toFixed(1) + '" width="' + pxW.toFixed(1) + '" height="' + pxH.toFixed(1) + '" fill="none" stroke="#a8402e" stroke-dasharray="5 3"/>';
      sInv += txt(DW / 2, oy - 8, 'plot ' + round1(W) + ' × ' + round1(D) + ' m', '#8b8c82', 8);
      sInv += '</svg>';
      resolveSvg.innerHTML = sInv;
      resolveTag.textContent = '· check inputs';
      resolveHint.innerHTML = '<span style="color:#a8402e">' + escapeHtml(geom.invalidMsg || 'Setbacks exceed the plot.') + '</span> Reduce the setbacks or increase the plot size.';
      return;
    }

    var front = numEl(inputs.front) || 0, rear = numEl(inputs.rear) || 0, side = numEl(inputs.side) || 0;
    var bx0 = ox + side * scale, bx1 = ox + pxW - side * scale;
    var by0 = oy + rear * scale, by1 = oy + pxH - front * scale;
    if (bx1 <= bx0) { bx1 = bx0 + 2; }
    if (by1 <= by0) { by1 = by0 + 2; }

    var fail = {};
    lastChecks.forEach(function (c) {
      if (c.status !== 'fail') return;
      if (/front/i.test(c.parameter)) fail.front = 1;
      if (/rear/i.test(c.parameter)) fail.rear = 1;
      if (/side/i.test(c.parameter)) fail.side = 1;
    });
    var OK = '#24406b', BAD = '#a8402e';

    var s = '<svg width="' + DW + '" height="' + DH + '" viewBox="0 0 ' + DW + ' ' + DH + '" xmlns="http://www.w3.org/2000/svg">';
    // plot boundary
    s += '<rect x="' + ox.toFixed(1) + '" y="' + oy.toFixed(1) + '" width="' + pxW.toFixed(1) + '" height="' + pxH.toFixed(1) + '" fill="none" stroke="#b9c6d8" stroke-dasharray="5 3"/>';
    // building
    s += '<rect x="' + bx0.toFixed(1) + '" y="' + by0.toFixed(1) + '" width="' + (bx1 - bx0).toFixed(1) + '" height="' + (by1 - by0).toFixed(1) + '" fill="#eef0f4" stroke="#1d1e1b" stroke-width="1.5"/>';
    // coloured setback edges
    s += edge(bx0, by0, bx1, by0, fail.rear ? BAD : OK); // rear (top)
    s += edge(bx0, by1, bx1, by1, fail.front ? BAD : OK); // front (bottom)
    s += edge(bx0, by0, bx0, by1, fail.side ? BAD : OK); // left
    s += edge(bx1, by0, bx1, by1, fail.side ? BAD : OK); // right
    // labels
    s += txt((bx0 + bx1) / 2, (by0 + by1) / 2 - 4, 'building', '#5e5f57', 9);
    s += txt((bx0 + bx1) / 2, (by0 + by1) / 2 + 9, round1((bx1 - bx0) / scale) + '×' + round1((by1 - by0) / scale) + ' m', '#8b8c82', 8);
    s += txt((ox + pxW / 2), oy - 6, 'rear ' + round1(rear), fail.rear ? BAD : '#8b8c82', 8);
    s += txt((ox + pxW / 2), oy + pxH + 12, 'front ' + round1(front) + ' (road)', fail.front ? BAD : '#8b8c82', 8);
    s += txt(ox - 4, oy + pxH / 2, 'side ' + round1(side), fail.side ? BAD : '#8b8c82', 8, 'end');
    // drag handles (only when geometry is real, i.e. plot W×D provided)
    if (geom.parametric) {
      s += handle((bx0 + bx1) / 2, by0, 'rear');
      s += handle((bx0 + bx1) / 2, by1, 'front');
      s += handle(bx0, (by0 + by1) / 2, 'side-l');
      s += handle(bx1, (by0 + by1) / 2, 'side-r');
    }
    s += '</svg>';
    resolveSvg.innerHTML = s;

    resolveTag.textContent = geom.parametric ? '· drag to edit' : '· approx';
    resolveHint.textContent = geom.parametric
      ? 'Drag the building edges to change setbacks — footprint, FSI and compliance update live.'
      : 'Enter plot width & depth to drag edges. Numbers still re-check live as you type.';
  }

  // Basic 3D massing: the building footprint extruded to its height on the plot,
  // drawn as a simple axonometric projection (no library). Not editable — 2D is.
  function draw3D() {
    var geom = updateDerived();
    function msg(t) { if (webglCanvas) webglCanvas.style.display = 'none'; resolveTag.textContent = '· 3D massing'; if (viewMode === 'both') return; resolveSvg.style.display = ''; resolveSvg.innerHTML = '<div class="resolve-empty">' + t + '</div>'; resolveHint.textContent = ''; }
    if (!geom) { return msg('Enter plot dimensions to see the 3D massing.'); }
    if (geom.parametric && !geom.valid) { return msg('Fix the plot geometry (setbacks exceed the plot) to see the 3D massing.'); }

    var W = geom.W, D = geom.D;
    var front = numEl(inputs.front) || 0, rear = numEl(inputs.rear) || 0, side = numEl(inputs.side) || 0;
    var floors = numEl(inputs.floors) ? Math.max(1, Math.round(numEl(inputs.floors))) : null;
    var Hm = numEl(inputs.height) || (floors ? floors * 3.2 : null);
    if (!Hm) { return msg('Enter floors or height to extrude the 3D massing.'); }
    var nFloors = floors || Math.max(1, Math.round(Hm / 3.2));

    var bx0 = side, bx1 = W - side, by0 = rear, by1 = D - front;

    // Massing blocks: interior dollhouse (room cells) when interior is on, else
    // extracted polygon blocks, else the single rectangular envelope.
    var blocks = null, interiorBounds = null;
    var interiorOn = showInterior && (roomPolys() || roomList().length >= 2);
    if (interiorOn) {
      var rp = roomPolys(), defs;
      if (rp) defs = rp.map(function (r) { return { poly: r.poly, label: r.label, level: r.level || 0 }; });
      else {
        var ew = (bx1 - bx0), ed = (by1 - by0);
        defs = (ew > 0 && ed > 0) ? roomCells(roomList(), 0, 0, ew, ed).map(function (cc) {
          return { poly: [[bx0 + cc.x0, by0 + cc.y0], [bx0 + cc.x1, by0 + cc.y0], [bx0 + cc.x1, by0 + cc.y1], [bx0 + cc.x0, by0 + cc.y1]], label: cc.label, level: 0 };
        }) : [];
      }
      // Single floor → just that floor. 'All' has two layouts: side-by-side (each an
      // open dollhouse on the ground) or Stacked — storeys raised one above another
      // into a real multi-floor building.
      var single3D = currentFloor !== 'all';
      var stacked3D = !single3D && stackFloors;
      if (single3D) defs = defs.filter(function (d) { return d.level === currentFloor; });
      if (defs.length) {
        var storeyH = Math.min(Hm, 3.4);
        var levelsArr = single3D ? [currentFloor] : roomLevels();
        var gapX = W + Math.max(1.5, W * 0.25);
        function idxOf(lv) { return Math.max(0, levelsArr.indexOf(lv)); }
        function dxOf(lv) { return (single3D || stacked3D) ? 0 : idxOf(lv) * gapX; }
        function zbOf(lv) { return stacked3D ? idxOf(lv) * storeyH : 0; }
        blocks = [];
        var allXs = [], allYs = [];
        defs.forEach(function (rd) {
          var stc = roomStyle(rd.label), dx = dxOf(rd.level), zb = zbOf(rd.level);
          var poly = rd.poly.map(function (p) { return [p[0] + dx, p[1]]; });
          blocks.push({ poly: poly, z0: zb, z1: zb + storeyH, floors: 1, openTop: true, floorFill: stc.fill, cat: stc.cat, isRoom: true });
          furnitureBlocks3D(stc.cat, poly, storeyH).forEach(function (fb) { fb.z0 += zb; fb.z1 += zb; blocks.push(fb); });
          poly.forEach(function (p) { allXs.push(p[0]); allYs.push(p[1]); });
        });
        levelsArr.forEach(function (lv) {
          var dx = dxOf(lv), zb = zbOf(lv);
          blocks.push({ poly: [[bx0 + dx, by0], [bx1 + dx, by0], [bx1 + dx, by1], [bx0 + dx, by1]], z0: zb - 0.14, z1: zb, fill: '#c9c3b7' });
        });
        interiorBounds = { minx: Math.min.apply(0, allXs), maxx: Math.max.apply(0, allXs), miny: Math.min.apply(0, allYs), maxy: Math.max.apply(0, allYs) };
      }
    }
    if (!blocks && massingBlocks) {
      blocks = massingBlocks.map(function (b) {
        var pl = b.polygon_m || b.polygon;
        var z0 = b.base_m != null ? b.base_m : 0;
        var z1 = b.top_m != null ? b.top_m : (b.height_m != null ? z0 + b.height_m : (b.floors != null ? z0 + b.floors * 3.2 : z0 + Hm));
        return { poly: pl, z0: z0, z1: z1, floors: b.floors || Math.max(1, Math.round((z1 - z0) / 3.2)) };
      }).filter(function (b) { return Array.isArray(b.poly) && b.poly.length >= 3 && b.z1 > b.z0; });
      if (!blocks.length) blocks = null;
    }
    if (!blocks) blocks = [{ poly: [[bx0, by0], [bx1, by0], [bx1, by1], [bx0, by1]], z0: 0, z1: Hm, floors: nFloors }];

    // GPU-shaded path: hand the same blocks to three.js (lighting, shadows, orbit).
    if (use3DWebGL && window.DFI3D && window.DFI3D.ready) {
      if (viewMode !== 'both') resolveSvg.style.display = 'none'; // keep the 2D pane in split view
      webglCanvas.style.display = 'block';
      window.DFI3D.resize();
      window.DFI3D.build({ blocks: blocks, W: W, D: D, Hm: Hm, interiorBounds: interiorBounds, interiorOn: interiorOn });
      window.DFI3D.setAutoRotate(spin3d);
      var multiLbl = currentFloor === 'all' && stackFloors ? 'All · Stacked' : floorLabel(currentFloor);
      resolveTag.textContent = (interiorOn ? '· interior (shaded)' : '· 3D (shaded)') + (interiorOn && roomLevels().length > 1 ? ' · ' + multiLbl : '');
      resolveHint.textContent = interiorOn
        ? (currentFloor === 'all' && stackFloors
            ? 'Storeys stacked into one building — drag to orbit, scroll to zoom. Tap Stacked off for side-by-side.'
            : 'GPU-shaded interior — drag to orbit, scroll to zoom.' + (currentFloor === 'all' && roomLevels().length > 1 ? ' Tap Stacked to raise floors one above another.' : ''))
        : 'GPU-shaded massing — drag to orbit, scroll to zoom.';
      return;
    }
    if (webglCanvas) webglCanvas.style.display = 'none';
    // No WebGL → can't render shaded 3D next to the 2D plan; leave the 2D pane alone.
    if (viewMode === 'both') return;
    resolveSvg.style.display = '';

    // Bounds & centre over every vertex (+ plot corners) → bounding-sphere scale.
    var allPts = [[0, 0, 0], [W, 0, 0], [W, D, 0], [0, D, 0]];
    blocks.forEach(function (b) { b.poly.forEach(function (v) { allPts.push([v[0], v[1], b.z0]); allPts.push([v[0], v[1], b.z1]); }); });
    var xs = allPts.map(function (p) { return p[0]; }), ys = allPts.map(function (p) { return p[1]; }), zs = allPts.map(function (p) { return p[2]; });
    var cx = (Math.min.apply(0, xs) + Math.max.apply(0, xs)) / 2, cy = (Math.min.apply(0, ys) + Math.max.apply(0, ys)) / 2, cz = (Math.min.apply(0, zs) + Math.max.apply(0, zs)) / 2;
    var R = 1; allPts.forEach(function (p) { var d = Math.sqrt((p[0] - cx) * (p[0] - cx) + (p[1] - cy) * (p[1] - cy) + (p[2] - cz) * (p[2] - cz)); if (d > R) R = d; });

    // Full orbit: yaw (about vertical Z) then pitch (about horizontal X), orthographic.
    var cyw = Math.cos(rot3d), syw = Math.sin(rot3d), cpt = Math.cos(tilt3d), spt = Math.sin(tilt3d);
    function rot(x, y, z) {
      var px = x - cx, py = y - cy, pz = z - cz;
      var x1 = px * cyw - py * syw, y1 = px * syw + py * cyw, z1 = pz;
      var y2 = y1 * cpt - z1 * spt, z2 = y1 * spt + z1 * cpt;
      return { x: x1, y: y2, z: z2 }; // y = depth, z = up
    }
    function rotN(n) { return rot(n[0] + cx, n[1] + cy, n[2] + cz); }
    var pad = 26, scale = (Math.min(DW, DH) - pad * 2) / (2 * R);
    function S(x, y, z) { var r = rot(x, y, z); return (DW / 2 + r.x * scale).toFixed(1) + ',' + (DH / 2 - r.z * scale).toFixed(1); }
    function poly(coords, fill, stroke, sw) { return '<polygon points="' + coords + '" fill="' + fill + '" stroke="' + (stroke || '#1d1e1b') + '" stroke-width="' + (sw || 1) + '" stroke-linejoin="round"/>'; }
    function fline(a, b) { return '<line x1="' + a.split(',')[0] + '" y1="' + a.split(',')[1] + '" x2="' + b.split(',')[0] + '" y2="' + b.split(',')[1] + '" stroke="#8b8c82" stroke-width="0.6"/>'; }
    function depth(corners) { var d = 0; corners.forEach(function (p) { d += rot(p[0], p[1], p[2]).y; }); return d / corners.length; }

    // Build faces for every block: side quad per edge (+ top/bottom caps), each with
    // an outward normal. Back-face cull, then painter-sort across ALL blocks.
    function edgeExt(a, bb) {
      if (!interiorBounds) return false; var ub = interiorBounds, t = 0.4;
      return (Math.abs(a[0] - ub.minx) < t && Math.abs(bb[0] - ub.minx) < t) || (Math.abs(a[0] - ub.maxx) < t && Math.abs(bb[0] - ub.maxx) < t) ||
        (Math.abs(a[1] - ub.miny) < t && Math.abs(bb[1] - ub.miny) < t) || (Math.abs(a[1] - ub.maxy) < t && Math.abs(bb[1] - ub.maxy) < t);
    }
    var faces = [];
    blocks.forEach(function (b) {
      var pl = b.poly, n = pl.length, ctr = [0, 0];
      pl.forEach(function (v) { ctr[0] += v[0]; ctr[1] += v[1]; }); ctr[0] /= n; ctr[1] /= n;
      var wallFill = b.fill || '#cfd4dc', topFill = b.fill || '#eef0f4';
      var doorIdx = -1, doorLen = -1; // longest interior edge gets a door (rooms only)
      if (b.isRoom) { for (var k = 0; k < n; k++) { var ak = pl[k], bk = pl[(k + 1) % n], ekl = Math.hypot(bk[0] - ak[0], bk[1] - ak[1]); if (!edgeExt(ak, bk) && ekl > 1.0 && ekl > doorLen) { doorLen = ekl; doorIdx = k; } } }
      for (var i = 0; i < n; i++) {
        var a = pl[i], bb = pl[(i + 1) % n], nx = bb[1] - a[1], ny = -(bb[0] - a[0]);
        var mx = (a[0] + bb[0]) / 2, my = (a[1] + bb[1]) / 2;
        if ((mx - ctr[0]) * nx + (my - ctr[1]) * ny < 0) { nx = -nx; ny = -ny; }
        var L = Math.hypot(nx, ny) || 1, nnx = nx / L, nny = ny / L;
        faces.push({ c: [[a[0], a[1], b.z0], [bb[0], bb[1], b.z0], [bb[0], bb[1], b.z1], [a[0], a[1], b.z1]], n: [nnx, nny, 0], fill: wallFill, wall: true, floors: b.floors, z0: b.z0, z1: b.z1 });
        if (b.isRoom) {
          var el = Math.hypot(bb[0] - a[0], bb[1] - a[1]), ux = (bb[0] - a[0]) / (el || 1), uy = (bb[1] - a[1]) / (el || 1), eps = 0.05;
          if (edgeExt(a, bb) && el > 1.0) { // window band on the outer wall (relative to floor base)
            var wh = Math.min(el * 0.32, 0.6), wzl = b.z0 + 1.0, wzh = Math.min(b.z0 + 2.0, b.z1);
            faces.push({ c: [[mx - ux * wh + nnx * eps, my - uy * wh + nny * eps, wzl], [mx + ux * wh + nnx * eps, my + uy * wh + nny * eps, wzl], [mx + ux * wh + nnx * eps, my + uy * wh + nny * eps, wzh], [mx - ux * wh + nnx * eps, my - uy * wh + nny * eps, wzh]], n: [nnx, nny, 0], fill: '#b8d1ea' });
          }
          if (i === doorIdx) { // door leaf on the longest interior wall
            var dh = Math.min(el * 0.45, 0.45), dz0 = b.z0, dzh = Math.min(b.z0 + 2.05, b.z1);
            faces.push({ c: [[mx - ux * dh - nnx * eps, my - uy * dh - nny * eps, dz0], [mx + ux * dh - nnx * eps, my + uy * dh - nny * eps, dz0], [mx + ux * dh - nnx * eps, my + uy * dh - nny * eps, dzh], [mx - ux * dh - nnx * eps, my - uy * dh - nny * eps, dzh]], n: [-nnx, -nny, 0], fill: '#9c6b43' });
          }
        }
      }
      if (!b.openTop) faces.push({ c: pl.map(function (v) { return [v[0], v[1], b.z1]; }), n: [0, 0, 1], fill: topFill });
      faces.push({ c: pl.map(function (v) { return [v[0], v[1], b.z0]; }), n: [0, 0, -1], fill: b.openTop ? (b.floorFill || '#e7e9ee') : (b.fill || '#b7bcc6') });
    });
    var visible = faces.filter(function (f) { return rotN(f.n).y < 0; });
    visible.sort(function (a, b) { return depth(b.c) - depth(a.c); });

    var s = '<svg width="' + DW + '" height="' + DH + '" viewBox="0 0 ' + DW + ' ' + DH + '" xmlns="http://www.w3.org/2000/svg">';
    if (rotN([0, 0, 1]).y < 0) s += poly(S(0, 0, 0) + ' ' + S(W, 0, 0) + ' ' + S(W, D, 0) + ' ' + S(0, D, 0), 'rgba(36,64,107,0.06)', '#b9c6d8', 1);
    visible.forEach(function (f) {
      s += poly(f.c.map(function (p) { return S(p[0], p[1], p[2]); }).join(' '), f.fill, '#1d1e1b', 1);
      if (f.wall) { for (var i = 1; i < f.floors; i++) { var z = f.z0 + (f.z1 - f.z0) * i / f.floors; s += fline(S(f.c[0][0], f.c[0][1], z), S(f.c[1][0], f.c[1][1], z)); } }
    });
    s += '</svg>';
    resolveSvg.innerHTML = s;
    var usingRealPolys = interiorOn && !!roomPolys();
    resolveTag.textContent = interiorOn ? (usingRealPolys ? '· interior' : '· interior (schematic)') : '· 3D massing';
    resolveHint.textContent = interiorOn
      ? (usingRealPolys
          ? 'Interior — ' + blocks.length + ' rooms from the drawn layout. Drag to orbit; toggle Interior off for massing.'
          : 'Interior (schematic) — ' + blocks.length + ' rooms sized by area, not the drawn positions. Drag to orbit; toggle Interior off for massing.')
      : massingBlocks
        ? 'Complex massing — ' + blocks.length + ' block(s). Drag to orbit (↔ spin · ↕ tilt). Switch to 2D to edit.'
        : 'Drag to orbit (↔ spin · ↕ tilt) — footprint ' + round1((bx1 - bx0) * (by1 - by0)) + ' m² extruded to ' + round1(Hm) + ' m (G+' + (nFloors - 1) + '). Switch to 2D to edit.';
  }

  // Squarified-ish treemap: partition a rectangle into room cells proportional to area.
  function roomCells(rooms, x0, y0, x1, y1) {
    function rec(list, a, b, cc, dd) {
      if (list.length === 1) return [{ label: list[0].label, area: list[0].area, x0: a, y0: b, x1: cc, y1: dd }];
      var total = list.reduce(function (s, r) { return s + r.area; }, 0), half = total / 2, acc = 0, i = 0;
      while (i < list.length - 1 && acc + list[i].area < half) { acc += list[i].area; i++; }
      var A = list.slice(0, i + 1), B = list.slice(i + 1);
      var frac = A.reduce(function (s, r) { return s + r.area; }, 0) / total;
      var w = cc - a, h = dd - b;
      if (w >= h) { var xm = a + w * frac; return rec(A, a, b, xm, dd).concat(rec(B, xm, b, cc, dd)); }
      var ym = b + h * frac; return rec(A, a, b, cc, ym).concat(rec(B, a, ym, cc, dd));
    }
    return rec(rooms.slice().sort(function (p, q) { return q.area - p.area; }), x0, y0, x1, y1);
  }

  // 2D interior: real drawn room polygons when available, else a schematic treemap.
  function drawRooms() {
    var rp = roomPolys();
    if (rp) return drawRoomPolys(rp);
    var rooms = roomList().filter(function (r) { return (r.level || 0) === currentFloor; });
    if (rooms.length < 2) {
      resolveSvg.innerHTML = '<div class="resolve-empty">Run an extraction with rooms to see the interior layout.</div>';
      resolveTag.textContent = '· interior'; resolveHint.textContent = '';
      return;
    }
    var geom = updateDerived();
    var bw, bd;
    if (geom && geom.parametric && geom.valid) {
      var side = numEl(inputs.side) || 0, front = numEl(inputs.front) || 0, rear = numEl(inputs.rear) || 0;
      bw = geom.W - 2 * side; bd = geom.D - front - rear;
    }
    if (!(bw > 0 && bd > 0)) { var fp = numEl(inputs.footprint) || rooms.reduce(function (s, r) { return s + r.area; }, 0); bw = Math.sqrt(fp) || 10; bd = (fp / bw) || 10; }
    var pad = 28, scale = Math.min((DW - pad * 2) / bw, (DH - pad * 2) / bd);
    var pw = bw * scale, ph = bd * scale, ox = (DW - pw) / 2, oy = (DH - ph) / 2;
    var cells = roomCells(rooms, 0, 0, bw, bd);
    var s = '<svg width="' + DW + '" height="' + DH + '" viewBox="0 0 ' + DW + ' ' + DH + '" xmlns="http://www.w3.org/2000/svg">';
    s += '<rect x="' + ox.toFixed(1) + '" y="' + oy.toFixed(1) + '" width="' + pw.toFixed(1) + '" height="' + ph.toFixed(1) + '" fill="#f5f7fa" stroke="#1d1e1b" stroke-width="1.5"/>';
    cells.forEach(function (cc) {
      var x = ox + cc.x0 * scale, y = oy + cc.y0 * scale, w = (cc.x1 - cc.x0) * scale, h = (cc.y1 - cc.y0) * scale;
      s += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + h.toFixed(1) + '" fill="#eef0f4" stroke="#5e5f57" stroke-width="1"/>';
      var lbl = cc.label.length > 16 ? cc.label.slice(0, 15) + '…' : cc.label;
      if (w > 34 && h > 20) {
        s += txt(x + w / 2, y + h / 2 - 3, lbl, '#1d1e1b', 8);
        s += txt(x + w / 2, y + h / 2 + 9, round1(cc.area) + ' m²', '#8b8c82', 7);
      }
    });
    s += '</svg>';
    resolveSvg.innerHTML = s;
    resolveTag.textContent = '· interior (schematic)';
    resolveHint.textContent = 'Schematic room layout — rooms sized by extracted area, arranged proportionally. NOT the drawn wall positions. Toggle Interior off for the editable plan.';
  }

  // Colour + furniture category from a room label.
  function roomStyle(label) {
    var l = (label || '').toLowerCase();
    function has() { for (var i = 0; i < arguments.length; i++) if (l.indexOf(arguments[i]) >= 0) return true; return false; }
    if (has('bed', 'master')) return { cat: 'bed', fill: '#e2ece0' };
    if (has('dining')) return { cat: 'dining', fill: '#f1e7d4' };
    if (has('living', 'hall', 'lounge', 'drawing')) return { cat: 'living', fill: '#f1e7d4' };
    if (has('kitchen')) return { cat: 'kitchen', fill: '#fbe5cf' };
    if (has('toilet', 'bath', 'w.c', 'wc', 'wash')) return { cat: 'bath', fill: '#d9e7f2' };
    if (has('park')) return { cat: 'parking', fill: '#e4e4de' };
    if (has('balcon', 'terrace', 'veranda', 'deck', 'sit out', 'sitout')) return { cat: 'balcony', fill: '#d7ece4' };
    if (has('stair', 'steps')) return { cat: 'stair', fill: '#e6e2f0' };
    if (has('puja', 'pooja', 'mandir', 'temple')) return { cat: 'puja', fill: '#f6efca' };
    if (has('dress', 'ward', 'store', 'closet', 'utility')) return { cat: 'store', fill: '#efe0e7' };
    if (has('lobby', 'foyer', 'passage', 'corridor', 'entr')) return { cat: 'passage', fill: '#eceae2' };
    return { cat: 'room', fill: '#eef0f4' };
  }

  var FUR = '#7a7b71'; // furniture line colour
  function fRect(x, y, w, h, fill, sw, rx) { return '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="' + (rx || 0) + '" fill="' + (fill || 'none') + '" stroke="' + FUR + '" stroke-width="' + (sw || 0.7) + '"/>'; }
  function fLine(x1, y1, x2, y2, col, sw) { return '<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '" stroke="' + (col || FUR) + '" stroke-width="' + (sw || 0.6) + '"/>'; }
  function fCirc(cx, cy, r) { return '<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="' + r.toFixed(1) + '" fill="none" stroke="' + FUR + '" stroke-width="0.6"/>'; }
  function fEll(cx, cy, rx, ry) { return '<ellipse cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" rx="' + rx.toFixed(1) + '" ry="' + ry.toFixed(1) + '" fill="#fff" stroke="' + FUR + '" stroke-width="0.6"/>'; }

  // Representative furniture for a room category, fitted to a pixel bbox.
  function furniture(cat, x, y, w, h) {
    if (w < 16 || h < 16) return '';
    var p = Math.min(w, h) * 0.12; x += p; y += p; w -= 2 * p; h -= 2 * p;
    var s = '', horiz = w >= h;
    if (cat === 'bed') {
      s += fRect(x, y, w, h, '#fff', 0.7, 2);
      if (horiz) {
        s += fRect(x, y, w * 0.13, h, '#e7e9ee', 0.6);
        s += fRect(x + w * 0.16, y + h * 0.1, w * 0.12, h * 0.32, '#eef0f4', 0.5, 1);
        s += fRect(x + w * 0.16, y + h * 0.58, w * 0.12, h * 0.32, '#eef0f4', 0.5, 1);
        s += fLine(x + w * 0.5, y, x + w * 0.5, y + h, FUR, 0.5);
      } else {
        s += fRect(x, y, w, h * 0.13, '#e7e9ee', 0.6);
        s += fRect(x + w * 0.1, y + h * 0.16, w * 0.32, h * 0.12, '#eef0f4', 0.5, 1);
        s += fRect(x + w * 0.58, y + h * 0.16, w * 0.32, h * 0.12, '#eef0f4', 0.5, 1);
        s += fLine(x, y + h * 0.5, x + w, y + h * 0.5, FUR, 0.5);
      }
    } else if (cat === 'living') {
      s += fRect(x, y + h * 0.58, w * 0.62, h * 0.34, '#fff', 0.7, 2);
      s += fRect(x, y + h * 0.46, w * 0.62, h * 0.14, '#e7e9ee', 0.6, 1);
      s += fRect(x + w * 0.22, y + h * 0.08, w * 0.3, h * 0.22, '#fff', 0.6, 2);
    } else if (cat === 'dining') {
      s += fEll(x + w / 2, y + h / 2, w * 0.26, h * 0.26);
      [[0.5, 0.06], [0.5, 0.94], [0.1, 0.5], [0.9, 0.5]].forEach(function (c) { s += fRect(x + w * c[0] - 4, y + h * c[1] - 4, 8, 8, '#fff', 0.5, 1); });
    } else if (cat === 'kitchen') {
      s += fRect(x, y, w, h * 0.2, '#eceae2', 0.7);
      s += fRect(x, y, w * 0.2, h, '#eceae2', 0.7);
      s += fCirc(x + w * 0.45, y + h * 0.1, 3); s += fCirc(x + w * 0.62, y + h * 0.1, 3);
      s += fRect(x + w * 0.04, y + h * 0.48, w * 0.12, h * 0.16, '#fff', 0.5, 1);
    } else if (cat === 'bath') {
      s += fEll(x + w * 0.26, y + h * 0.74, w * 0.13, h * 0.11);
      s += fRect(x + w * 0.56, y + h * 0.06, w * 0.36, h * 0.16, '#fff', 0.6, 1);
      s += fRect(x + w * 0.55, y + h * 0.52, w * 0.4, h * 0.42, 'none', 0.6);
    } else if (cat === 'parking') {
      s += fRect(x + w * 0.14, y + h * 0.2, w * 0.72, h * 0.6, '#fff', 0.8, 5);
      s += fRect(x + w * 0.28, y + h * 0.28, w * 0.44, h * 0.24, '#eef0f4', 0.6, 2);
      s += fCirc(x + w * 0.29, y + h * 0.82, 3.5); s += fCirc(x + w * 0.71, y + h * 0.82, 3.5);
    } else if (cat === 'stair') {
      var n = 8; for (var i = 0; i <= n; i++) { var yy = horiz ? y : y + h * i / n, xx = horiz ? x + w * i / n : x; if (horiz) s += fLine(x + w * i / n, y, x + w * i / n, y + h, FUR, 0.5); else s += fLine(x, y + h * i / n, x + w, y + h * i / n, FUR, 0.5); }
      s += fLine(x + w / 2, y + h, x + w / 2, y, '#a8402e', 0.8);
    } else if (cat === 'dining') { /* handled */ }
    return s;
  }

  // 3D furniture as low solid blocks fitted to a room polygon's bbox (metres).
  function furnitureBlocks3D(cat, poly, Hf) {
    var xs = poly.map(function (p) { return p[0]; }), ys = poly.map(function (p) { return p[1]; });
    var x0 = Math.min.apply(0, xs), x1 = Math.max.apply(0, xs), y0 = Math.min.apply(0, ys), y1 = Math.max.apply(0, ys);
    var w = x1 - x0, d = y1 - y0; if (w < 0.9 || d < 0.9) return [];
    var p = Math.min(w, d) * 0.16; x0 += p; y0 += p; x1 -= p; y1 -= p; w = x1 - x0; d = y1 - y0;
    function bx(a, b, c, e, z0, z1, fill) { return { poly: [[a, b], [c, b], [c, e], [a, e]], z0: z0, z1: z1, fill: fill }; }
    var out = [], horiz = w >= d;
    if (cat === 'bed') {
      out.push(bx(x0, y0, x1, y1, 0.1, 0.55, '#f4f2ec'));                                   // mattress
      if (horiz) out.push(bx(x0, y0, x0 + 0.16 * w, y1, 0.1, 0.95, '#b98c60'));             // wood headboard
      else out.push(bx(x0, y0, x1, y0 + 0.16 * d, 0.1, 0.95, '#b98c60'));
    } else if (cat === 'living') {
      out.push(bx(x0, y1 - 0.34 * d, x1, y1, 0.05, 0.45, '#c9b291'));                        // fabric sofa
      out.push(bx(x0, y1 - 0.34 * d, x0 + 0.18 * w, y0 + 0.2 * d, 0.05, 0.45, '#c9b291'));
      out.push(bx(x0 + 0.28 * w, y0 + 0.12 * d, x0 + 0.62 * w, y0 + 0.42 * d, 0.05, 0.35, '#a9805a')); // coffee table
    } else if (cat === 'dining') {
      out.push(bx(x0 + 0.2 * w, y0 + 0.2 * d, x1 - 0.2 * w, y1 - 0.2 * d, 0.05, 0.75, '#b08356'));
    } else if (cat === 'kitchen') {
      out.push(bx(x0, y0, x1, y0 + 0.22 * d, 0.0, 0.85, '#c7a97c'));                          // counters
      out.push(bx(x0, y0, x0 + 0.22 * w, y1, 0.0, 0.85, '#c7a97c'));
    } else if (cat === 'bath') {
      out.push(bx(x0 + 0.05 * w, y1 - 0.34 * d, x0 + 0.35 * w, y1 - 0.05 * d, 0.0, 0.42, '#f4f7f9'));
      out.push(bx(x1 - 0.4 * w, y0, x1, y0 + 0.2 * d, 0.0, 0.8, '#f4f7f9'));
    } else if (cat === 'parking') {
      out.push(bx(x0 + 0.12 * w, y0 + 0.22 * d, x1 - 0.12 * w, y1 - 0.22 * d, 0.1, 1.35, '#8fa3bd')); // car
    } else if (cat === 'stair') {
      // Solid concrete flight: contiguous treads (no gaps) rising evenly to the next
      // floor, so it reads as a staircase — not a row of see-through purple blades.
      var steps = 7, topH = Hf * 0.9;
      for (var i = 0; i < steps; i++) out.push(bx(x0, y0 + d * i / steps, x1, y0 + d * (i + 1) / steps, 0.0, topH * (i + 1) / steps, '#bcc0c7'));
    }
    return out;
  }

  // Draw one floor's rooms (fill, furniture, walls, doors, windows, labels) into a
  // target pixel rect. Returns an SVG fragment. Used once per floor (side-by-side in 'all').
  function floorFragment(rooms, W, H, tx, ty, tw, th, caption) {
    if (!rooms.length) return caption ? txt(tx + tw / 2, ty + 11, caption + ' — none', '#8b8c82', 9) : '';
    var minX = 0, minY = 0, maxX = W, maxY = H;
    if (!W) { minX = Infinity; minY = Infinity; maxX = -Infinity; maxY = -Infinity; rooms.forEach(function (r) { r.poly.forEach(function (p) { minX = Math.min(minX, p[0]); minY = Math.min(minY, p[1]); maxX = Math.max(maxX, p[0]); maxY = Math.max(maxY, p[1]); }); }); }
    var bw = maxX - minX || 1, bd = maxY - minY || 1;
    var capH = caption ? 18 : 0, pad = 10;
    var scale = Math.min((tw - pad * 2) / bw, (th - capH - pad * 2) / bd);
    var ox = tx + (tw - bw * scale) / 2 - minX * scale, oy = ty + capH + (th - capH - bd * scale) / 2 - minY * scale;
    function X(x) { return (ox + x * scale).toFixed(1); }
    function Y(y) { return (oy + y * scale).toFixed(1); }
    var EW = W || maxX, ED = H || maxY, tol = 0.3;
    function extEdge(a, b) {
      if (Math.abs(a[0] - minX) < tol && Math.abs(b[0] - minX) < tol) return true;
      if (Math.abs(a[0] - EW) < tol && Math.abs(b[0] - EW) < tol) return true;
      if (Math.abs(a[1] - minY) < tol && Math.abs(b[1] - minY) < tol) return true;
      if (Math.abs(a[1] - ED) < tol && Math.abs(b[1] - ED) < tol) return true;
      return false;
    }
    var frag = '', walls = '', openings = '';
    rooms.forEach(function (r) {
      var st = roomStyle(r.label);
      frag += '<polygon points="' + r.poly.map(function (p) { return X(p[0]) + ',' + Y(p[1]); }).join(' ') + '" fill="' + st.fill + '" stroke="none"/>';
      var bxs = r.poly.map(function (p) { return ox + p[0] * scale; }), bys = r.poly.map(function (p) { return oy + p[1] * scale; });
      var rx0 = Math.min.apply(0, bxs), ry0 = Math.min.apply(0, bys), rx1 = Math.max.apply(0, bxs), ry1 = Math.max.apply(0, bys);
      frag += furniture(st.cat, rx0, ry0, rx1 - rx0, ry1 - ry0);
      var interior = [];
      for (var i = 0; i < r.poly.length; i++) {
        var a = r.poly[i], b = r.poly[(i + 1) % r.poly.length];
        walls += '<line x1="' + X(a[0]) + '" y1="' + Y(a[1]) + '" x2="' + X(b[0]) + '" y2="' + Y(b[1]) + '" stroke="#1d1e1b" stroke-width="1.5"/>';
        var mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (extEdge(a, b)) {
          var ux = (b[0] - a[0]) / (len || 1), uy = (b[1] - a[1]) / (len || 1), wl = Math.min(len * 0.4, 1.4);
          var w1 = [mx - ux * wl, my - uy * wl], w2 = [mx + ux * wl, my + uy * wl];
          openings += '<line x1="' + X(w1[0]) + '" y1="' + Y(w1[1]) + '" x2="' + X(w2[0]) + '" y2="' + Y(w2[1]) + '" stroke="#fff" stroke-width="3"/>';
          openings += '<line x1="' + X(w1[0]) + '" y1="' + Y(w1[1]) + '" x2="' + X(w2[0]) + '" y2="' + Y(w2[1]) + '" stroke="#24406b" stroke-width="1"/>';
        } else if (len > 1.2) { interior.push({ a: a, b: b, mx: mx, my: my, len: len }); }
      }
      if (interior.length) {
        interior.sort(function (p, q) { return q.len - p.len; });
        var e = interior[0], cxr = 0, cyr = 0; r.poly.forEach(function (p) { cxr += p[0]; cyr += p[1]; }); cxr /= r.poly.length; cyr /= r.poly.length;
        var ex = (e.b[0] - e.a[0]) / e.len, ey = (e.b[1] - e.a[1]) / e.len, dl = Math.min(e.len * 0.5, 0.9);
        var hinge = [e.mx - ex * dl / 2, e.my - ey * dl / 2];
        var toC = [cxr - e.mx, cyr - e.my], nlen = Math.hypot(toC[0], toC[1]) || 1;
        var leaf = [hinge[0] + (toC[0] / nlen) * dl, hinge[1] + (toC[1] / nlen) * dl];
        openings += '<line x1="' + X(hinge[0]) + '" y1="' + Y(hinge[1]) + '" x2="' + X(e.mx + ex * dl / 2) + '" y2="' + Y(e.my + ey * dl / 2) + '" stroke="' + st.fill + '" stroke-width="2.4"/>';
        openings += '<line x1="' + X(hinge[0]) + '" y1="' + Y(hinge[1]) + '" x2="' + X(leaf[0]) + '" y2="' + Y(leaf[1]) + '" stroke="#7a7b71" stroke-width="0.9"/>';
        openings += '<path d="M ' + X(leaf[0]) + ' ' + Y(leaf[1]) + ' A ' + (dl * scale).toFixed(1) + ' ' + (dl * scale).toFixed(1) + ' 0 0 1 ' + X(e.mx + ex * dl / 2) + ' ' + Y(e.my + ey * dl / 2) + '" fill="none" stroke="#b8b9b0" stroke-width="0.6"/>';
      }
    });
    if (W) frag += '<rect x="' + X(0) + '" y="' + Y(0) + '" width="' + (W * scale).toFixed(1) + '" height="' + (H * scale).toFixed(1) + '" fill="none" stroke="#b9c6d8" stroke-dasharray="4 3"/>';
    frag += walls + openings;
    rooms.forEach(function (r) {
      var cxp = 0, cyp = 0; r.poly.forEach(function (p) { cxp += p[0]; cyp += p[1]; }); cxp /= r.poly.length; cyp /= r.poly.length;
      var lbl = r.label.length > 15 ? r.label.slice(0, 14) + '…' : r.label;
      frag += txt(ox + cxp * scale, oy + cyp * scale, lbl, '#1d1e1b', 6.5);
    });
    if (caption) frag += txt(tx + tw / 2, ty + 11, caption, '#5e5f57', 9.5);
    return frag;
  }

  // 2D interior — one floor, or every floor side by side ('all').
  function drawRoomPolys(rp) {
    var geom = updateDerived();
    var W = geom ? geom.W : null, H = geom ? geom.D : null;
    var levels = roomLevels();
    var s = '<svg width="' + DW + '" height="' + DH + '" viewBox="0 0 ' + DW + ' ' + DH + '" xmlns="http://www.w3.org/2000/svg">';
    if (currentFloor === 'all' && levels.length > 1 && stackFloors) {
      // Stacked: floor plans in a vertical column, top storey on top.
      var vgap = 12, vn = levels.length, rowH = (DH - vgap * (vn + 1)) / vn;
      levels.slice().reverse().forEach(function (lv, i) {
        s += floorFragment(rp.filter(function (r) { return (r.level || 0) === lv; }), W, H, vgap, vgap + i * (rowH + vgap), DW - vgap * 2, rowH, floorName(lv));
      });
      resolveTag.textContent = '· interior · stacked';
      resolveHint.textContent = 'Floor plans stacked (' + vn + '), top storey on top. Tap Stacked off for side by side.';
    } else if (currentFloor === 'all' && levels.length > 1) {
      var gap = 12, n = levels.length, colW = (DW - gap * (n + 1)) / n;
      levels.forEach(function (lv, i) {
        s += floorFragment(rp.filter(function (r) { return (r.level || 0) === lv; }), W, H, gap + i * (colW + gap), 8, colW, DH - 16, floorName(lv));
      });
      resolveTag.textContent = '· interior · all floors';
      resolveHint.textContent = 'All floors side by side (' + n + '). Tap Stacked to stack them, or Floor to view one.';
    } else {
      var lv = (currentFloor === 'all') ? levels[0] : currentFloor;
      var rooms = rp.filter(function (r) { return (r.level || 0) === lv; });
      if (!rooms.length) { resolveSvg.innerHTML = '<div class="resolve-empty">No rooms on this floor.</div>'; resolveTag.textContent = '· interior'; resolveHint.textContent = ''; return; }
      s += floorFragment(rooms, W, H, 18, 8, DW - 36, DH - 16, levels.length > 1 ? floorName(lv) : null);
      resolveTag.textContent = '· interior';
      resolveHint.textContent = 'Layout from the drawing (' + rooms.length + ' rooms) · colours by room type; doors/windows/furniture representative.' + (levels.length > 1 ? ' Tap Floor → All to see every floor.' : '');
    }
    s += '</svg>';
    resolveSvg.innerHTML = s;
  }

  function edge(x0, y0, x1, y1, color) {
    return '<line x1="' + x0.toFixed(1) + '" y1="' + y0.toFixed(1) + '" x2="' + x1.toFixed(1) + '" y2="' + y1.toFixed(1) + '" stroke="' + color + '" stroke-width="2.5"/>';
  }
  function txt(x, y, t, color, size, anchor) {
    return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" font-family="IBM Plex Mono" font-size="' + size + '" text-anchor="' + (anchor || 'middle') + '" fill="' + color + '">' + t + '</text>';
  }
  function handle(x, y, edgeName) {
    return '<rect class="handle" data-edge="' + edgeName + '" x="' + (x - 5).toFixed(1) + '" y="' + (y - 5).toFixed(1) + '" width="10" height="10" rx="2" fill="#fff" stroke="#24406b" stroke-width="1.5"/>';
  }

  // Dragging setback edges (2D) or rotating the massing (3D) — event delegation.
  var dragEdge = null;
  var rotDragging = false, rotStartX = 0, rotStartY = 0, rotStartYaw = 0, rotStartTilt = 0;
  resolveSvg.addEventListener('pointerdown', function (e) {
    if (viewMode === '3d') {
      rotDragging = true; rotStartX = e.clientX; rotStartY = e.clientY; rotStartYaw = rot3d; rotStartTilt = tilt3d;
      spin3d = false; spinBtn.classList.remove('active'); // manual drag stops auto-spin
      e.preventDefault();
      return;
    }
    var t = e.target;
    if (!t || !t.getAttribute || !t.getAttribute('data-edge') || !view || !view.parametric) return;
    dragEdge = t.getAttribute('data-edge');
    e.preventDefault();
  });
  window.addEventListener('pointermove', function (e) {
    if (rotDragging) {
      rot3d = rotStartYaw + (e.clientX - rotStartX) * 0.012;
      tilt3d = rotStartTilt + (e.clientY - rotStartY) * 0.012;
      draw3D();
      return;
    }
    if (!dragEdge || !view) return;
    var svg = resolveSvg.querySelector('svg');
    if (!svg) return;
    var rect = svg.getBoundingClientRect();
    var sx = (e.clientX - rect.left) * (DW / rect.width);
    var sy = (e.clientY - rect.top) * (DH / rect.height);
    var mx = (sx - view.ox) / view.scale, my = (sy - view.oy) / view.scale;
    if (dragEdge === 'rear') setVal(inputs.rear, clamp(my, 0, view.D - (numEl(inputs.front) || 0) - 1));
    else if (dragEdge === 'front') setVal(inputs.front, clamp(view.D - my, 0, view.D - (numEl(inputs.rear) || 0) - 1));
    else if (dragEdge === 'side-l') setVal(inputs.side, clamp(mx, 0, view.W / 2 - 1));
    else if (dragEdge === 'side-r') setVal(inputs.side, clamp(view.W - mx, 0, view.W / 2 - 1));
    drawResolve();
    clearTimeout(complyTimer);
    complyTimer = setTimeout(function () { runCompliance(false); }, 120);
  });
  window.addEventListener('pointerup', function () {
    if (rotDragging) rotDragging = false;
    if (dragEdge) { dragEdge = null; runCompliance(false); }
  });
  function setVal(el, v) { el.value = round1(v); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function setStatus(text, isErr) {
    statusEl.textContent = text;
    statusEl.className = 'status' + (isErr ? ' err' : '');
  }

  // ---- Draft submission sheet ----
  genSheetBtn.addEventListener('click', function () {
    var vals = readInputs();
    if (!vals.plot_area_sqm || !vals.footprint_sqm) {
      sheetStatus.textContent = 'Enter at least plot area and footprint above first.';
      sheetStatus.className = 'status err';
      return;
    }
    sheetStatus.textContent = 'Assembling sheet…';
    sheetStatus.className = 'status';
    // Pull a fresh compliance result so the sheet matches the current inputs.
    fetch('/api/comply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(vals)
    })
      .then(function (r) { return r.json(); })
      .then(function (compliance) {
        var html = buildSheetHTML(vals, compliance);
        sheetWrap.innerHTML = html;
        ensurePrintRegion(html);
        printSheetBtn.hidden = false;
        sheetStatus.textContent = 'Draft sheet ready.';
        markStep(3, true);
        scheduleSave();
        toast('Draft sheet ready — Print / Save as PDF', 'ok');
      })
      .catch(function (err) {
        sheetStatus.textContent = 'Could not build sheet: ' + err.message;
        sheetStatus.className = 'status err';
      });
  });

  printSheetBtn.addEventListener('click', function () {
    document.body.classList.add('printing-sheet');
    window.print();
    setTimeout(function () { document.body.classList.remove('printing-sheet'); }, 300);
  });

  function readInputs() {
    return {
      plot_area_sqm: inputs.plot.value,
      floors: inputs.floors.value,
      footprint_sqm: inputs.footprint.value,
      unit_count: inputs.units.value,
      setback_front_m: inputs.front.value,
      setback_rear_m: inputs.rear.value,
      setback_side_m: inputs.side.value,
      height_m: inputs.height.value,
      road_width_m: inputs.road.value,
      parking_provided: inputs.parking.value,
      rooms: (lastExtraction && Array.isArray(lastExtraction.rooms)) ? lastExtraction.rooms : []
    };
  }

  function ensurePrintRegion(html) {
    var region = document.getElementById('print-region');
    if (!region) {
      region = document.createElement('div');
      region.id = 'print-region';
      document.body.appendChild(region);
    }
    region.innerHTML = html;
  }

  function buildSheetHTML(v, compliance) {
    var plot = parseFloat(v.plot_area_sqm);
    var footprint = parseFloat(v.footprint_sqm);
    var floors = parseFloat(v.floors) || 1;
    var units = parseFloat(v.unit_count);
    var builtUp = footprint * floors;
    var fsi = builtUp / plot;
    var coverage = (footprint / plot) * 100;

    var project = escapeHtml(metaProject.value || 'Untitled project');
    var sheetNo = escapeHtml(metaSheet.value || 'A-101');
    var by = escapeHtml(metaBy.value || '—');
    var today = new Date().toISOString().slice(0, 10);
    var typology = lastExtraction && lastExtraction.typology_guess ? escapeHtml(lastExtraction.typology_guess) : '—';

    var areaRows =
      areaRow('Plot area', fmt(plot) + ' sq.m') +
      areaRow('Building footprint', fmt(footprint) + ' sq.m') +
      areaRow('Floors', floors + (v.floors ? '' : ' (assumed)')) +
      areaRow('Total built-up (implied)', fmt(builtUp) + ' sq.m') +
      areaRow('FSI / FAR achieved', fsi.toFixed(2)) +
      areaRow('Ground coverage', coverage.toFixed(1) + ' %') +
      areaRow('Dwelling units', isFinite(units) ? units : '—') +
      areaRow('Typology', typology);

    var checks = compliance.checks || [];
    var compRows = checks.map(function (c) {
      var cls = c.status === 'pass' ? 'f-pass' : c.status === 'fail' ? 'f-fail' : 'f-na';
      var label = c.status === 'pass' ? '✓ Pass' : c.status === 'fail' ? '✗ Review' : '— Data';
      var proposed = c.proposed != null ? c.proposed : '—';
      return '<tr class="' + cls + '"><td>' + escapeHtml(c.parameter) + '</td><td class="num">' +
        escapeHtml(String(c.permissible == null ? '—' : c.permissible)) + '</td><td class="num">' +
        escapeHtml(String(proposed)) + '</td><td class="st">' + label + '</td></tr>';
    }).join('');

    var open = checks.filter(function (c) { return c.status === 'fail' || c.status === 'insufficient_data'; });
    var openItems;
    if (!open.length) {
      openItems = '<li class="none"><span class="m">✓</span><span>No open items — all checked parameters pass against the (placeholder) bylaws.</span></li>';
    } else {
      openItems = open.map(function (c, i) {
        var na = c.status === 'insufficient_data';
        var msg = na
          ? escapeHtml(c.parameter) + ' — ' + escapeHtml(c.reason || 'needs data')
          : escapeHtml(c.parameter) + ' shortfall vs. permissible ' + escapeHtml(String(c.permissible)) + ' (proposed ' + escapeHtml(String(c.proposed)) + ')';
        return '<li class="' + (na ? 'na' : '') + '"><span class="m">' + (na ? '·' : pad(i + 1)) + '</span><span>' + msg + '</span></li>';
      }).join('');
    }

    return (
      '<div class="sheet">' +
        '<div class="stamp">DRAFT · NOT FOR SUBMISSION</div>' +
        '<div class="sheet-inner">' +
          '<div class="sheet-title">' +
            '<h3>' + project + '</h3>' +
            '<div class="meta">Sheet ' + sheetNo + ' &middot; Scale NTS<br>Prepared by ' + by + ' &middot; ' + today + '<br>Draft for architect review</div>' +
          '</div>' +
          '<div class="sheet-cols">' +
            '<div>' +
              '<h4>Key plan (schematic)</h4>' +
              '<div class="keyplan-box">' + keyPlanSVG(v) + '</div>' +
              '<div class="keyplan-cap">Indicative massing — not to scale</div>' +
              '<h4 style="margin-top:16px;">Open items for review</h4>' +
              '<ul class="open-items">' + openItems + '</ul>' +
            '</div>' +
            '<div>' +
              '<h4>Area statement</h4>' +
              '<table><tbody>' + areaRows + '</tbody></table>' +
              '<h4>Development-control compliance</h4>' +
              '<table><thead><tr><th>Parameter</th><th class="num">Permissible</th><th class="num">Proposed</th><th>Status</th></tr></thead><tbody>' +
              compRows + '</tbody></table>' +
            '</div>' +
          '</div>' +
          '<div class="sheet-views">' +
            '<div class="view-box"><h4>Schematic elevation</h4>' + elevationSVG(v) + '<div class="keyplan-cap">Indicative massing — not to scale</div></div>' +
            '<div class="view-box"><h4>Schematic section</h4>' + sectionSVG(v) + '<div class="keyplan-cap">Indicative massing — not to scale</div></div>' +
          '</div>' +
          '<div class="sheet-foot">' +
            '<span>Bylaw source: ' + escapeHtml(compliance.authority || 'placeholder') + '</span>' +
            '<span>Auto-drafted from extracted + confirmed data · verify before any statutory use</span>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function keyPlanSVG(v) {
    var W = 260, H = 200, pad = 16;
    var plotW = W - pad * 2, plotH = H - pad * 2;
    var plot = parseFloat(v.plot_area_sqm);
    var footprint = parseFloat(v.footprint_sqm);
    var ratio = plot && footprint ? Math.sqrt(Math.min(footprint / plot, 1)) : 0.6;
    var bw = plotW * ratio, bh = plotH * ratio;
    var bx = pad + (plotW - bw) / 2, by = pad + (plotH - bh) / 2;
    var setTxt = [];
    if (v.setback_front_m) setTxt.push('F ' + v.setback_front_m);
    if (v.setback_rear_m) setTxt.push('R ' + v.setback_rear_m);
    if (v.setback_side_m) setTxt.push('S ' + v.setback_side_m);
    return (
      '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg">' +
        '<rect x="' + pad + '" y="' + pad + '" width="' + plotW + '" height="' + plotH + '" fill="none" stroke="#b9c6d8" stroke-dasharray="5 3"/>' +
        '<rect x="' + bx.toFixed(1) + '" y="' + by.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + bh.toFixed(1) + '" fill="#eef0f4" stroke="#1d1e1b" stroke-width="1.5"/>' +
        '<text x="' + (W / 2) + '" y="' + (H / 2) + '" font-family="IBM Plex Mono" font-size="9" text-anchor="middle" fill="#5e5f57">building</text>' +
        '<text x="' + (pad + 2) + '" y="' + (H - 4) + '" font-family="IBM Plex Mono" font-size="8" fill="#8b8c82">plot boundary</text>' +
        (setTxt.length ? '<text x="' + (W - 4) + '" y="' + (H - 4) + '" font-family="IBM Plex Mono" font-size="8" text-anchor="end" fill="#8b8c82">setbacks ' + setTxt.join(' / ') + '</text>' : '') +
      '</svg>'
    );
  }

  // Schematic front elevation: stacked floors scaled to the entered height.
  function elevationSVG(v) {
    var W = 260, H = 180, ground = 150, pad = 40;
    var floors = Math.max(1, Math.round(parseFloat(v.floors) || 1));
    var heightM = parseFloat(v.height_m) || floors * 3.2;
    var maxPx = 120;
    var scale = Math.min(maxPx / heightM, 6);
    var bh = heightM * scale;
    var bw = W - pad * 2;
    var bx = pad, top = ground - bh;
    var floorH = bh / floors;
    var lines = '';
    for (var i = 1; i < floors; i++) {
      var y = (ground - i * floorH).toFixed(1);
      lines += '<line x1="' + bx + '" y1="' + y + '" x2="' + (bx + bw) + '" y2="' + y + '" stroke="#b9c6d8" stroke-width="1"/>';
    }
    // a couple of window ticks per floor for legibility
    var wins = '';
    for (var f = 0; f < floors; f++) {
      var cy = (ground - (f + 0.5) * floorH - 4).toFixed(1);
      for (var wcol = 0; wcol < 3; wcol++) {
        var wx = bx + bw * (0.2 + wcol * 0.3);
        wins += '<rect x="' + wx.toFixed(1) + '" y="' + cy + '" width="14" height="8" fill="none" stroke="#8b8c82" stroke-width="0.8"/>';
      }
    }
    return (
      '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg">' +
        '<line x1="8" y1="' + ground + '" x2="' + (W - 8) + '" y2="' + ground + '" stroke="#1d1e1b" stroke-width="1.5"/>' +
        '<rect x="' + bx + '" y="' + top.toFixed(1) + '" width="' + bw + '" height="' + bh.toFixed(1) + '" fill="#eef0f4" stroke="#1d1e1b" stroke-width="1.5"/>' +
        lines + wins +
        '<line x1="' + (bx - 12) + '" y1="' + top.toFixed(1) + '" x2="' + (bx - 12) + '" y2="' + ground + '" stroke="#8b8c82" stroke-width="1"/>' +
        '<text x="' + (bx - 16) + '" y="' + (top + bh / 2).toFixed(1) + '" font-family="IBM Plex Mono" font-size="8" text-anchor="end" fill="#5e5f57" transform="rotate(-90 ' + (bx - 16) + ' ' + (top + bh / 2).toFixed(1) + ')">' + heightM + ' m</text>' +
        '<text x="' + (W / 2) + '" y="' + (ground + 16) + '" font-family="IBM Plex Mono" font-size="8" text-anchor="middle" fill="#8b8c82">G + ' + (floors - 1) + '  ·  ' + floors + ' levels</text>' +
      '</svg>'
    );
  }

  // Schematic section: same massing with floor slabs shown as bands.
  function sectionSVG(v) {
    var W = 260, H = 180, ground = 150, pad = 40;
    var floors = Math.max(1, Math.round(parseFloat(v.floors) || 1));
    var heightM = parseFloat(v.height_m) || floors * 3.2;
    var scale = Math.min(120 / heightM, 6);
    var bh = heightM * scale, bw = W - pad * 2, bx = pad, top = ground - bh;
    var floorH = bh / floors;
    var slabs = '';
    for (var i = 0; i <= floors; i++) {
      var y = (ground - i * floorH).toFixed(1);
      slabs += '<line x1="' + bx + '" y1="' + y + '" x2="' + (bx + bw) + '" y2="' + y + '" stroke="#5e5f57" stroke-width="1.4"/>';
    }
    // foundation hatch
    var found = '<rect x="' + bx + '" y="' + ground + '" width="' + bw + '" height="10" fill="none" stroke="#8b8c82" stroke-width="0.8" stroke-dasharray="3 2"/>';
    return (
      '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg">' +
        '<line x1="8" y1="' + ground + '" x2="' + (W - 8) + '" y2="' + ground + '" stroke="#1d1e1b" stroke-width="1.5"/>' +
        '<rect x="' + bx + '" y="' + top.toFixed(1) + '" width="' + bw + '" height="' + bh.toFixed(1) + '" fill="#f5f5f1" stroke="#1d1e1b" stroke-width="1.5"/>' +
        slabs + found +
        '<text x="' + (W / 2) + '" y="' + (ground + 16) + '" font-family="IBM Plex Mono" font-size="8" text-anchor="middle" fill="#8b8c82">' + floors + ' floor plates</text>' +
      '</svg>'
    );
  }

  function areaRow(k, val) {
    return '<tr><td>' + escapeHtml(k) + '</td><td class="num">' + escapeHtml(String(val)) + '</td></tr>';
  }
  function fmt(n) { return (Math.round(n * 100) / 100).toLocaleString(); }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  // ================= Projects (file-backed) =================
  var projectsView = document.getElementById('projects-view');
  var editorView = document.getElementById('editor-view');
  var grid = document.getElementById('projects-grid');
  var emptyEl = document.getElementById('projects-empty');
  var pvCount = document.getElementById('pv-count');
  var pvSearch = document.getElementById('pv-search');
  var newModal = document.getElementById('new-modal');
  var npName = document.getElementById('np-name');
  var editorName = document.getElementById('editor-project-name');
  var saveState = document.getElementById('editor-save-state');

  var currentProject = null;
  var saveTimer = null;
  var restoring = false;
  var lastComplianceSummary = null;
  var allProjectCards = [];

  function api(method, url, body) {
    return fetch(url, {
      method: method, headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      if (!r.ok) return r.json().then(function (e) { throw new Error(e.error || ('HTTP ' + r.status)); });
      return r.json();
    });
  }

  function showProjects() {
    if (window.__guestMode) { currentProject = null; editorView.hidden = true; authView.hidden = false; window.__guestMode = false; userChip.hidden = true; return; }
    if (currentProject) doSave();
    currentProject = null;
    editorView.hidden = true; projectsView.hidden = false;
    loadProjects();
    window.scrollTo(0, 0);
  }
  function showEditor() { projectsView.hidden = true; editorView.hidden = false; }

  function loadProjects() {
    api('GET', '/api/projects').then(function (res) {
      allProjectCards = res.projects || [];
      renderProjects();
    }).catch(function (e) { grid.innerHTML = ''; pvCount.textContent = 'Could not load projects: ' + e.message; });
  }

  function renderProjects() {
    var q = (pvSearch.value || '').toLowerCase().trim();
    var list = allProjectCards.filter(function (p) {
      return !q || (p.name || '').toLowerCase().indexOf(q) >= 0 || (p.typology || '').toLowerCase().indexOf(q) >= 0;
    });
    pvCount.textContent = allProjectCards.length + ' project' + (allProjectCards.length === 1 ? '' : 's');
    emptyEl.hidden = allProjectCards.length !== 0;
    grid.hidden = allProjectCards.length === 0;
    grid.innerHTML = list.map(cardHTML).join('');
  }

  function statusBadge(c) {
    if (!c || c.total == null) return { cls: 'none', txt: 'Not checked' };
    if (c.fails > 0) return { cls: 'fail', txt: c.fails + ' to review' };
    if (c.needs > 0) return { cls: 'none', txt: c.needs + ' need data' };
    return { cls: 'pass', txt: 'All clear' };
  }
  function thumbSVG(p) {
    var floors = Math.max(1, Math.round(p.floors || 1));
    var W = 260, H = 120, pad = 16, pw = W - pad * 2, ph = H - pad * 2;
    var bw = pw * 0.6, bh = ph * 0.74, bx = (W - bw) / 2, by = H - pad - bh, lines = '';
    for (var i = 1; i < floors; i++) { var y = (by + bh - bh * i / floors).toFixed(1); lines += '<line x1="' + bx + '" y1="' + y + '" x2="' + (bx + bw) + '" y2="' + y + '" stroke="#b9c6d8" stroke-width="1"/>'; }
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">' +
      '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#ecebe3"/>' +
      '<rect x="' + pad + '" y="' + pad + '" width="' + pw + '" height="' + ph + '" fill="none" stroke="#c7cdbb" stroke-dasharray="4 3"/>' +
      '<rect x="' + bx.toFixed(1) + '" y="' + by.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + bh.toFixed(1) + '" fill="#dfe3ea" stroke="#1d1e1b" stroke-width="1.3"/>' +
      lines + '</svg>';
  }
  function cardHTML(p) {
    var b = statusBadge(p.compliance), meta = [];
    if (p.typology) meta.push(escapeHtml(p.typology));
    if (p.plot_area_sqm) meta.push(round1(p.plot_area_sqm) + ' m² plot');
    if (p.floors) meta.push('G+' + Math.max(0, Math.round(p.floors) - 1));
    if (p.rooms) meta.push(p.rooms + ' rooms');
    var date = p.updatedAt ? new Date(p.updatedAt).toLocaleDateString() : '';
    return '<div class="project-card" data-id="' + p.id + '">' +
      '<div class="pc-thumb" data-open="' + p.id + '">' + thumbSVG(p) + '<span class="pc-badge ' + b.cls + '">' + escapeHtml(b.txt) + '</span></div>' +
      '<div class="pc-body" data-open="' + p.id + '"><div class="pc-name">' + escapeHtml(p.name || 'Untitled project') + '</div>' +
      '<div class="pc-meta">' + (meta.join(' · ') || 'No data yet') + '<br>' + escapeHtml(date) + '</div></div>' +
      '<div class="pc-actions"><button data-open="' + p.id + '">Open</button><button data-dup="' + p.id + '">Duplicate</button><button data-exp="' + p.id + '">Export</button><button class="danger" data-del="' + p.id + '">Delete</button></div>' +
      '</div>';
  }

  grid.addEventListener('click', function (e) {
    var t = e.target.closest('[data-open],[data-dup],[data-del],[data-exp]');
    if (!t) return;
    if (t.hasAttribute('data-open')) openProject(t.getAttribute('data-open'));
    else if (t.hasAttribute('data-dup')) duplicateProject(t.getAttribute('data-dup'));
    else if (t.hasAttribute('data-del')) deleteProject(t.getAttribute('data-del'));
    else if (t.hasAttribute('data-exp')) exportProject(t.getAttribute('data-exp'));
  });
  pvSearch.addEventListener('input', renderProjects);

  function openProject(id) {
    api('GET', '/api/projects/' + id).then(applyProject).catch(function (e) { toast('Could not open: ' + e.message, 'err'); });
  }
  function duplicateProject(id) {
    api('GET', '/api/projects/' + id).then(function (p) {
      return api('POST', '/api/projects', { name: (p.name || 'Project') + ' copy', extraction: p.extraction, inputs: p.inputs, meta: p.meta, compliance: p.compliance, image: p.image });
    }).then(function () { toast('Project duplicated', 'ok'); loadProjects(); });
  }
  function deleteProject(id) {
    var p = allProjectCards.filter(function (x) { return x.id === id; })[0];
    if (!window.confirm('Delete “' + (p ? p.name : 'this project') + '”? This removes its file.')) return;
    api('DELETE', '/api/projects/' + id).then(function () { toast('Project deleted', 'ok'); loadProjects(); });
  }
  function exportProject(id) {
    api('GET', '/api/projects/' + id).then(function (p) {
      var blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = (p.name || 'project').replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.json';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    });
  }

  // ---- capture / restore editor state ----
  function captureInputs() { var o = {}; Object.keys(inputs).forEach(function (k) { o[k] = inputs[k].value; }); return o; }
  function applyInputs(o) { if (!o) return; Object.keys(inputs).forEach(function (k) { if (o[k] != null && o[k] !== '') inputs[k].value = o[k]; }); }
  function captureState() {
    return {
      name: currentProject ? currentProject.name : (metaProject.value || 'Untitled project'),
      extraction: lastExtraction || null,
      inputs: captureInputs(),
      meta: { project: metaProject.value, sheet: metaSheet.value, by: metaBy.value },
      compliance: lastComplianceSummary,
      image: uploadedImage || null
    };
  }
  function resetEditor() {
    lastExtraction = null; massingBlocks = null; lastComplianceSummary = null;
    resultsSection.hidden = true; roomsTable.innerHTML = ''; infoCards.innerHTML = ''; confidenceNote.textContent = '';
    rawOutput.textContent = ''; rawOutput.hidden = true; rawOutput.style.display = 'none';
    Object.keys(inputs).forEach(function (k) { inputs[k].value = ''; });
    complianceTable.innerHTML = ''; if (roomChecksEl) roomChecksEl.innerHTML = '';
    sheetWrap.innerHTML = ''; printSheetBtn.hidden = true; sheetStatus.textContent = '';
    metaProject.value = ''; metaSheet.value = ''; metaBy.value = '';
    selectedFile = null; uploadedImage = null; preview.removeAttribute('src'); preview.style.display = 'none'; uploadBox.classList.remove('has-file'); runBtn.disabled = true;
    stepDone = { 1: false, 2: false, 3: false }; refreshSteps();
    setStatus('');
  }
  function applyProject(p) {
    restoring = true; currentProject = p;
    resetEditor();
    editorName.textContent = p.name || 'Untitled project';
    metaProject.value = (p.meta && p.meta.project) || p.name || '';
    if (p.meta) { metaSheet.value = p.meta.sheet || ''; metaBy.value = p.meta.by || ''; }
    if (p.image) { uploadedImage = p.image; preview.src = p.image; preview.style.display = 'block'; uploadBox.classList.add('has-file'); }
    if (p.extraction) { rawOutput.textContent = JSON.stringify(p.extraction, null, 2); renderExtraction(p.extraction); }
    applyInputs(p.inputs);
    lastComplianceSummary = p.compliance || null;
    showEditor(); goToStep(1, { silent: true });
    if (p.extraction) runCompliance(false);
    setTimeout(function () { restoring = false; markSaved(); }, 60);
  }

  // ---- autosave ----
  function scheduleSave() {
    if (!currentProject || restoring) return;
    if (currentProject._guest) { saveState.textContent = 'Demo mode — sign in to save'; saveState.classList.remove('saved'); return; }
    saveState.textContent = 'Saving…'; saveState.classList.remove('saved');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(doSave, 700);
  }
  function doSave() {
    if (!currentProject || currentProject._guest) return;
    api('PUT', '/api/projects/' + currentProject.id, captureState())
      .then(function (p) { currentProject = p; markSaved(); })
      .catch(function (e) { saveState.textContent = 'Save failed'; });
  }
  function markSaved() { saveState.textContent = 'All changes saved'; saveState.classList.add('saved'); }

  // ---- new project modal ----
  function openNewModal() { npName.value = ''; newModal.hidden = false; setTimeout(function () { npName.focus(); }, 30); }
  function closeNewModal() { newModal.hidden = true; }
  document.getElementById('new-project-btn').addEventListener('click', openNewModal);
  document.getElementById('empty-new-btn').addEventListener('click', openNewModal);
  document.getElementById('np-cancel').addEventListener('click', closeNewModal);
  newModal.addEventListener('click', function (e) { if (e.target === newModal) closeNewModal(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !newModal.hidden) closeNewModal(); });
  Array.prototype.forEach.call(document.querySelectorAll('.np-method'), function (b) {
    b.addEventListener('click', function () { createAndStart(b.getAttribute('data-method')); });
  });
  function createAndStart(method) {
    var name = (npName.value || '').trim() || 'Untitled project';
    api('POST', '/api/projects', { name: name, extraction: null, inputs: {}, meta: { project: name }, compliance: null })
      .then(function (p) {
        currentProject = p; closeNewModal();
        resetEditor();
        editorName.textContent = name; metaProject.value = name;
        showEditor(); goToStep(1, { silent: true });
        markSaved();
        if (method === 'sample') { document.getElementById('sample-btn').click(); }
        else if (method === 'paste') { document.getElementById('bridge').open = true; }
        // 'upload' → user drops a file into the upload box
      })
      .catch(function (e) { toast('Could not create project: ' + e.message, 'err'); });
  }

  document.getElementById('back-projects').addEventListener('click', showProjects);
  metaProject.addEventListener('input', function () {
    if (currentProject) { currentProject.name = metaProject.value; editorName.textContent = metaProject.value || 'Untitled project'; }
    scheduleSave();
  });
  metaSheet.addEventListener('input', scheduleSave);
  metaBy.addEventListener('input', scheduleSave);

  // ================= Auth (login journey) =================
  var authView = document.getElementById('auth-view');
  var authForm = document.getElementById('auth-form');
  var authTitle = document.getElementById('auth-title');
  var authSub = document.getElementById('auth-sub');
  var authSubmit = document.getElementById('auth-submit');
  var authError = document.getElementById('auth-error');
  var authToggle = document.getElementById('auth-toggle');
  var authSwitchText = document.getElementById('auth-switch-text');
  var nameField = document.getElementById('name-field');
  var authName = document.getElementById('auth-name');
  var authEmail = document.getElementById('auth-email');
  var authPassword = document.getElementById('auth-password');
  var userChip = document.getElementById('user-chip');
  var userNameEl = document.getElementById('user-name');
  var signoutBtn = document.getElementById('signout-btn');
  var authMode = 'login';

  function showAuth() { window.__guestMode = false; authView.hidden = false; userChip.hidden = true; }
  function setUser(u) { userNameEl.textContent = u.name || u.email; userChip.hidden = false; }

  // ---- One-click demo: explore the tool without an account (client-side only,
  // never persists and never calls the paid extraction API). ----
  function startDemo() {
    window.__guestMode = true;
    authView.hidden = true;
    setUser({ name: 'Guest · demo' });
    currentProject = { id: 'guest', name: 'Demo · G+1 Row House', _guest: true };
    resetEditor();
    editorName.textContent = 'Demo · G+1 Row House';
    metaProject.value = 'Demo · G+1 Row House';
    showEditor(); goToStep(1, { silent: true });
    document.getElementById('sample-btn').click();
    saveState.textContent = 'Demo mode — sign in to save';
    saveState.classList.remove('saved');
    toast('Exploring the demo — sign in anytime to save your work', 'ok');
  }
  var demoBtn = document.getElementById('demo-btn');
  if (demoBtn) demoBtn.addEventListener('click', startDemo);
  function submitLabel() { return authMode === 'login' ? 'Sign in' : 'Create account'; }

  function setAuthMode(mode) {
    authMode = mode;
    var login = mode === 'login';
    authTitle.textContent = login ? 'Sign in' : 'Create your account';
    authSub.textContent = login ? 'Access your compliance projects.' : 'Start saving compliance projects to your account.';
    nameField.hidden = login;
    authSubmit.textContent = submitLabel();
    authSwitchText.textContent = login ? 'New to DFI?' : 'Already have an account?';
    authToggle.textContent = login ? 'Create an account' : 'Sign in';
    authPassword.setAttribute('autocomplete', login ? 'current-password' : 'new-password');
    authError.hidden = true;
  }
  authToggle.addEventListener('click', function () { setAuthMode(authMode === 'login' ? 'register' : 'login'); });

  function checkAuth() {
    fetch('/api/auth/me').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (d && d.user) { setUser(d.user); authView.hidden = true; showProjects(); }
      else showAuth();
    }).catch(showAuth);
  }

  authForm.addEventListener('submit', function (e) {
    e.preventDefault();
    authError.hidden = true;
    var email = (authEmail.value || '').trim(), pw = authPassword.value || '';
    if (!email || !pw) { authError.textContent = 'Enter your email and password.'; authError.hidden = false; return; }
    if (authMode === 'register' && pw.length < 8) { authError.textContent = 'Password must be at least 8 characters.'; authError.hidden = false; return; }
    var body = { email: email, password: pw };
    if (authMode === 'register') body.name = (authName.value || '').trim();
    authSubmit.disabled = true; authSubmit.textContent = authMode === 'login' ? 'Signing in…' : 'Creating…';
    fetch('/api/auth/' + (authMode === 'login' ? 'login' : 'register'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        authSubmit.disabled = false; authSubmit.textContent = submitLabel();
        if (!res.ok) { authError.textContent = res.d.error || 'Something went wrong.'; authError.hidden = false; return; }
        setUser(res.d.user); authView.hidden = true; authForm.reset(); setAuthMode('login');
        toast('Welcome' + (res.d.user.name ? ', ' + res.d.user.name : '') + ' 👋', 'ok');
        showProjects();
      })
      .catch(function () { authSubmit.disabled = false; authSubmit.textContent = submitLabel(); authError.textContent = 'Network error — is the server running?'; authError.hidden = false; });
  });

  signoutBtn.addEventListener('click', function () {
    fetch('/api/auth/logout', { method: 'POST' }).then(function () {
      currentProject = null; allProjectCards = []; if (grid) grid.innerHTML = '';
      showAuth(); toast('Signed out', 'ok');
    });
  });

  // ---- Sign in with Google (real GIS when configured, demo otherwise) ----
  var googleBtn = document.getElementById('google-btn');
  var googleLabel = document.getElementById('google-btn-label');

  function finishAuth(user, greet) {
    setUser(user); authView.hidden = true; authForm.reset(); setAuthMode('login');
    if (greet) toast(greet, 'ok');
    showProjects();
  }
  function postGoogle(payload) {
    authError.hidden = true;
    fetch('/api/auth/google', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok) { authError.textContent = res.d.error || 'Google sign-in failed.'; authError.hidden = false; return; }
        finishAuth(res.d.user, 'Signed in with Google');
      })
      .catch(function () { authError.textContent = 'Network error during Google sign-in.'; authError.hidden = false; });
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script'); s.src = src; s.async = true; s.defer = true;
      s.onload = resolve; s.onerror = reject; document.head.appendChild(s);
    });
  }
  function setupGoogle() {
    fetch('/api/auth/config').then(function (r) { return r.json(); }).then(function (cfg) {
      if (cfg.googleClientId) {
        // Real Google Identity Services — render Google's own button.
        loadScript('https://accounts.google.com/gsi/client').then(function () {
          try {
            window.google.accounts.id.initialize({ client_id: cfg.googleClientId, callback: function (resp) { postGoogle({ credential: resp.credential }); } });
            var slot = document.createElement('div'); slot.style.display = 'flex'; slot.style.justifyContent = 'center';
            googleBtn.style.display = 'none'; googleBtn.parentNode.insertBefore(slot, googleBtn);
            window.google.accounts.id.renderButton(slot, { theme: 'outline', size: 'large', text: 'continue_with', width: 336 });
          } catch (e) { googleLabel.textContent = 'Google sign-in unavailable'; googleBtn.disabled = true; }
        }).catch(function () { googleLabel.textContent = 'Google unavailable (offline)'; googleBtn.disabled = true; });
      } else {
        // Demo mode — no real Google credentials configured.
        googleLabel.textContent = 'Continue with Google (demo)';
        googleBtn.addEventListener('click', function () {
          authError.hidden = true;
          var email = (authEmail.value || '').trim();
          if (!email) email = (window.prompt('Demo Google sign-in — enter a Gmail address:', 'you@gmail.com') || '').trim();
          if (!email) return;
          var name = (authName.value || '').trim() || email.split('@')[0];
          postGoogle({ demoEmail: email, demoName: name });
        });
      }
    }).catch(function () {});
  }

  // ================= MCP integrations (app as MCP client) =================
  var mcpBtn = document.getElementById('mcp-btn');
  var mcpModal = document.getElementById('mcp-modal');
  var mcpList = document.getElementById('mcp-list');
  var mcpConnect = document.getElementById('mcp-connect');
  var mcpName = document.getElementById('mcp-name');
  var mcpCommand = document.getElementById('mcp-command');
  var mcpArgs = document.getElementById('mcp-args');
  var mcpAddStatus = document.getElementById('mcp-add-status');
  var mcpAdd = document.getElementById('mcp-add');

  function openMcp() { mcpModal.hidden = false; loadMcpServers(); }
  function closeMcp() { mcpModal.hidden = true; }
  mcpBtn.addEventListener('click', openMcp);
  document.getElementById('mcp-close').addEventListener('click', closeMcp);
  mcpModal.addEventListener('click', function (e) { if (e.target === mcpModal) closeMcp(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !mcpModal.hidden) closeMcp(); });

  function loadMcpServers() {
    mcpList.innerHTML = '<div class="mcp-hint">Loading…</div>';
    fetch('/api/mcp/servers').then(function (r) { return r.json(); })
      .then(function (d) { renderMcpServers(d.servers || []); })
      .catch(function () { mcpList.innerHTML = '<div class="mcp-hint">Could not load servers.</div>'; });
  }
  function renderMcpServers(servers) {
    mcpList.innerHTML = servers.map(function (s) {
      var info = s.info ? escapeHtml(s.info.name + ' v' + (s.info.version || '')) : '';
      var tools = (s.tools || []).map(function (t) {
        return '<div class="mcp-tool" data-server="' + s.id + '" data-tool="' + escapeHtml(t.name) + '">' +
          '<div class="mcp-tool-head"><span class="mt-name">' + escapeHtml(t.name) + '</span><button type="button" class="mt-run">Run &#9656;</button></div>' +
          (t.description ? '<div class="mcp-tool-desc">' + escapeHtml(t.description) + '</div>' : '') +
          '<div class="mt-panel" hidden><textarea class="mt-args" spellcheck="false">{}</textarea><button type="button" class="btn small mt-exec">Run tool</button><pre class="mt-result" hidden></pre></div>' +
          '</div>';
      }).join('') || '<div class="mcp-hint">No tools reported.</div>';
      return '<div class="mcp-server">' +
        '<div class="mcp-server-head"><span class="mcp-name">' + escapeHtml(s.name) + '</span><span class="mcp-status ' + escapeHtml(s.status) + '">' + escapeHtml(s.status) + '</span><button type="button" class="mcp-del" data-del="' + s.id + '">Remove</button></div>' +
        (info ? '<div class="mcp-info">' + info + '</div>' : '') +
        '<div class="mcp-tools">' + tools + '</div></div>';
    }).join('');
  }

  mcpList.addEventListener('click', function (e) {
    var run = e.target.closest('.mt-run');
    if (run) { var panel = run.closest('.mcp-tool').querySelector('.mt-panel'); panel.hidden = !panel.hidden; return; }
    var exec = e.target.closest('.mt-exec');
    if (exec) { runMcpTool(exec.closest('.mcp-tool')); return; }
    var del = e.target.closest('[data-del]');
    if (del) { deleteMcpServer(del.getAttribute('data-del')); return; }
  });

  function runMcpTool(toolEl) {
    var sid = toolEl.getAttribute('data-server'), tool = toolEl.getAttribute('data-tool');
    var argsEl = toolEl.querySelector('.mt-args'), resEl = toolEl.querySelector('.mt-result'), execBtn = toolEl.querySelector('.mt-exec');
    var args;
    try { args = argsEl.value.trim() ? JSON.parse(argsEl.value) : {}; }
    catch (err) { resEl.hidden = false; resEl.className = 'mt-result err'; resEl.textContent = 'Invalid JSON arguments: ' + err.message; return; }
    execBtn.disabled = true; execBtn.textContent = 'Running…';
    fetch('/api/mcp/servers/' + sid + '/call', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tool: tool, arguments: args }) })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        execBtn.disabled = false; execBtn.textContent = 'Run tool'; resEl.hidden = false;
        if (!res.ok) { resEl.className = 'mt-result err'; resEl.textContent = res.d.error || 'Call failed.'; return; }
        var result = res.d.result || {};
        var text = (result.content || []).map(function (c) { return c.text || JSON.stringify(c); }).join('\n');
        resEl.className = 'mt-result' + (result.isError ? ' err' : ''); resEl.textContent = text || '(no content)';
      })
      .catch(function () { execBtn.disabled = false; execBtn.textContent = 'Run tool'; resEl.hidden = false; resEl.className = 'mt-result err'; resEl.textContent = 'Network error.'; });
  }

  function deleteMcpServer(id) {
    if (!window.confirm('Disconnect and remove this MCP server?')) return;
    fetch('/api/mcp/servers/' + id, { method: 'DELETE' }).then(function () { toast('MCP server removed', 'ok'); loadMcpServers(); });
  }

  mcpConnect.addEventListener('click', function () {
    var name = (mcpName.value || '').trim(), command = (mcpCommand.value || '').trim();
    var argStr = (mcpArgs.value || '').trim(), args = argStr ? argStr.split(/\s+/) : [];
    if (!command) { mcpAddStatus.textContent = 'Command required.'; mcpAddStatus.className = 'status err'; return; }
    mcpAddStatus.textContent = 'Connecting…'; mcpAddStatus.className = 'status'; mcpConnect.disabled = true;
    fetch('/api/mcp/servers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name, transport: 'stdio', command: command, args: args }) })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        mcpConnect.disabled = false;
        if (!res.ok) { mcpAddStatus.textContent = res.d.error || 'Failed to connect.'; mcpAddStatus.className = 'status err'; return; }
        mcpAddStatus.textContent = ''; mcpName.value = ''; mcpCommand.value = ''; mcpArgs.value = ''; mcpAdd.open = false;
        toast('Connected: ' + res.d.server.name + ' · ' + (res.d.server.tools || []).length + ' tools', 'ok');
        loadMcpServers();
      })
      .catch(function () { mcpConnect.disabled = false; mcpAddStatus.textContent = 'Network error.'; mcpAddStatus.className = 'status err'; });
  });

  // Gate the app behind the login journey.
  setAuthMode('login');
  setupGoogle();
  checkAuth();

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
})();
