/* ═══════════════════════════════════════════════════════════
   Glyndwr — image-editor.js
   Canvas-based image editor with layers, tools, history
   ═══════════════════════════════════════════════════════════ */
'use strict';

const ImageEditor = (() => {

  // ── State ──────────────────────────────────────────────────
  let layers = [];          // [{id, name, canvas, ctx, visible, opacity, locked}]
  let activeLayerIdx = 0;
  let currentTool = 'brush';
  let brushSize = 20;
  let brushColor = '#cc2800';
  let brushOpacity = 1.0;
  let isDrawing = false;
  let lastX = 0, lastY = 0;
  let history = [];         // snapshots for undo
  let historyIdx = -1;
  let currentImageId = null;
  let canvasW = 800, canvasH = 600;
  let adjustments = { brightness: 0, contrast: 0, saturation: 0 };
  let selectionRect = null; // {x,y,w,h} for rect selection
  let isSelecting = false;
  let selStartX = 0, selStartY = 0;
  let moveStart = null;

  const MAX_HISTORY = 20;

  // ── DOM refs ────────────────────────────────────────────────
  let mainCanvas, mainCtx, canvasArea;

  // ── Init ────────────────────────────────────────────────────
  function init() {
    mainCanvas = document.getElementById('main-canvas');
    if (!mainCanvas) return;
    mainCtx = mainCanvas.getContext('2d');
    canvasArea = document.getElementById('editor-canvas-area');

    _bindToolButtons();
    _bindBrushControls();
    _bindLayerControls();
    _bindHistoryButtons();
    _bindAdjustmentSliders();
    _bindSaveExport();
    _bindNewImage();

    // Load gallery list
    loadGalleryList();
  }

  // ── Tool buttons ────────────────────────────────────────────
  function _bindToolButtons() {
    const tools = ['brush','eraser','move','select-rect','crop','fill'];
    tools.forEach(t => {
      const btn = document.getElementById(`tool-${t}`);
      if (!btn) return;
      btn.addEventListener('click', () => setTool(t));
    });
  }

  function setTool(tool) {
    currentTool = tool;
    document.querySelectorAll('.editor-tool-btn').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById(`tool-${tool}`);
    if (btn) btn.classList.add('active');
    // Update cursor
    if (tool === 'move') {
      canvasArea.style.cursor = 'move';
    } else if (tool === 'select-rect') {
      canvasArea.style.cursor = 'crosshair';
    } else if (tool === 'eraser') {
      canvasArea.style.cursor = 'cell';
    } else if (tool === 'fill') {
      canvasArea.style.cursor = 'copy';
    } else {
      canvasArea.style.cursor = 'crosshair';
    }
  }

  // ── Brush controls ──────────────────────────────────────────
  function _bindBrushControls() {
    const sizeSlider = document.getElementById('brush-size-slider');
    const sizeVal = document.getElementById('brush-size-val');
    if (sizeSlider) {
      sizeSlider.addEventListener('input', () => {
        brushSize = parseInt(sizeSlider.value);
        if (sizeVal) sizeVal.textContent = brushSize + 'px';
      });
    }
    const colorPicker = document.getElementById('brush-color-picker');
    if (colorPicker) {
      colorPicker.addEventListener('input', () => { brushColor = colorPicker.value; });
    }
    const opacitySlider = document.getElementById('editor-opacity-slider');
    const opacityVal = document.getElementById('opacity-val');
    if (opacitySlider) {
      opacitySlider.addEventListener('input', () => {
        brushOpacity = parseInt(opacitySlider.value) / 100;
        if (opacityVal) opacityVal.textContent = opacitySlider.value + '%';
      });
    }
  }

  // ── Canvas pointer events ───────────────────────────────────
  function _bindCanvasEvents() {
    mainCanvas.addEventListener('mousedown', onPointerDown);
    mainCanvas.addEventListener('mousemove', onPointerMove);
    mainCanvas.addEventListener('mouseup', onPointerUp);
    mainCanvas.addEventListener('mouseleave', onPointerUp);
    mainCanvas.addEventListener('touchstart', e => {
      e.preventDefault();
      const t = e.touches[0];
      onPointerDown(_touchToMouse(t, mainCanvas));
    }, { passive: false });
    mainCanvas.addEventListener('touchmove', e => {
      e.preventDefault();
      const t = e.touches[0];
      onPointerMove(_touchToMouse(t, mainCanvas));
    }, { passive: false });
    mainCanvas.addEventListener('touchend', e => {
      e.preventDefault();
      onPointerUp();
    }, { passive: false });
  }

  function _touchToMouse(touch, el) {
    const rect = el.getBoundingClientRect();
    return {
      offsetX: (touch.clientX - rect.left) * (el.width / rect.width),
      offsetY: (touch.clientY - rect.top) * (el.height / rect.height),
    };
  }

  function onPointerDown(e) {
    if (!layers[activeLayerIdx]) return;
    const x = e.offsetX, y = e.offsetY;
    isDrawing = true;
    lastX = x; lastY = y;

    if (currentTool === 'select-rect') {
      isSelecting = true;
      selStartX = x; selStartY = y;
      selectionRect = null;
    } else if (currentTool === 'fill') {
      _floodFill(x, y);
      _composite();
      pushHistory();
    } else if (currentTool === 'brush' || currentTool === 'eraser') {
      _startStroke(x, y);
    }
  }

  function onPointerMove(e) {
    if (!isDrawing) return;
    const x = e.offsetX, y = e.offsetY;

    if (currentTool === 'select-rect' && isSelecting) {
      selectionRect = {
        x: Math.min(selStartX, x), y: Math.min(selStartY, y),
        w: Math.abs(x - selStartX), h: Math.abs(y - selStartY),
      };
      _composite();
      _drawSelectionOverlay();
    } else if (currentTool === 'brush') {
      _stroke(x, y, false);
    } else if (currentTool === 'eraser') {
      _stroke(x, y, true);
    } else if (currentTool === 'move') {
      if (!moveStart) { moveStart = {x, y}; return; }
      const dx = x - moveStart.x, dy = y - moveStart.y;
      moveStart = {x, y};
      _translateLayer(activeLayerIdx, dx, dy);
      _composite();
    }
    lastX = x; lastY = y;
  }

  function onPointerUp() {
    if (!isDrawing) return;
    isDrawing = false;
    isSelecting = false;
    moveStart = null;
    if (currentTool === 'brush' || currentTool === 'eraser') {
      pushHistory();
    }
  }

  // ── Drawing ─────────────────────────────────────────────────
  function _startStroke(x, y) {
    const layer = layers[activeLayerIdx];
    if (!layer || layer.locked) return;
    const c = layer.ctx;
    c.globalAlpha = brushOpacity;
    c.globalCompositeOperation = currentTool === 'eraser' ? 'destination-out' : 'source-over';
    c.strokeStyle = brushColor;
    c.lineWidth = brushSize;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + 0.1, y + 0.1);
    c.stroke();
    _composite();
  }

  function _stroke(x, y, erase) {
    const layer = layers[activeLayerIdx];
    if (!layer || layer.locked) return;
    const c = layer.ctx;
    c.globalAlpha = brushOpacity;
    c.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
    c.strokeStyle = brushColor;
    c.lineWidth = brushSize;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(lastX, lastY);
    c.lineTo(x, y);
    c.stroke();
    _composite();
  }

  function _translateLayer(idx, dx, dy) {
    const layer = layers[idx];
    if (!layer) return;
    const tmp = document.createElement('canvas');
    tmp.width = canvasW; tmp.height = canvasH;
    const tc = tmp.getContext('2d');
    tc.drawImage(layer.canvas, dx, dy);
    layer.ctx.clearRect(0, 0, canvasW, canvasH);
    layer.ctx.drawImage(tmp, 0, 0);
  }

  // ── Flood fill ──────────────────────────────────────────────
  function _floodFill(startX, startY) {
    const layer = layers[activeLayerIdx];
    if (!layer) return;
    const c = layer.ctx;
    const imgData = c.getImageData(0, 0, canvasW, canvasH);
    const data = imgData.data;
    const px = Math.floor(startX), py = Math.floor(startY);
    const idx = (py * canvasW + px) * 4;
    const targetR = data[idx], targetG = data[idx+1], targetB = data[idx+2], targetA = data[idx+3];
    const fillRgb = _hexToRgb(brushColor);
    if (!fillRgb) return;
    if (targetR === fillRgb.r && targetG === fillRgb.g && targetB === fillRgb.b) return;

    const stack = [[px, py]];
    const visited = new Uint8Array(canvasW * canvasH);

    function match(i) {
      return Math.abs(data[i] - targetR) < 30 &&
             Math.abs(data[i+1] - targetG) < 30 &&
             Math.abs(data[i+2] - targetB) < 30 &&
             Math.abs(data[i+3] - targetA) < 30;
    }

    while (stack.length) {
      const [cx, cy] = stack.pop();
      if (cx < 0 || cy < 0 || cx >= canvasW || cy >= canvasH) continue;
      const i = (cy * canvasW + cx) * 4;
      if (visited[cy * canvasW + cx]) continue;
      if (!match(i)) continue;
      visited[cy * canvasW + cx] = 1;
      data[i] = fillRgb.r; data[i+1] = fillRgb.g; data[i+2] = fillRgb.b; data[i+3] = Math.round(brushOpacity * 255);
      stack.push([cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]);
    }
    c.putImageData(imgData, 0, 0);
  }

  function _hexToRgb(hex) {
    const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return r ? { r: parseInt(r[1],16), g: parseInt(r[2],16), b: parseInt(r[3],16) } : null;
  }

  // ── Composite all layers onto main canvas ───────────────────
  function _composite() {
    mainCtx.clearRect(0, 0, canvasW, canvasH);
    // Checkerboard background for transparency
    _drawCheckerboard();
    layers.forEach(layer => {
      if (!layer.visible) return;
      mainCtx.globalAlpha = layer.opacity;
      mainCtx.globalCompositeOperation = 'source-over';
      // Apply adjustments
      const adj = adjustments;
      if (adj.brightness !== 0 || adj.contrast !== 0 || adj.saturation !== 0) {
        const f = [];
        if (adj.brightness !== 0) f.push(`brightness(${1 + adj.brightness/100})`);
        if (adj.contrast !== 0) f.push(`contrast(${1 + adj.contrast/100})`);
        if (adj.saturation !== 0) f.push(`saturate(${1 + adj.saturation/100})`);
        mainCtx.filter = f.join(' ');
      } else {
        mainCtx.filter = 'none';
      }
      mainCtx.drawImage(layer.canvas, 0, 0);
    });
    mainCtx.globalAlpha = 1;
    mainCtx.filter = 'none';
  }

  function _drawCheckerboard() {
    const size = 10;
    for (let y = 0; y < canvasH; y += size) {
      for (let x = 0; x < canvasW; x += size) {
        mainCtx.fillStyle = ((x / size + y / size) % 2 === 0) ? '#c0c0c0' : '#808080';
        mainCtx.fillRect(x, y, size, size);
      }
    }
  }

  function _drawSelectionOverlay() {
    if (!selectionRect) return;
    mainCtx.save();
    mainCtx.strokeStyle = '#00aaff';
    mainCtx.lineWidth = 1;
    mainCtx.setLineDash([4, 4]);
    mainCtx.strokeRect(selectionRect.x, selectionRect.y, selectionRect.w, selectionRect.h);
    mainCtx.restore();
  }

  // ── Layers ──────────────────────────────────────────────────
  function _bindLayerControls() {
    const addBtn = document.getElementById('add-layer-btn');
    if (addBtn) addBtn.addEventListener('click', addLayer);
  }

  function addLayer(name) {
    const id = 'layer-' + Date.now();
    const c = document.createElement('canvas');
    c.width = canvasW; c.height = canvasH;
    const layer = {
      id, name: name || `Layer ${layers.length + 1}`,
      canvas: c, ctx: c.getContext('2d'),
      visible: true, opacity: 1.0, locked: false,
    };
    layers.push(layer);
    activeLayerIdx = layers.length - 1;
    renderLayersList();
    _composite();
    pushHistory();
  }

  function removeLayer(idx) {
    if (layers.length <= 1) return;
    layers.splice(idx, 1);
    activeLayerIdx = Math.max(0, Math.min(activeLayerIdx, layers.length - 1));
    renderLayersList();
    _composite();
    pushHistory();
  }

  function toggleLayerVisibility(idx) {
    layers[idx].visible = !layers[idx].visible;
    renderLayersList();
    _composite();
  }

  function flattenLayers() {
    const merged = document.createElement('canvas');
    merged.width = canvasW; merged.height = canvasH;
    const mc = merged.getContext('2d');
    layers.forEach(l => { if (l.visible) mc.drawImage(l.canvas, 0, 0); });
    layers = [{
      id: 'layer-flat', name: 'Background',
      canvas: merged, ctx: mc,
      visible: true, opacity: 1, locked: false,
    }];
    activeLayerIdx = 0;
    renderLayersList();
    _composite();
    pushHistory();
  }

  function renderLayersList() {
    const list = document.getElementById('layers-list');
    if (!list) return;
    list.innerHTML = '';
    // Render in reverse (top layer first)
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i];
      const item = document.createElement('div');
      item.className = 'layer-item' + (i === activeLayerIdx ? ' active' : '');
      item.dataset.idx = i;
      item.addEventListener('click', () => { activeLayerIdx = i; renderLayersList(); });

      // Thumbnail
      const thumb = document.createElement('canvas');
      thumb.width = 32; thumb.height = 24; thumb.className = 'layer-thumbnail';
      thumb.getContext('2d').drawImage(layer.canvas, 0, 0, 32, 24);
      item.appendChild(thumb);

      const name = document.createElement('span');
      name.className = 'layer-name';
      name.textContent = layer.name;
      item.appendChild(name);

      const visBtn = document.createElement('button');
      visBtn.className = 'layer-visibility-btn' + (layer.visible ? '' : ' hidden');
      visBtn.innerHTML = layer.visible
        ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
        : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
      visBtn.addEventListener('click', e => { e.stopPropagation(); toggleLayerVisibility(i); });
      item.appendChild(visBtn);

      if (layers.length > 1) {
        const delBtn = document.createElement('button');
        delBtn.className = 'layer-delete-btn';
        delBtn.innerHTML = '✕';
        delBtn.addEventListener('click', e => { e.stopPropagation(); removeLayer(i); });
        item.appendChild(delBtn);
      }

      list.appendChild(item);
    }
  }

  // ── Adjustments ─────────────────────────────────────────────
  function _bindAdjustmentSliders() {
    ['brightness','contrast','saturation'].forEach(adj => {
      const el = document.getElementById(`adj-${adj}`);
      const val = document.getElementById(`${adj}-val`);
      if (!el) return;
      el.addEventListener('input', () => {
        adjustments[adj] = parseInt(el.value);
        if (val) val.textContent = el.value;
        _composite();
      });
    });
    const flatBtn = document.getElementById('flatten-btn');
    if (flatBtn) flatBtn.addEventListener('click', flattenLayers);
  }

  // ── History ──────────────────────────────────────────────────
  function pushHistory() {
    // Trim future
    if (historyIdx < history.length - 1) {
      history = history.slice(0, historyIdx + 1);
    }
    // Snapshot all layers
    const snap = layers.map(l => {
      const c = document.createElement('canvas');
      c.width = canvasW; c.height = canvasH;
      c.getContext('2d').drawImage(l.canvas, 0, 0);
      return { ...l, canvas: c, ctx: c.getContext('2d') };
    });
    history.push(snap);
    if (history.length > MAX_HISTORY) history.shift();
    historyIdx = history.length - 1;
    _updateHistoryBtns();
  }

  function undo() {
    if (historyIdx <= 0) return;
    historyIdx--;
    _restoreSnapshot(history[historyIdx]);
  }

  function redo() {
    if (historyIdx >= history.length - 1) return;
    historyIdx++;
    _restoreSnapshot(history[historyIdx]);
  }

  function _restoreSnapshot(snap) {
    layers = snap.map(l => {
      const c = document.createElement('canvas');
      c.width = canvasW; c.height = canvasH;
      c.getContext('2d').drawImage(l.canvas, 0, 0);
      return { ...l, canvas: c, ctx: c.getContext('2d') };
    });
    activeLayerIdx = Math.min(activeLayerIdx, layers.length - 1);
    renderLayersList();
    _composite();
    _updateHistoryBtns();
  }

  function _updateHistoryBtns() {
    const u = document.getElementById('undo-btn');
    const r = document.getElementById('redo-btn');
    if (u) u.disabled = historyIdx <= 0;
    if (r) r.disabled = historyIdx >= history.length - 1;
  }

  function _bindHistoryButtons() {
    const u = document.getElementById('undo-btn');
    const r = document.getElementById('redo-btn');
    if (u) u.addEventListener('click', undo);
    if (r) r.addEventListener('click', redo);

    document.addEventListener('keydown', e => {
      const active = document.getElementById('section-gallery');
      if (!active || !active.classList.contains('active')) return;
      if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
      if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); redo(); }
    });
  }

  // ── New image ────────────────────────────────────────────────
  function _bindNewImage() {
    const newBtn = document.getElementById('new-image-btn');
    const newEmptyBtn = document.getElementById('new-image-empty-btn');
    const overlay = document.getElementById('new-image-overlay');
    const createBtn = document.getElementById('create-image-btn');

    const open = () => {
      if (overlay) overlay.classList.remove('hidden');
    };
    if (newBtn) newBtn.addEventListener('click', open);
    if (newEmptyBtn) newEmptyBtn.addEventListener('click', open);

    if (createBtn) {
      createBtn.addEventListener('click', () => {
        const name = document.getElementById('new-img-name').value.trim() || 'Untitled';
        const w = parseInt(document.getElementById('new-img-width').value) || 800;
        const h = parseInt(document.getElementById('new-img-height').value) || 600;
        const bg = document.getElementById('new-img-bg').value;
        if (overlay) overlay.classList.add('hidden');
        createNewImage(name, w, h, bg);
      });
    }
  }

  function createNewImage(name, w, h, bg) {
    canvasW = w; canvasH = h;
    currentImageId = null;
    history = []; historyIdx = -1;
    layers = [];

    mainCanvas.width = w; mainCanvas.height = h;
    mainCanvas.style.display = 'block';
    const emptyState = document.getElementById('editor-empty-state');
    if (emptyState) emptyState.style.display = 'none';

    // Background layer
    const bgCanvas = document.createElement('canvas');
    bgCanvas.width = w; bgCanvas.height = h;
    const bgCtx = bgCanvas.getContext('2d');
    if (bg === 'white') { bgCtx.fillStyle = '#ffffff'; bgCtx.fillRect(0,0,w,h); }
    else if (bg === 'black') { bgCtx.fillStyle = '#000000'; bgCtx.fillRect(0,0,w,h); }
    layers.push({ id: 'layer-bg', name: 'Background', canvas: bgCanvas, ctx: bgCtx, visible: true, opacity: 1, locked: false });
    activeLayerIdx = 0;

    // Paint layer
    addLayer('Paint');

    const nameInput = document.getElementById('editor-file-name');
    if (nameInput) nameInput.value = name;

    const label = document.getElementById('canvas-size-label');
    if (label) label.textContent = `${w} × ${h}`;

    _bindCanvasEvents();
    renderLayersList();
    _composite();
    pushHistory();
    _updateHistoryBtns();
  }

  // ── Save / Export ────────────────────────────────────────────
  function _bindSaveExport() {
    const saveBtn = document.getElementById('save-image-btn');
    if (saveBtn) saveBtn.addEventListener('click', saveImage);
    const exportBtn = document.getElementById('export-image-btn');
    if (exportBtn) exportBtn.addEventListener('click', exportPng);
  }

  async function saveImage() {
    // Flatten to a single PNG data URL
    const flat = document.createElement('canvas');
    flat.width = canvasW; flat.height = canvasH;
    const fc = flat.getContext('2d');
    layers.forEach(l => { if (l.visible) fc.drawImage(l.canvas, 0, 0); });

    const data = flat.toDataURL('image/png');
    // Thumbnail
    const thumb = document.createElement('canvas');
    thumb.width = 160; thumb.height = 120;
    thumb.getContext('2d').drawImage(flat, 0, 0, 160, 120);
    const thumbnail = thumb.toDataURL('image/jpeg', 0.7);

    const name = document.getElementById('editor-file-name').value.trim() || 'Untitled';
    const token = localStorage.getItem('glyndwr_token') || '';

    try {
      if (currentImageId) {
        await fetch(`/api/gallery/${currentImageId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ name, data, thumbnail, width: canvasW, height: canvasH }),
        });
      } else {
        const r = await fetch('/api/gallery/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ name, data, thumbnail, width: canvasW, height: canvasH }),
        });
        const d = await r.json();
        currentImageId = d.id;
      }
      // Refresh gallery list
      loadGalleryList();
      if (typeof showToast === 'function') showToast('Image saved', 'success');
    } catch (err) {
      if (typeof showToast === 'function') showToast('Save failed: ' + err.message, 'error');
    }
  }

  function exportPng() {
    const flat = document.createElement('canvas');
    flat.width = canvasW; flat.height = canvasH;
    const fc = flat.getContext('2d');
    layers.forEach(l => { if (l.visible) fc.drawImage(l.canvas, 0, 0); });
    const url = flat.toDataURL('image/png');
    const a = document.createElement('a');
    const name = document.getElementById('editor-file-name').value.trim() || 'image';
    a.download = name.replace(/\s+/g, '-') + '.png';
    a.href = url;
    a.click();
  }

  // ── Gallery list ─────────────────────────────────────────────
  async function loadGalleryList() {
    const list = document.getElementById('gallery-list');
    if (!list) return;
    const token = localStorage.getItem('glyndwr_token') || '';
    try {
      const r = await fetch('/api/gallery/', { headers: { Authorization: `Bearer ${token}` } });
      const items = await r.json();
      list.innerHTML = '';
      if (items.length === 0) {
        list.innerHTML = '<div class="gallery-empty">No images yet.<br>Create one with the + button.</div>';
        return;
      }
      items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'gallery-thumb-card' + (item.id === currentImageId ? ' active' : '');
        card.dataset.id = item.id;
        if (item.thumbnail) {
          const img = document.createElement('img');
          img.src = item.thumbnail;
          img.alt = item.name;
          card.appendChild(img);
        } else {
          card.style.background = 'var(--panel2)';
        }
        const nameEl = document.createElement('div');
        nameEl.className = 'gallery-thumb-name';
        nameEl.textContent = item.name;
        card.appendChild(nameEl);
        card.addEventListener('click', () => openGalleryItem(item.id));
        list.appendChild(card);
      });
    } catch {}
  }

  async function openGalleryItem(id) {
    const token = localStorage.getItem('glyndwr_token') || '';
    try {
      const r = await fetch(`/api/gallery/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      const item = await r.json();
      currentImageId = id;
      canvasW = item.width || 800;
      canvasH = item.height || 600;
      history = []; historyIdx = -1;
      layers = [];

      mainCanvas.width = canvasW; mainCanvas.height = canvasH;
      mainCanvas.style.display = 'block';
      const emptyState = document.getElementById('editor-empty-state');
      if (emptyState) emptyState.style.display = 'none';

      // Load image data into base layer
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = canvasW; c.height = canvasH;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        layers = [{ id: 'layer-bg', name: 'Background', canvas: c, ctx, visible: true, opacity: 1, locked: false }];
        activeLayerIdx = 0;
        const nameInput = document.getElementById('editor-file-name');
        if (nameInput) nameInput.value = item.name;
        const label = document.getElementById('canvas-size-label');
        if (label) label.textContent = `${canvasW} × ${canvasH}`;
        _bindCanvasEvents();
        renderLayersList();
        _composite();
        pushHistory();
        _updateHistoryBtns();
        loadGalleryList();
      };
      img.src = item.data;
    } catch (err) {
      if (typeof showToast === 'function') showToast('Failed to open image', 'error');
    }
  }

  // ── Public API ───────────────────────────────────────────────
  return { init, createNewImage, openGalleryItem, loadGalleryList, undo, redo, saveImage, exportPng };
})();

// Auto-init when DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', ImageEditor.init);
} else {
  ImageEditor.init();
}
