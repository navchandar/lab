const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const previewCanvas = document.getElementById('previewBoard');
const previewCtx = previewCanvas.getContext('2d');

const colorBtns = document.querySelectorAll('.color-btn');
const toolBtns = document.querySelectorAll('.tool-btn');
const clearBtn = document.getElementById('clearBtn');
const saveBtn = document.getElementById('saveBtn');
const undoBtn = document.getElementById('undoBtn');

let isDrawing = false;
let currentTool = 'brush';
let currentColor = '#FF0000';
let lastPoint = { x: 0, y: 0 };
let prevMidPoint = { x: 0, y: 0 };
let shapeStart = { x: 0, y: 0 };

// Array to store previous canvas states for Undo
let undoStack = [];
const MAX_UNDO_STEPS = 15;

function applyTheme() {
    const hour = new Date().getHours();
    if (hour >= 18 || hour <= 6) {
        document.body.classList.add('dark-mode');
    } else {
        document.body.classList.remove('dark-mode');
    }
}
applyTheme();

function updateCursor() {
    if (currentTool === 'brush') {
        previewCanvas.style.cursor = `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><text x="0" y="24" font-size="24">🖌️</text></svg>') 0 24, auto`;
    } else {
        previewCanvas.style.cursor = 'crosshair';
    }
}
updateCursor();

function resizeCanvas() {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    if (canvas.width > 0) {
        tempCanvas.getContext('2d').drawImage(canvas, 0, 0);
    }

    const container = document.getElementById('canvas-container');
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    previewCanvas.width = container.clientWidth;
    previewCanvas.height = container.clientHeight;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 18; 
    ctx.drawImage(tempCanvas, 0, 0);
    
    // Clear undo history on resize to prevent size-mismatch errors
    undoStack = []; 
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();


function updateBrowserThemeColor(colorHex) {
    let metaThemeColor = document.querySelector('meta[name="theme-color"]');
    
    // If the meta tag exists, update it. If not, create it dynamically.
    if (!metaThemeColor) {
        metaThemeColor = document.createElement('meta');
        metaThemeColor.name = "theme-color";
        document.head.appendChild(metaThemeColor);
    }
    
    metaThemeColor.setAttribute("content", colorHex);
}
updateBrowserThemeColor(currentColor);

toolBtns.forEach(btn => {
    btn.addEventListener('pointerdown', (e) => {
        toolBtns.forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        currentTool = e.currentTarget.getAttribute('data-tool');
        updateCursor();
    });
});

colorBtns.forEach(btn => {
    btn.addEventListener('pointerdown', (e) => {
        colorBtns.forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        currentColor = e.currentTarget.getAttribute('data-color');
        updateBrowserThemeColor(currentColor);
    });
});

// Saves the current canvas state BEFORE a new stroke begins
function saveState() {
    if (undoStack.length >= MAX_UNDO_STEPS) {
        undoStack.shift(); // Remove oldest state to save memory
    }
    undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
}

function drawShape(targetCtx, startX, startY, endX, endY, shapeType) {
    targetCtx.beginPath();
    targetCtx.strokeStyle = currentColor;
    targetCtx.lineWidth = 18;
    targetCtx.lineCap = 'round';
    targetCtx.lineJoin = 'round';

    if (shapeType === 'line') {
        targetCtx.moveTo(startX, startY);
        targetCtx.lineTo(endX, endY);
        targetCtx.stroke();
    } else if (shapeType === 'rect') {
        targetCtx.strokeRect(startX, startY, endX - startX, endY - startY);
    } else if (shapeType === 'circle') {
        const radius = Math.hypot(endX - startX, endY - startY);
        targetCtx.arc(startX, startY, radius, 0, Math.PI * 2);
        targetCtx.stroke();
    } else if (shapeType === 'triangle') {
        // Draws an isosceles triangle radiating outward based on drag
        targetCtx.moveTo(startX, startY - (endY - startY)); // Top point
        targetCtx.lineTo(endX, endY); // Bottom Right
        targetCtx.lineTo(startX - (endX - startX), endY); // Bottom Left
        targetCtx.closePath();
        targetCtx.stroke();
    } else if (shapeType === 'star') {
        const radius = Math.hypot(endX - startX, endY - startY);
        const spikes = 5;
        const innerRadius = radius / 2;
        let rot = (Math.PI / 2) * 3;
        const step = Math.PI / spikes;
        
        targetCtx.moveTo(startX, startY - radius);
        for (let i = 0; i < spikes; i++) {
            targetCtx.lineTo(startX + Math.cos(rot) * radius, startY + Math.sin(rot) * radius);
            rot += step;
            targetCtx.lineTo(startX + Math.cos(rot) * innerRadius, startY + Math.sin(rot) * innerRadius);
            rot += step;
        }
        targetCtx.lineTo(startX, startY - radius);
        targetCtx.closePath();
        targetCtx.stroke();
    }
}

previewCanvas.addEventListener('pointerdown', (e) => {
    isDrawing = true;
    saveState(); // Save state for undo BEFORE drawing

    const rect = previewCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    lastPoint = { x, y };
    shapeStart = { x, y };
    
    if (currentTool === 'brush') {
        prevMidPoint = { x, y };
        ctx.beginPath();
        ctx.arc(x, y, ctx.lineWidth / 2, 0, Math.PI * 2);
        ctx.fillStyle = currentColor;
        ctx.fill();
    }
    e.preventDefault(); 
});

previewCanvas.addEventListener('pointermove', (e) => {
    if (!isDrawing) {
        return;
    }
    
    const rect = previewCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const currentPoint = { x, y };
    
    if (currentTool === 'brush') {
        const midPoint = { x: (lastPoint.x + currentPoint.x) / 2, y: (lastPoint.y + currentPoint.y) / 2 };
        ctx.beginPath();
        ctx.moveTo(prevMidPoint.x, prevMidPoint.y);
        ctx.quadraticCurveTo(lastPoint.x, lastPoint.y, midPoint.x, midPoint.y);
        ctx.strokeStyle = currentColor;
        ctx.stroke();
        prevMidPoint = midPoint;
    } else {
        // Fast hardware-accelerated wipe of the top layer
        previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
        drawShape(previewCtx, shapeStart.x, shapeStart.y, x, y, currentTool);
    }
    lastPoint = currentPoint;
});

const handlePointerUp = () => {
    if (!isDrawing) {
        return;
    }
    isDrawing = false;
    
    if (currentTool !== 'brush') {
        drawShape(ctx, shapeStart.x, shapeStart.y, lastPoint.x, lastPoint.y, currentTool);
        previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    }
};

previewCanvas.addEventListener('pointerup', handlePointerUp);
previewCanvas.addEventListener('pointercancel', handlePointerUp);
previewCanvas.addEventListener('pointerout', handlePointerUp);
// Prevent right click on canvas
previewCanvas.addEventListener('contextmenu', (event) => {
    event.preventDefault();
});

// Undo Logic
undoBtn.addEventListener('pointerdown', () => {
    if (undoStack.length > 0) {
        const previousState = undoStack.pop();
        ctx.putImageData(previousState, 0, 0);
    }
});

// Clear Logic
clearBtn.addEventListener('pointerdown', () => {
    saveState(); // Allow un-clearing
    ctx.clearRect(0, 0, canvas.width, canvas.height);
});

// Save Logic
saveBtn.addEventListener('pointerdown', () => {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;
    let hasPixels = false;

    // The O(n) calculation on the main layer only
    for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
            if (data[(y * canvas.width + x) * 4 + 3] > 0) {
                if (x < minX) {
                    minX = x;
                }
                if (x > maxX) {
                    maxX = x;
                }
                if (y < minY) {
                    minY = y;
                }
                if (y > maxY) {
                    maxY = y;
                }
                hasPixels = true;
            }
        }
    }

    if (!hasPixels) {
        alert("The canvas is empty!");
        return;
    }

    const padding = 20;
    minX = Math.max(0, minX - padding);
    minY = Math.max(0, minY - padding);
    maxX = Math.min(canvas.width, maxX + padding);
    maxY = Math.min(canvas.height, maxY + padding);

    const cropW = maxX - minX;
    const cropH = maxY - minY;

    const tempC = document.createElement('canvas');
    tempC.width = cropW;
    tempC.height = cropH;
    const tCtx = tempC.getContext('2d');

    const isDarkMode = document.body.classList.contains('dark-mode');
    tCtx.fillStyle = isDarkMode ? '#1a1a1a' : '#f4f4f9';
    tCtx.fillRect(0, 0, cropW, cropH);
    tCtx.drawImage(canvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);

    const link = document.createElement('a');
    link.download = `artwork-${Date.now()}.png`;
    link.href = tempC.toDataURL('image/png');
    link.click();
});

