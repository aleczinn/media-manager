# Media Manager
This small script takes mkv and mp4 files and sorts the audio tracks and subtitles according to the specified order.

**Features**
- **Naming**
  - The tool can rename your audio and subtitle tracks based on the language and flags like default/forced/hearing_impaired
  - Atmos and DTS:X recognition is also supported
  - Subtitles are sorted according to the format such as PGS, SRT, ASS and VobSub. If, for example, PGS_DE_FORCED is already included, all lower subtitles are omitted
- **Encoding**: You can enable video encoding with special flags when needed
- **Normalization**
  - Currently only for the main audio track when if audio codec is dts, ac3, eac3 or aac + 2 or 5 channels
  - Custom audio branding for the normalized track
  - Threshold to set when it should be normalized 
  - Mode: Peak - Boost the audio track to 0dB peak
  - Mode: EBU R128 (WIP) - This is the professional standard for audio normalization when broadcasting and streaming media.
- **RenameFix**: Automatically names media based on the title. It filters out the season, episode and title. The result looks like: S0xe0x - Title {edition-Extended} {source-XXX}.mkv
- Set a value for unknown languages or remove them completely from your media

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