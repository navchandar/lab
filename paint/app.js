const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const colorBtns = document.querySelectorAll('.color-btn');
const clearBtn = document.getElementById('clearBtn');
const saveBtn = document.getElementById('saveBtn');

let isDrawing = false;
let currentColor = '#FF0000';
let lastPoint = { x: 0, y: 0 };
let prevMidPoint = { x: 0, y: 0 };

// Auto-theme based on local time (6 PM to 6 AM is Dark Mode)
function applyTheme() {
    const hour = new Date().getHours();
    if (hour >= 18 || hour < 6) {
        document.body.classList.add('dark-mode');
    }
}
applyTheme();

function resizeCanvas() {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    if (canvas.width > 0) {
        tempCanvas.getContext('2d').drawImage(canvas, 0, 0);
    }

    // Force canvas to match its physical CSS dimensions
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 18; 
    ctx.drawImage(tempCanvas, 0, 0);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas(); // Initial sizing

// Color Selection
colorBtns.forEach(btn => {
    btn.addEventListener('pointerdown', (e) => {
        colorBtns.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        currentColor = e.target.getAttribute('data-color');
    });
});

// Quadratic Bezier Curve Drawing Logic
canvas.addEventListener('pointerdown', (e) => {
    isDrawing = true;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    lastPoint = { x, y };
    prevMidPoint = { x, y };

    // Support single taps by drawing a dot instantly
    ctx.beginPath();
    ctx.arc(x, y, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fillStyle = currentColor;
    ctx.fill();
    
    // Prevent Safari from trying to scroll
    e.preventDefault(); 
});

canvas.addEventListener('pointermove', (e) => {
    if (!isDrawing) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const currentPoint = { x, y };
    const midPoint = { x: (lastPoint.x + currentPoint.x) / 2, y: (lastPoint.y + currentPoint.y) / 2 };

    ctx.beginPath();
    ctx.moveTo(prevMidPoint.x, prevMidPoint.y);
    ctx.quadraticCurveTo(lastPoint.x, lastPoint.y, midPoint.x, midPoint.y);
    ctx.strokeStyle = currentColor;
    ctx.stroke();

    lastPoint = currentPoint;
    prevMidPoint = midPoint;
});

const stopDrawing = () => { isDrawing = false; };
canvas.addEventListener('pointerup', stopDrawing);
canvas.addEventListener('pointercancel', stopDrawing);
canvas.addEventListener('pointerout', stopDrawing);

// One-Tap Clear
clearBtn.addEventListener('pointerdown', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
});

// Auto-Cropping Save (Pixel Array Scanning)
saveBtn.addEventListener('pointerdown', () => {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;
    let hasPixels = false;

    // Scan pixel array for any drawn content (Alpha channel > 0)
    for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
            const alpha = data[(y * canvas.width + x) * 4 + 3];
            if (alpha > 0) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
                hasPixels = true;
            }
        }
    }

    if (!hasPixels) {
        alert("The canvas is empty!");
        return;
    }

    // Add slight padding around the cropped image
    const padding = 20;
    minX = Math.max(0, minX - padding);
    minY = Math.max(0, minY - padding);
    maxX = Math.min(canvas.width, maxX + padding);
    maxY = Math.min(canvas.height, maxY + padding);

    const cropWidth = maxX - minX;
    const cropHeight = maxY - minY;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = cropWidth;
    tempCanvas.height = cropHeight;
    const tempCtx = tempCanvas.getContext('2d');

    // Fill the background of the saved image so White/Black drawings show up properly
    const isDarkMode = document.body.classList.contains('dark-mode');
    tempCtx.fillStyle = isDarkMode ? '#1a1a1a' : '#f4f4f9';
    tempCtx.fillRect(0, 0, cropWidth, cropHeight);

    // Draw the cropped section onto the temp canvas
    tempCtx.drawImage(canvas, minX, minY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

    const link = document.createElement('a');
    link.download = `artwork-${new Date().getTime()}.png`;
    link.href = tempCanvas.toDataURL('image/png');
    link.click();
});