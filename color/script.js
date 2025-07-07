let currentIndex = 0;
let currentLang = 'english';


function getBrightness(hexColor) {
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.fillStyle = hexColor;
    const rgb = ctx.fillStyle.match(/\\d+/g).map(Number);
    return (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000;
}


function updateColor() {
    const colorData = window.colors[currentLang].names[currentIndex];
    const color = colorData.color;
    const label = colorData.label;

    document.body.style.backgroundColor = color;
    const brightness = getBrightness(color);
    colorName = document.getElementById('color-name')
    colorName.style.color = brightness < 128 ? 'white' : 'black';
    colorName.textContent = label;

    currentIndex = (currentIndex + 1) % window.colors[currentLang].names.length;
}

document.addEventListener('DOMContentLoaded', () => {
    updateColor();
    document.body.addEventListener('click', updateColor);
    document.body.addEventListener('touchstart', updateColor);
});