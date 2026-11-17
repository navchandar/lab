
/**
 * Core Application Controller
 * Handles image ingestion, SVG coordinate transforms, polygon geometry manipulation,
 * state persistence, error handling, and real-time JSON export.
 */
'use strict';
// -------------------------------------------------------------
// Toast Notification Utility (User-friendly feedback & error reporting)
// -------------------------------------------------------------
function showToast(message, type = 'info') {
  try {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    const bgStyles = {
      info: 'bg-slate-900/90 text-white border-slate-700',
      success: 'bg-emerald-950/90 text-emerald-200 border-emerald-700',
      warning: 'bg-amber-950/90 text-amber-200 border-amber-700',
      error: 'bg-rose-950/90 text-rose-200 border-rose-700'
    };
    toast.className = `pointer-events-auto px-4 py-2.5 rounded-xl border text-xs font-medium shadow-2xl backdrop-blur-md transition-all duration-300 transform translate-y-3 opacity-0 flex items-center gap-2 ${bgStyles[type] || bgStyles.info}`;
    toast.textContent = message;
    container.appendChild(toast);
    // Fade in
    requestAnimationFrame(() => {
      toast.classList.remove('translate-y-3', 'opacity-0');
    });
    // Auto dismiss after 3 seconds
    setTimeout(() => {
      toast.classList.add('opacity-0', 'translate-y-2');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  } catch (err) {
    console.error('Toast execution failed:', err);
  }
}
// -------------------------------------------------------------
// Application State & References
// -------------------------------------------------------------
const state = {
  imageMeta: { width: 0, height: 0, loaded: false, fileName: 'sample' },
  zones: [],
  selectedId: null,
  nextId: 1,
  dragMode: null, // 'point' | 'shape' | null
  activeZone: null,
  activePointIndex: -1,
  dragStartPos: { x: 0, y: 0 },
  initialPointsSnapshot: []
};
// Cached DOM Elements
const DOM = {
  fileInput: document.getElementById('fileInput'),
  imageElement: document.getElementById('imageElement'),
  svgOverlay: document.getElementById('svgOverlay'),
  stage: document.getElementById('stage'),
  emptyState: document.getElementById('emptyState'),
  instructions: document.getElementById('instructions'),
  addRoiBtn: document.getElementById('addRoiBtn'),
  addExclusionBtn: document.getElementById('addExclusionBtn'),
  zoneList: document.getElementById('zoneList'),
  zoneCountBadge: document.getElementById('zoneCountBadge'),
  jsonOutput: document.getElementById('jsonOutput'),
  copyJsonBtn: document.getElementById('copyJsonBtn'),
  themeToggleBtn: document.getElementById('themeToggleBtn'),
  sunIcon: document.getElementById('sunIcon'),
  moonIcon: document.getElementById('moonIcon')
};
// -------------------------------------------------------------
// Dark / Light Theme Controller
// -------------------------------------------------------------
function applyTheme(isDark) {
  try {
    if (isDark) {
      document.documentElement.classList.add('dark');
      DOM.sunIcon.classList.remove('hidden');
      DOM.moonIcon.classList.add('hidden');
    } else {
      document.documentElement.classList.remove('dark');
      DOM.sunIcon.classList.add('hidden');
      DOM.moonIcon.classList.remove('hidden');
    }
  } catch (err) {
    console.error('Error applying theme:', err);
  }
}
function initTheme() {
  try {
    const savedTheme = localStorage.getItem('polyzone_theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(savedTheme ? savedTheme === 'dark' : prefersDark);
    // Watch OS system level switches
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!localStorage.getItem('polyzone_theme')) {
        applyTheme(e.matches);
      }
    });
    DOM.themeToggleBtn.addEventListener('click', () => {
      const isCurrentlyDark = document.documentElement.classList.contains('dark');
      const nextTheme = !isCurrentlyDark;
      applyTheme(nextTheme);
      try {
        localStorage.setItem('polyzone_theme', nextTheme ? 'dark' : 'light');
      } catch (storageErr) {
        console.warn('Storage unavailable:', storageErr);
      }
    });
  } catch (err) {
    console.error('Theme initialization error:', err);
  }
}
// -------------------------------------------------------------
// Image Loader & Input Handlers
// -------------------------------------------------------------
function handleFile(file) {
  try {
    if (!file) return;
    if (!file.type || !file.type.startsWith('image/')) {
      showToast('Please upload a valid image file (PNG, JPG, WebP, etc.).', 'error');
      return;
    }
    state.imageMeta.fileName = file.name.replace(/\.[^/.]+$/, '');
    const reader = new FileReader();
    reader.onerror = () => {
      showToast('Failed to read the selected file.', 'error');
    };
    reader.onload = (event) => {
      const img = new Image();
      img.onerror = () => {
        showToast('Image data could not be parsed.', 'error');
      };
      img.onload = () => {
        try {
          state.imageMeta.width = img.naturalWidth || 800;
          state.imageMeta.height = img.naturalHeight || 600;
          state.imageMeta.loaded = true;
          DOM.imageElement.src = event.target.result;
          DOM.svgOverlay.setAttribute('viewBox', `0 0 ${state.imageMeta.width} ${state.imageMeta.height}`);
          DOM.emptyState.classList.add('hidden');
          DOM.stage.classList.remove('hidden');
          DOM.instructions.classList.remove('hidden');
          DOM.addRoiBtn.disabled = false;
          DOM.addExclusionBtn.disabled = false;
          state.zones = [];
          state.nextId = 1;
          render();
          showToast(`Loaded ${file.name} (${state.imageMeta.width}×${state.imageMeta.height}px)`, 'success');
        } catch (setupErr) {
          console.error('Error rendering loaded image:', setupErr);
          showToast('Failed to display the uploaded image.', 'error');
        }
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  } catch (err) {
    console.error('File intake failure:', err);
    showToast('An unexpected error occurred while loading the file.', 'error');
  }
}
// -------------------------------------------------------------
// Zone Creation (ROI vs Exclusion Areas)
// -------------------------------------------------------------
function createZone(isExclusion = false) {
  try {
    if (!state.imageMeta.loaded) {
      showToast('Please load an image first.', 'warning');
      return;
    }
    const { width: w, height: h } = state.imageMeta;
    const boxW = Math.round(w * 0.28);
    const boxH = Math.round(h * 0.28);
    const offset = (state.zones.length * 24) % Math.round(w * 0.2);
    const startX = Math.round((w - boxW) / 2 + offset);
    const startY = Math.round((h - boxH) / 2 + offset);
    const action = isExclusion ? 'exclusion' : 'inclusion';
    const type = isExclusion ? 'exclusion' : 'crop';
    const count = state.zones.filter(x => x.action === action).length + 1;
    const name = isExclusion 
      ? `${state.imageMeta.fileName}_EA${count}`
      : `${state.imageMeta.fileName}_ROI${count}`;
    const newZone = {
      id: state.nextId++,
      name: name,
      action: action,
      type: type,
      template: '',
      area: [
        { x: startX, y: startY },
        { x: startX + boxW, y: startY },
        { x: startX + boxW, y: startY + boxH },
        { x: startX, y: startY + boxH }
      ]
    };
    state.zones.push(newZone);
    state.selectedId = newZone.id;
    render();
    showToast(`Added ${newZone.name}`, 'info');
  } catch (err) {
    console.error('Error creating new zone:', err);
    showToast('Failed to create zone.', 'error');
  }
}
// -------------------------------------------------------------
// Coordinate Transformation (Client Screen to SVG Pixel Space)
// -------------------------------------------------------------
function getSvgCoordinates(evt) {
  try {
    const pt = DOM.svgOverlay.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    const ctm = DOM.svgOverlay.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const cursorPt = pt.matrixTransform(ctm.inverse());
    return {
      x: Math.round(Math.max(0, Math.min(state.imageMeta.width, cursorPt.x))),
      y: Math.round(Math.max(0, Math.min(state.imageMeta.height, cursorPt.y)))
    };
  } catch (err) {
    console.error('SVG coordinate translation error:', err);
    return { x: 0, y: 0 };
  }
}
// -------------------------------------------------------------
// Mouse & Gesture Event Handlers
// -------------------------------------------------------------
function initInteractions() {
  // Mouse down on vertices or polygon body
  DOM.svgOverlay.addEventListener('mousedown', (e) => {
    try {
      if (!state.imageMeta.loaded) return;
      // 1. Check Vertex Point Click
      if (e.target.dataset.pointIndex !== undefined) {
        e.preventDefault();
        const id = parseInt(e.target.dataset.zoneId, 10);
        state.activeZone = state.zones.find(z => z.id === id);
        state.selectedId = id;
        state.activePointIndex = parseInt(e.target.dataset.pointIndex, 10);
        state.dragMode = 'point';
        render();
        return;
      }
      // 2. Check Polygon Surface Click
      if (e.target.dataset.shapeZoneId) {
        e.preventDefault();
        const id = parseInt(e.target.dataset.shapeZoneId, 10);
        state.activeZone = state.zones.find(z => z.id === id);
        state.selectedId = id;
        state.dragMode = 'shape';
        state.dragStartPos = getSvgCoordinates(e);
        state.initialPointsSnapshot = state.activeZone.area.map(p => ({ ...p }));
        render();
        return;
      }
    } catch (err) {
      console.error('Error in SVG mousedown:', err);
    }
  });
  // Global mousemove for smooth dragging outside SVG bounds
  window.addEventListener('mousemove', (e) => {
    try {
      if (!state.dragMode || !state.activeZone) return;
      const current = getSvgCoordinates(e);
      if (state.dragMode === 'point') {
        if (state.activePointIndex >= 0 && state.activeZone.area[state.activePointIndex]) {
          state.activeZone.area[state.activePointIndex] = { x: current.x, y: current.y };
          render();
        }
      } else if (state.dragMode === 'shape') {
        const dx = current.x - state.dragStartPos.x;
        const dy = current.y - state.dragStartPos.y;
        // Keep all points inside boundary
        let validDx = dx;
        let validDy = dy;
        state.initialPointsSnapshot.forEach(p => {
          if (p.x + validDx < 0) validDx = -p.x;
          if (p.x + validDx > state.imageMeta.width) validDx = state.imageMeta.width - p.x;
          if (p.y + validDy < 0) validDy = -p.y;
          if (p.y + validDy > state.imageMeta.height) validDy = state.imageMeta.height - p.y;
        });
        state.activeZone.area = state.initialPointsSnapshot.map(p => ({
          x: Math.round(p.x + validDx),
          y: Math.round(p.y + validDy)
        }));
        render();
      }
    } catch (err) {
      console.error('Error in window mousemove:', err);
    }
  });
  // Mouse up cleanup
  window.addEventListener('mouseup', () => {
    state.dragMode = null;
    state.activeZone = null;
    state.activePointIndex = -1;
  });
  // Right-click vertex deletion (retains minimum 3 vertices)
  DOM.svgOverlay.addEventListener('contextmenu', (e) => {
    try {
      if (e.target.dataset.pointIndex !== undefined) {
        e.preventDefault();
        const id = parseInt(e.target.dataset.zoneId, 10);
        const ptIndex = parseInt(e.target.dataset.pointIndex, 10);
        const zone = state.zones.find(z => z.id === id);
        if (zone) {
          if (zone.area.length <= 3) {
            showToast('A polygon must contain at least 3 vertices.', 'warning');
            return;
          }
          zone.area.splice(ptIndex, 1);
          render();
          showToast('Removed vertex point.', 'info');
        }
      }
    } catch (err) {
      console.error('Error deleting vertex on contextmenu:', err);
    }
  });
}
// -------------------------------------------------------------
// Zone Mutations (Global Functions)
// -------------------------------------------------------------
window.deleteZone = function(id) {
  try {
    state.zones = state.zones.filter(z => z.id !== id);
    if (state.selectedId === id) state.selectedId = state.zones[0]?.id || null;
    render();
    showToast('Zone removed.', 'info');
  } catch (err) {
    console.error('Error deleting zone:', err);
  }
};
window.insertPointOnEdge = function(id, afterIndex, x, y) {
  try {
    const zone = state.zones.find(z => z.id === id);
    if (!zone) return;
    zone.area.splice(afterIndex + 1, 0, { x, y });
    state.selectedId = id;
    render();
    showToast('Vertex inserted along edge.', 'info');
  } catch (err) {
    console.error('Error inserting vertex on edge:', err);
  }
};
// -------------------------------------------------------------
// Visual Rendering Engine
// -------------------------------------------------------------
function render() {
  try {
    DOM.svgOverlay.innerHTML = '';
    state.zones.forEach(zone => {
      const isInclusion = zone.action === 'inclusion';
      const isSelected = zone.id === state.selectedId;
      const strokeColor = isInclusion ? 'rgb(16, 185, 129)' : 'rgb(244, 63, 94)';
      const fillColor = isInclusion ? 'rgba(16, 185, 129, 0.28)' : 'rgba(244, 63, 94, 0.28)';
      // 1. Draw SVG Polygon
      const pointsStr = zone.area.map(p => `${p.x},${p.y}`).join(' ');
      const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      poly.setAttribute('points', pointsStr);
      poly.setAttribute('fill', fillColor);
      poly.setAttribute('stroke', strokeColor);
      poly.setAttribute('stroke-width', isSelected ? '3.5' : '2');
      poly.setAttribute('data-shape-zone-id', zone.id);
      poly.classList.add('shape-polygon');
      DOM.svgOverlay.appendChild(poly);
      // 2. Draw Midpoint Insertion (+) Handles
      for (let i = 0; i < zone.area.length; i++) {
        const p1 = zone.area[i];
        const p2 = zone.area[(i + 1) % zone.area.length];
        const midX = Math.round((p1.x + p2.x) / 2);
        const midY = Math.round((p1.y + p2.y) / 2);
        const addHandle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        addHandle.setAttribute('cx', midX);
        addHandle.setAttribute('cy', midY);
        addHandle.setAttribute('r', '4.5');
        addHandle.setAttribute('fill', '#f59e0b');
        addHandle.setAttribute('stroke', '#ffffff');
        addHandle.setAttribute('stroke-width', '1.5');
        addHandle.setAttribute('cursor', 'copy');
        addHandle.setAttribute('opacity', '0.75');
        addHandle.classList.add('edge-add-handle');
        addHandle.title = 'Click to insert vertex here';
        addHandle.addEventListener('click', (e) => {
          e.stopPropagation();
          window.insertPointOnEdge(zone.id, i, midX, midY);
        });
        DOM.svgOverlay.appendChild(addHandle);
      }
      // 3. Draw Vertex Handles
      zone.area.forEach((pt, idx) => {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', pt.x);
        circle.setAttribute('cy', pt.y);
        circle.setAttribute('r', '6');
        circle.setAttribute('fill', '#ffffff');
        circle.setAttribute('stroke', strokeColor);
        circle.setAttribute('stroke-width', '2.5');
        circle.setAttribute('cursor', 'pointer');
        circle.setAttribute('data-zone-id', zone.id);
        circle.setAttribute('data-point-index', idx);
        circle.classList.add('vertex-handle');
        circle.title = `Vertex #${idx + 1} (Right-click to remove)`;
        DOM.svgOverlay.appendChild(circle);
      });
    });
    // 4. Update Sidebar Drawer
    DOM.zoneCountBadge.innerText = state.zones.length;
    if (state.zones.length === 0) {
      DOM.zoneList.innerHTML = '<p class="text-xs text-slate-400 dark:text-slate-500 italic py-2 text-center">No zones created yet.</p>';
    } else {
      DOM.zoneList.innerHTML = state.zones.map(z => `
        <div class="group flex items-center justify-between p-2 rounded-xl text-xs border transition-all ${
          z.id === state.selectedId 
            ? 'bg-white/90 dark:bg-slate-800/90 border-slate-300 dark:border-slate-700 shadow-sm' 
            : 'bg-white/40 dark:bg-slate-900/40 border-slate-200/80 dark:border-slate-800/80 hover:bg-white/80 dark:hover:bg-slate-800/60'
        }">
          <div class="flex items-center gap-2 cursor-pointer flex-1 min-w-0" onclick="state.selectedId = ${z.id}; render();">
            <span class="w-2.5 h-2.5 rounded-full flex-shrink-0 ${z.action === 'inclusion' ? 'bg-emerald-500 ring-2 ring-emerald-500/20' : 'bg-rose-500 ring-2 ring-rose-500/20'}"></span>
            <span class="font-medium truncate text-slate-800 dark:text-slate-200">${z.name}</span>
            <span class="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60">${z.type}</span>
            <span class="text-slate-400 text-[11px]">(${z.area.length} pts)</span>
          </div>
          <button onclick="window.deleteZone(${z.id})" class="text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 px-1 py-0.5 transition font-bold text-sm" title="Delete Zone">
            &times;
          </button>
        </div>
      `).join('');
    }
    // 5. Update JSON payload preview
    updateJsonOutput();
  } catch (err) {
    console.error('Render failure:', err);
  }
}
// -------------------------------------------------------------
// Real-time JSON Serialization & Clipboard
// -------------------------------------------------------------
function updateJsonOutput() {
  try {
    const payload = {
      file_name: state.imageMeta.fileName,
      roi: state.zones.map(item => ({
        id: item.id,
        name: item.name,
        action: item.action,
        type: item.type,
        template: item.template || '',
        area: item.area.map(pt => ({
          x: pt.x,
          y: pt.y
        }))
      }))
    };
    DOM.jsonOutput.textContent = JSON.stringify(payload, null, 2);
  } catch (err) {
    console.error('Error generating JSON:', err);
    DOM.jsonOutput.textContent = '{\n  "error": "Failed to serialize JSON coordinates"\n}';
  }
}
// -------------------------------------------------------------
// Event Listeners Initialization
// -------------------------------------------------------------
function initApp() {
  initTheme();
  initInteractions();
  // File Upload via Input
  DOM.fileInput.addEventListener('change', (e) => {
    handleFile(e.target.files && e.target.files[0]);
  });
  // Empty State Click to Trigger Upload
  DOM.emptyState.addEventListener('click', () => {
    DOM.fileInput.click();
  });
  // Keyboard accessibility for Empty State
  DOM.emptyState.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      DOM.fileInput.click();
    }
  });
  // Drag and Drop files onto Empty State
  DOM.emptyState.addEventListener('dragover', (e) => {
    e.preventDefault();
    DOM.emptyState.classList.add('border-indigo-500', 'bg-indigo-50/40', 'dark:bg-indigo-950/40');
  });
  DOM.emptyState.addEventListener('dragleave', (e) => {
    e.preventDefault();
    DOM.emptyState.classList.remove('border-indigo-500', 'bg-indigo-50/40', 'dark:bg-indigo-950/40');
  });
  DOM.emptyState.addEventListener('drop', (e) => {
    e.preventDefault();
    DOM.emptyState.classList.remove('border-indigo-500', 'bg-indigo-50/40', 'dark:bg-indigo-950/40');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  });
  // Button actions
  DOM.addRoiBtn.addEventListener('click', () => createZone(false));
  DOM.addExclusionBtn.addEventListener('click', () => createZone(true));
  // Copy JSON
  DOM.copyJsonBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(DOM.jsonOutput.textContent);
      const originalHtml = DOM.copyJsonBtn.innerHTML;
      DOM.copyJsonBtn.innerHTML = '<span class="text-emerald-500 font-bold">✓ Copied</span>';
      setTimeout(() => {
        DOM.copyJsonBtn.innerHTML = originalHtml;
      }, 1600);
      showToast('Coordinates copied to clipboard!', 'success');
    } catch (err) {
      console.error('Clipboard copy failed:', err);
      showToast('Could not copy to clipboard. Please copy manually.', 'error');
    }
  });
}
// Start application once DOM is loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}