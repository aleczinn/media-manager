# Media Manager

[![Version](https://img.shields.io/badge/Media_Manager-0.1.0-8B7CFF?style=flat-square)](package.json)
[![Electron](https://img.shields.io/badge/Electron-45-47848F?style=flat-square&logo=electron)](https://www.electronjs.org)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-7-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite)](https://vite.dev)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=flat-square&logo=tailwindcss)](https://tailwindcss.com)
[![FFmpeg](https://img.shields.io/badge/FFmpeg-8-007808?style=flat-square&logo=ffmpeg)](https://ffmpeg.org)
[![pnpm](https://img.shields.io/badge/pnpm-10-F69220?style=flat-square&logo=pnpm)](https://pnpm.io)

Eine Desktop-App für Windows, die Serien- und Filmdateien für die eigene Mediathek aufbereitet. Sie liest einen Input-Ordner ein, schlägt für jede Datei einen einheitlichen Namen vor und baut daraus eine neue MKV im Output-Ordner: mit sortierten und sauber benannten Ton- und Untertitelspuren, einer lautstärke-normalisierten Tonspur und eingebundenen externen Untertiteln. Die Quelldateien bleiben dabei unverändert.

![Media Manager mit zwei Serienfolgen; bei der aufgeklappten Folge stehen links die Spuren der Quelle und rechts die der fertigen Datei](docs/screenshot.jpg)

Links stehen die gefundenen Dateien, rechts die Zielnamen. Jede Datei lässt sich ausschließen, jeder Name bearbeiten, und pro Datei zeigt eine aufklappbare Übersicht, welche Spuren vorher da sind und welche in der fertigen Datei landen. Ein Klick auf **Anwenden** verarbeitet alles.

Die App ist der Nachfolger meiner früheren Konsolen-Version, in der alle Einstellungen im Code standen. Deren Logik wurde übernommen und dabei an mehreren Stellen korrigiert.

## Features

- 📂 **Dateien**
  - Rekursiver Scan nach `.mkv`, `.mp4` und `.avi`; Dateien mit `sample` im Namen werden ignoriert
  - Dateien per Checkbox ausschließen, einzeln oder alle auf einmal
  - Aufklappbare Spurübersicht vorher → nachher, inklusive Peak-Wert der Tonspur und Anzahl der Untertitel-Einträge
- ✏️ **Renaming**
  - Schema `S01e02 - Titel {edition-…} {source-…}.mkv`, Staffel und Folge zweistellig; ohne Titel steht `Unknown`
  - Erkennt `S01E02`, `1x02` und alleinstehende `E01`
  - Edition aus dem Dateinamen: Extended, Upscale, Extended-Upscale, Director's Cut
  - Quelle aus dem Dateinamen, ersatzweise aus den Ordnernamen innerhalb des Input-Ordners: Disney+, Amazon, Netflix, ATVP, RTL+, Web, UHD, BluRay
  - Zielnamen direkt in der Liste bearbeitbar, mit Knopf zum Zurücksetzen auf den Vorschlag
  - Konflikte werden rot markiert und beim Anwenden übersprungen: Datei existiert schon, Name doppelt, ungültige Zeichen
- 🔊 **Tonspuren**
  - Filtern nach Sprachen, sortieren nach Sprache, Kanalzahl und Format
  - Einheitliche Titel wie „Dolby Digital Plus 5.1“; Atmos, DTS:X, DTS-HD MA und DTS-HD HR werden über MediaInfo erkannt
  - Peak-Normalisierung: Die erste Tonspur wird gemessen (`volumedetect`) und als zusätzliche AC3-Spur (Stereo 384k, 5.1 640k) vorne eingefügt, mit einstellbarem Branding im Titel, z. B. „Dolby Digital 5.1 [Sky Mix]“
  - Mindest- und Maximal-Gain einstellbar, unterstützte Formate und Kanalzahlen per Checkbox
  - Die Peak-Analyse läuft schon im Hintergrund, während man die Liste durchsieht; beim Anwenden muss dann nur noch geschrieben werden
- 💬 **Untertitel**
  - Externe Untertitel aus einem `Subs`-Ordner oder gleichnamige Dateien neben dem Video: `.idx/.sub` (VobSub), `.srt`, `.ass`, `.ssa`, `.sup` (PGS)
  - Sprache aus der Datei selbst oder aus dem Dateinamen (`-eng`, `.de`, `german` …), Forced und SDH ebenfalls aus dem Dateinamen
  - Nicht markierte Forced-Spuren werden an ihren wenigen Einträgen erkannt (unter 1,5 pro Minute)
  - Pro Spur ein Chip mit dem Typ: Entfernt, Normal, Forced, SDH oder CC. Blau = von der App erkannt, grau = laut Datei, orange = manuell überschrieben; Linksklick schaltet weiter, Rechtsklick zurück
  - Manuell gewählte Spuren kommen immer in die Datei, auch wenn ihre Sprache nicht in der Liste steht
  - Pro Sprache und Typ bleibt nur die bevorzugte Spur, nach einstellbarer Format-Reihenfolge
  - Einheitliche Titel wie „Deutsch Erzwungen“ oder „English SDH“ mit passenden Markierungen; Schriften für ASS-Untertitel werden mitkopiert, MP4-Untertitel nach SRT umgewandelt
- 🎞️ **TMDB**
  - Serie einmal bei [TMDB](https://www.themoviedb.org) suchen und zuordnen; der Suchbegriff wird aus Ordner- und Dateiname vorbelegt
  - Jede Folge bekommt per Staffel und Folge ihren Titel, auf Deutsch und ohne Übersetzung auf Englisch
  - Pro Datei lässt sich die Episode per Dropdown umstellen, z. B. wenn TMDB eine Doppelfolge als eine Episode führt
  - Optional wird das Episodenbild als `<Zielname>-thumb.jpg` neben der Datei gespeichert (wie es Jellyfin, Emby und Kodi erwarten)
- 🎬 **Video & Metadaten**
  - Video wird verlustfrei kopiert oder optional neu encodiert (H.264, H.265, NVIDIA, Intel QSV, AV1) mit eigenen Encoder-Argumenten
  - Container- und Videotitel werden geleert, eine gleichnamige `.txt` neben der Datei wird als Beschreibung übernommen
- ⚡ **Ausführung**
  - Mehrere Dateien gleichzeitig, einstellbar von 1 bis 4 (Standard 2; für normale Festplatten 1)
  - Fortschritt pro Datei und gesamt mit Restzeit, jederzeit abbrechbar
  - Jede Datei wird erst als `.partial` geschrieben und nach Erfolg umbenannt; Fehler betreffen nur die eine Datei
  - Speicherplatz-Warnung über dem Anwenden-Knopf: gelb, wenn nach dem Export weniger als die Warnschwelle frei bliebe, rot, wenn der Platz nicht reicht
- ⚙️ **Einstellungen**
  - Werden sofort gespeichert und beim Beenden gesichert
  - Reihenfolgen (Sprachen, Audio-Formate, Untertitel-Typen und -Formate) per Drag & Drop, Auswahlfelder statt Freitext
  - Pfad zu ffmpeg und ffprobe frei wählbar, sonst aus dem PATH; die gefundene Version steht oben rechts
- 🩺 **Corruption-Checker**
  - Eigenes Konsolen-Tool, das eine Datei oder einen ganzen Ordner mit ffmpeg auf Container- und Streamfehler prüft, auf Wunsch mit vollständigem Decode-Test und Hardwarebeschleunigung

## Bedienung

1. **Input** und **Output** wählen. Beide Ordner werden gespeichert und beim nächsten Start wieder geöffnet.
2. Unter **Verarbeitung** die gewünschten Schritte an- oder abschalten.
3. Links Dateien ausschließen, die nicht verarbeitet werden sollen. Über den Pfeil vor einer Datei öffnet sich die Spurübersicht; dort lassen sich Untertitel per Klick auf den Chip übernehmen, entfernen oder umtypisieren.
4. Bei Serien über **Serie zuordnen** die Serie bei TMDB auswählen. Die Folgentitel landen automatisch in den Zielnamen; unter jedem Namen lässt sich die Episode bei Bedarf umstellen.
5. Rechts die Zielnamen prüfen und bei Bedarf von Hand anpassen.
6. **Anwenden** klicken. Fertige Dateien werden grün markiert, übersprungene und fehlerhafte zeigen ihren Grund im Tooltip.

Die Einstellungen liegen in `%APPDATA%\media-manager-v2\settings.json`.

### TMDB-API-Key

Für die Folgentitel braucht die App einen kostenlosen API-Key von TMDB: Konto auf [themoviedb.org](https://www.themoviedb.org) anlegen, unter [Einstellungen → API](https://www.themoviedb.org/settings/api) einen Key erzeugen und ihn in der App unter **Einstellungen → TMDB** eintragen. Akzeptiert werden der API-Key (v3) und der Read Access Token.

This product uses the TMDB API but is not endorsed or certified by TMDB.

## Development

### Voraussetzungen

- Node.js 22 oder neuer und pnpm 10
- ffmpeg und ffprobe (getestet mit 8.0) im PATH oder als Pfad in den Einstellungen

### Befehle

```bash
pnpm install     # Abhängigkeiten installieren
pnpm dev         # App im Entwicklungsmodus starten
pnpm build       # Produktions-Build nach out/
pnpm typecheck   # TypeScript prüfen
pnpm test        # Unit-Tests (Vitest)
pnpm dist        # portable .exe nach dist/MediaManager-<version>-portable.exe
```

Falls Electron nach `pnpm install` fehlt (`node_modules/electron/dist` leer): `node node_modules/electron/install.js`.

### Portable .exe

`pnpm dist` baut mit electron-builder eine einzelne `.exe`, die ohne Installation läuft. ffmpeg und ffprobe sind nicht enthalten. Die Konfiguration steht in `electron-builder.yml`; das App-Icon liegt als Quelle in `build/icon.svg`, daraus erzeugt sind `build/icon.ico` und `build/icon.png`.

### Corruption-Checker

```bash
pnpm check -- "P:\Filme"                       # schneller Check (Container)
pnpm check -- "P:\Filme\Film (2015).mkv"       # einzelne Datei
pnpm check -- "P:\Filme" --full                # vollständiger Decode-Test
pnpm check -- "P:\Filme" --full --gpu=cuda     # mit Hardwarebeschleunigung (cuda, qsv, d3d11va)
```

### Struktur

- `src/shared/`: reine Logik ohne Electron (Spurplanung, Renaming, externe Untertitel, ffmpeg-Argumente, Platzschätzung), getestet in `tests/`
- `src/main/`: Electron-Main-Prozess (Scan, ffprobe und MediaInfo, Peak-Analyse, Ausführung, Einstellungen)
- `src/preload/`: typisierte Brücke `window.api` zwischen Oberfläche und Main-Prozess
- `src/renderer/`: React-Oberfläche mit Tailwind CSS und shadcn/ui-Komponenten
- `scripts/corruption-checker.ts`: der Corruption-Checker

## Verwendete Bibliotheken

- [mediainfo.js](https://github.com/buzz/mediainfo.js) (BSD-2-Clause) für die genaue Formaterkennung der Tonspuren
- [Radix UI](https://www.radix-ui.com) und [shadcn/ui](https://ui.shadcn.com) (MIT) für die Bedienelemente
- [dnd kit](https://dndkit.com) (MIT) für die sortierbaren Listen
- [Lucide](https://lucide.dev) (ISC) für die Icons
- [Zustand](https://github.com/pmndrs/zustand) (MIT) für den App-Zustand

FFmpeg wird nicht mitgeliefert, sondern als installiertes Programm aufgerufen. Folgentitel und Episodenbilder stammen von [TMDB](https://www.themoviedb.org).
