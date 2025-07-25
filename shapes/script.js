
const shapeElement = document.getElementById('shape');

// List of shapes from 1 to 10 sides
const shapes = [
    'line',       // 1 side
    'angle',      // 2 sides
    'triangle',   // 3 sides
    'square',     // 4 sides
    'pentagon',   // 5 sides
    'hexagon',    // 6 sides
    'heptagon',   // 7 sides
    'octagon',    // 8 sides
    'nonagon',    // 9 sides
    'decagon',    // 10 sides
    'circle'
];

const colors = ["red", "blue", "green", "white", "orange", "brown", "pink", "yellow"];

let currentShapeIndex = 0;
let currentColor = null;
let previousColor = null;


function getNewColor() {
    let newColor;
    do {
        newColor = colors[Math.floor(Math.random() * colors.length)];
    } while (newColor === currentColor || newColor === previousColor);
    return newColor;
}


function updateShape() {
    // Remove current shape class
    shapeElement.className = '';

    // Update index
    currentShapeIndex = (currentShapeIndex + 1) % shapes.length;

    // Add new shape class
    const newShape = shapes[currentShapeIndex];
    shapeElement.classList.add(newShape);

    // Apply random background color
    previousColor = currentColor;
    currentColor = getNewColor();
    shapeElement.style.backgroundColor = currentColor;
}

// Initial setup
shapeElement.style.backgroundColor = 'cornflowerblue';

// Add click/touch event listener
document.body.addEventListener('click', updateShape);
document.body.addEventListener('touchstart', updateShape);
