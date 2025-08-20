const shapeElement = document.getElementById("shape");
const shapeNameElement = document.getElementById("shapename");

// List of shapes from 1 to 10 sides
const shapes = [
  "line", // 1 side
  "angle", // 2 sides
  "triangle", // 3 sides
  "square", // 4 sides
  "rectangle", // 4 sides
  "rhombus", // 4 sides
  "pentagon", // 5 sides
  "hexagon", // 6 sides
  "heptagon", // 7 sides
  "octagon", // 8 sides
  "nonagon", // 9 sides
  "decagon", // 10 sides
  "star",
  "circle",
  "oval",
];

const colors = [
  "black",
  "darkgray",
  "red",
  "maroon",
  "gold",
  "olive",
  "lime",
  "green",
  "teal",
  "blue",
  "navy",
  "purple",
];

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

function changeTextColor(color, label) {
  shapeNameElement.classList.add("fade-out");
  // Wait for fade-out to complete, then change text and fade in
  setTimeout(() => {
    shapeNameElement.textContent = label;
    shapeNameElement.classList.remove("fade-out");
  }, 700);
  console.log("Updated text content to: " + label);
  // speaker();
}

function updateShape() {
  // Remove current shape class
  shapeElement.className = "";

  // Update index
  currentShapeIndex = (currentShapeIndex + 1) % shapes.length;

  // Add new shape class
  const newShape = shapes[currentShapeIndex];
  shapeElement.classList.add("shape");
  shapeElement.classList.add(newShape);

  // Apply random background color
  previousColor = currentColor;
  currentColor = getNewColor();
  shapeElement.style.backgroundColor = currentColor;
  changeTextColor(currentColor, newShape.toUpperCase());
}

// Initial setup
shapeElement.style.backgroundColor = "cornflowerblue";

// Add click/touch event listener
document.body.addEventListener("pointerup", updateShape);
document.addEventListener("keydown", (event) => {
  if (event.code === "Space" || event.code === "Enter") {
    event.preventDefault(); // Prevent scrolling on Space
    updateShape();
  }
});
