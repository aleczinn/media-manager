# Media Manager
This small script takes mkv and mp4 files and sorts the audio tracks and subtitles according to the specified order.

**Features**
- Normalization for main audio track: Boosts to 0dB and exports it as AC3
- RenameFix: Automatically names series sequences according to the scheme S0xe0x - Title {source-XXX}

**ToDo**
- Expand RenameFix further so that it recognizes more formats
- Normalization applicable for all languages
- UI for a better overview and easier management

## Installation
### Install dependencies
To install all required dependencies run the command:
```bash
npm install
```

### Usage
Add your media to the data folder. Now open index.ts and adjust the preset so that they match your requirements. Then call up this command to execute it:
```bash
npm run dev
```