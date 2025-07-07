let currentIndex = 0;
let currentLang = 'english';


// Create a 1x1 pixel canvas to do the color conversion
const canvas = document.createElement('canvas');
canvas.width = 1;
canvas.height = 1;
const ctx = canvas.getContext('2d');


function getBrightness(color) {
    try {
        // Draw a 1x1 pixel rectangle to apply the color
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 1, 1);
        // Get the color data for that single pixel in an array [R, G, B, Alpha].
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        // Formula to calculate a weighted average of the three primary colors
        // Baed on ITU-R BT.601 standard
        return (r * 299 + g * 587 + b * 114) / 1000;

    } catch (e) {
        // Assume bright background as fallback
        console.error(`Invalid color: ${color}`, e);
        return 255;
    }
}



function getTextStyleForBrightness(color) {
    const brightness = getBrightness(color);
    const isDark = brightness < 128;
    return {
        textColor: isDark ? 'white' : 'black',
        textShadow: `
            5px 5px 5px ${isDark ? 'rgba(0, 0, 0, 0.4)' : 'rgba(255, 255, 255, 0.4)'},
           -2px -2px 5px ${isDark ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 0, 0, 0.4)'}
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
    console.log("Updated background color to: " + color);
}

function changeTextColor(color, label) {
    const {
        textColor,
        textShadow
    } = getTextStyleForBrightness(color);

    const colorNameEl = document.getElementById('color-name');
    colorNameEl.style.color = textColor;
    colorNameEl.style.textShadow = textShadow;
    colorNameEl.textContent = label;
    console.log("Updated text content to: " + label);
    console.log("Updated text color to: " + textColor);
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

    // =========================
    // Event Listeners
    // =========================
    document.addEventListener('keydown', event => {
        if (event.code === 'Space' || event.code === 'Enter') {
            event.preventDefault();
            updateColor();
        }
    });
    document.body.addEventListener('click', updateColor);
    document.body.addEventListener('touchstart', e => {
        // Prevent the browser from firing the emulated 'click' event.
        e.preventDefault();
        updateColor();
    }, { passive: false });
});
