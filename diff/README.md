# 𝜟 Webpage Diff Tool

A fast, lightweight, and entirely client-side tool to compare webpages, json, js files, raw code, and text snippets. 

Hosted as a static HTML file, this tool requires no backend or build process. It leverages public CORS proxies to fetch live web pages and uses `jsdiff` to provide GitHub-style inline and side-by-side comparisons.

[https://navchandar.github.io/lab/diff/](https://navchandar.github.io/lab/diff/)


## ✨ Features

* **Three Input Modes:** Compare live URLs, upload local files, or paste raw text/code directly.
* **Smart Parsing:** Automatically beautifies minified JS/CSS and extracts visible text from raw HTML for accurate, readable diffing.
* **Multiple Views:** Toggle between **Inline** and **Side-by-Side** comparison modes.
* **Context Mode:** Choose to view the entire file or just the changed lines with a few lines of context (state saved locally).
* **Modern UI:** Responsive design with automatic Light and Dark mode support based on your system preferences.
* **100% Client-Side:** Everything runs in your browser. Hosted statically via GitHub Pages.


## 🛠️ Built With

* HTML, CSS, and JavaScript
* [jsdiff](https://github.com/kpdecker/jsdiff)
* [js-beautify](https://github.com/beautifier/js-beautify)
* [corsproxy.io](https://corsproxy.io/)

## 📄 License

This project is licensed under the [GNU GPLv3](https://github.com/navchandar/lab/blob/main/LICENSE).