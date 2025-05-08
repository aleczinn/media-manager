# Media Manager

[![Made with Vue.js](https://img.shields.io/badge/Made%20with-Vue.js-42b883?style=flat-square&logo=vue.js)](https://vuejs.org)
[![Vite](https://img.shields.io/badge/Vite-Built%20with-646CFF?style=flat-square&logo=vite)](https://vitejs.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-Styled-38B2AC?style=flat-square&logo=tailwind-css)](https://tailwindcss.com)
[![Electron](https://img.shields.io/badge/Electron-Built%20with-47848F?style=flat-square&logo=electron&logoColor=white)](https://www.electronjs.org)

This tool is a media managing tool which supports multiple features to organize your mkv, mp4 or avi files.

### Features

- UI
- Organization & Sorting of audio tracks and subtitles
    - ignore subtitle format if needed (pgs, srt, vobsub, ass)
- **Normalization**: Each audio track can be normalized to reach 0dB
- **RenameFix**: Renaming tv-series to its correct format "*S01e01 - Title.mkv*"
    - (Optional) set flags like *upscaled, extended, source*

## Project Setup

### Install

```bash
$ npm install
```

### Development

```bash
$ npm run electron:dev
```

### Build

```bash
# The final files get stored in ./dist

# For windows
$ npm run build:win

# For macOS
$ npm run build:mac

# For Linux
$ npm run build:linux
```
