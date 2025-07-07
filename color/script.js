let currentIndex = 0;
let currentLang = 'english';


function getBrightness(color) {
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.fillStyle = color;
    const rgbString = ctx.fillStyle;
    const rgb = rgbString.match(/\d+/g);

    // Assume bright background as fallback
    if (!rgb || rgb.length < 3) {
        console.warn(`Invalid color: ${color}`);
        return 255;
    }

    // Formula to calculate a weighted average of the three primary colors
    // Baed on ITU-R BT.601 standard
    const [r, g, b] = rgb.map(Number);
    return (r * 299 + g * 587 + b * 114) / 1000;
}



function getTextStyleForBrightness(color) {
    const brightness = getBrightness(color);
    const isDark = brightness < 128;
    return {
        textColor: isDark ? 'white' : 'black',
        textShadow: `
            2px 2px 4px ${isDark ? 'rgba(0, 0, 0, 0.4)' : 'rgba(255, 255, 255, 0.4)'},
           -2px -2px 4px ${isDark ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 0, 0, 0.4)'}
        `
    };
}

function changeBodyColor(color) {
    // update color with importance to work on devices with Dark viewer
    document.body.style.setProperty('background-color', color, 'important');
    // Update theme color on supported mobile devices
    const metaTag = document.getElementById('theme-color');
    if (metaTag) {
        metaTag.setAttribute('content', color);
    }
    console.log("Updated color to: " + color);
}

function changeTextColor(color, label) {
    const { textColor, textShadow } = getTextStyleForBrightness(color);

    const colorNameEl = document.getElementById('color-name');
    colorNameEl.style.color = textColor;
    colorNameEl.style.textShadow = textShadow;
    colorNameEl.textContent = label;
    console.log("Updated text to: " + label);
}

function updateColor() {
    // Get color data and label values
    const colorData = window.colors[currentLang].names[currentIndex];
    const color = colorData.color;
    const label = colorData.label;

    changeBodyColor(color);
    changeTextColor(color, label);

    currentIndex = (currentIndex + 1) % window.colors[currentLang].names.length;
}

document.addEventListener('DOMContentLoaded', () => {
    updateColor();
    document.body.addEventListener('click', updateColor);
    document.body.addEventListener('touchstart', updateColor);
});