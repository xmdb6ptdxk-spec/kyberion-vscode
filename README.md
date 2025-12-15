# 🌟 Kyberion VS Code Extension

Die offizielle VS Code Extension für das Kybernetikon-Projekt.

## Features

### 💬 Chat-Fenster
- Modernes Chat-UI in der Sidebar
- Nachrichten-Verlauf mit User/Assistant Bubbles
- "Kyberion denkt..." Anzeige mit Animation
- Kyberions Gedanken anzeigen (collapsible, von Gemini)
- Markdown-Rendering für Antworten
- Code-Blöcke mit Syntax-Highlighting

### 📋 Plan/Act Modus
- Toggle zwischen Chat und Plan Modus
- Strukturierte Plan-Erstellung aus User-Anfragen
- ACT-Button: Schritte automatisch ausführen
- PAUSE/RESUME: Ausführung kontrollieren
- Visueller Fortschritt pro Schritt

### 📎 Datei-Anhänge
- Button zum Anhängen von Dateien
- Unterstützte Formate: `.txt`, `.pdf`, `.rtf`, `.md`, `.json`, `.py`, `.ts`, `.js`, etc.
- Datei-Inhalt wird mit der Nachricht gesendet

### 🔌 Backend-Verbindung
- Connect/Disconnect Button
- Verbindungsstatus-Anzeige (grün/rot)
- Auto-Reconnect Option
- Status-Bar Icon

## Installation

### Voraussetzungen
- VS Code 1.85.0 oder neuer
- Node.js 18+ und npm
- Laufendes Kybernetikon Backend auf Port 8765

### Build & Install

```bash
cd kyberion-vscode

# Abhängigkeiten installieren
npm install

# TypeScript kompilieren
npm run compile

# VSIX-Paket erstellen
npx vsce package

# Extension installieren
code --install-extension kyberion-vscode-1.0.0.vsix
```

## Konfiguration

Einstellungen unter `File > Preferences > Settings > Kyberion`:

| Einstellung | Standard | Beschreibung |
|------------|----------|--------------|
| `kyberion.nexusApiUrl` | `http://localhost:8765` | URL der Nexus API |
| `kyberion.autoConnect` | `true` | Automatisch verbinden |
| `kyberion.showThinking` | `true` | Gedanken anzeigen |
| `kyberion.devDirectory` | `/Users/gregorklauss/dev` | Erlaubtes Verzeichnis |

## Keyboard Shortcuts

| Shortcut | Aktion |
|----------|--------|
| `Cmd+Shift+K` | Chat öffnen |

## API-Endpunkte

Die Extension kommuniziert mit dem Backend über:

- `POST /api/chat` - Chat mit Kyberion
- `GET /api/system/status` - System-Status
- `GET /api/mind/agents` - Agenten-Liste
- `POST /api/file/read` - Datei lesen

## Entwicklung

```bash
# Watch-Modus für Entwicklung
npm run watch

# Extension testen (F5 in VS Code)
# Öffnet neues VS Code Fenster mit Extension
```

## Lizenz

MIT - Kybernetikon Project
