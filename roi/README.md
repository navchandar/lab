# ROI

> Precise Image Annotation & Polygon Mask Editor

A lightweight, zero-dependency browser application for annotating Regions of Interest (ROI) and Exclusion Areas on high-resolution images. Features interactive arbitrary-vertex polygon editing, SVG coordinate mapping, light/dark themes, and real-time schema export.

## Features

- **Arbitrary Resolution Handling**: Supports images of any dimension by locking SVG viewport geometry directly to `naturalWidth` and `naturalHeight` (1:1 pixel accuracy).
- **Dual Zone Classification**:
  - **Inclusion (ROI)**: Highlighted in emerald green (`action: "inclusion"`, `type: "crop"`).
  - **Exclusion Area (EA)**: Highlighted in rose red (`action: "exclusion"`, `type: "exclusion"`).
- **Interactive Geometry Controls**:
  - **Move Zone**: Click and drag inside any polygon body.
  - **Adjust Vertices**: Drag white handle circles to reshape.
  - **Add Points**: Click any amber `+` midpoint handle along edges to subdivide and insert points.
  - **Delete Points**: Right-click any vertex to remove it (maintains minimum 3 vertices).
- **Real-Time Payload Sync**: Instantly reflects coordinate changes in standard vision pipeline JSON.
- **Modern Minimal UI**: Glassmorphism aesthetic, ambient color gradients, automatic and manual Light/Dark mode switching.
- **Zero Build Step**: Pure HTML5, Vanilla JavaScript, and Tailwind CSS (via CDN).
