"use strict";
/**
 * 📁 FILE HANDLER
 * ===============
 * Dateisystem-Operationen für die Kyberion Extension
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileHandler = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class FileHandler {
    constructor() {
        const config = vscode.workspace.getConfiguration('kyberion');
        this.devDirectory = config.get('devDirectory') || '/Users/gregorklauss/dev';
    }
    /**
     * Datei lesen
     */
    async readFile(filePath) {
        try {
            // Sicherheitscheck: Nur im dev-Verzeichnis
            if (!this.isAllowedPath(filePath)) {
                console.warn('Zugriff verweigert:', filePath);
                return null;
            }
            const content = await fs.promises.readFile(filePath, 'utf-8');
            return content;
        }
        catch (error) {
            console.error('Fehler beim Lesen:', error);
            return null;
        }
    }
    /**
     * Datei schreiben
     */
    async writeFile(filePath, content) {
        try {
            // Sicherheitscheck: Nur im dev-Verzeichnis
            if (!this.isAllowedPath(filePath)) {
                console.warn('Schreibzugriff verweigert:', filePath);
                return false;
            }
            // Verzeichnis erstellen falls nicht vorhanden
            const dir = path.dirname(filePath);
            await fs.promises.mkdir(dir, { recursive: true });
            await fs.promises.writeFile(filePath, content, 'utf-8');
            return true;
        }
        catch (error) {
            console.error('Fehler beim Schreiben:', error);
            return false;
        }
    }
    /**
     * Datei erstellen
     */
    async createFile(filePath, content = '') {
        return this.writeFile(filePath, content);
    }
    /**
     * Datei löschen
     */
    async deleteFile(filePath) {
        try {
            if (!this.isAllowedPath(filePath)) {
                console.warn('Löschzugriff verweigert:', filePath);
                return false;
            }
            await fs.promises.unlink(filePath);
            return true;
        }
        catch (error) {
            console.error('Fehler beim Löschen:', error);
            return false;
        }
    }
    /**
     * Ordner erstellen
     */
    async createDirectory(dirPath) {
        try {
            if (!this.isAllowedPath(dirPath)) {
                console.warn('Ordner-Erstellung verweigert:', dirPath);
                return false;
            }
            await fs.promises.mkdir(dirPath, { recursive: true });
            return true;
        }
        catch (error) {
            console.error('Fehler beim Ordner erstellen:', error);
            return false;
        }
    }
    /**
     * Ordner-Inhalt auflisten
     */
    async listDirectory(dirPath) {
        try {
            if (!this.isAllowedPath(dirPath)) {
                console.warn('Ordner-Zugriff verweigert:', dirPath);
                return null;
            }
            const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
            return entries.map(entry => {
                return entry.isDirectory() ? entry.name + '/' : entry.name;
            });
        }
        catch (error) {
            console.error('Fehler beim Auflisten:', error);
            return null;
        }
    }
    /**
     * Prüfen ob Datei existiert
     */
    async exists(filePath) {
        try {
            await fs.promises.access(filePath);
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * Datei umbenennen / verschieben
     */
    async rename(oldPath, newPath) {
        try {
            if (!this.isAllowedPath(oldPath) || !this.isAllowedPath(newPath)) {
                console.warn('Umbenennen verweigert:', oldPath, '->', newPath);
                return false;
            }
            await fs.promises.rename(oldPath, newPath);
            return true;
        }
        catch (error) {
            console.error('Fehler beim Umbenennen:', error);
            return false;
        }
    }
    /**
     * Datei-Info abrufen
     */
    async getFileInfo(filePath) {
        try {
            const stats = await fs.promises.stat(filePath);
            return {
                path: filePath,
                name: path.basename(filePath),
                extension: path.extname(filePath),
                size: stats.size,
                isDirectory: stats.isDirectory(),
                modifiedAt: stats.mtime,
                createdAt: stats.birthtime
            };
        }
        catch (error) {
            console.error('Fehler beim Info-Abruf:', error);
            return null;
        }
    }
    /**
     * Sicherheitscheck: Pfad im erlaubten Bereich?
     */
    isAllowedPath(filePath) {
        const normalized = path.normalize(filePath);
        return normalized.startsWith(this.devDirectory);
    }
    /**
     * Datei-Extension zu Sprache mappen
     */
    getLanguageForFile(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        const langMap = {
            '.py': 'python',
            '.ts': 'typescript',
            '.js': 'javascript',
            '.tsx': 'typescriptreact',
            '.jsx': 'javascriptreact',
            '.json': 'json',
            '.md': 'markdown',
            '.html': 'html',
            '.css': 'css',
            '.scss': 'scss',
            '.yaml': 'yaml',
            '.yml': 'yaml',
            '.xml': 'xml',
            '.sql': 'sql',
            '.sh': 'shellscript',
            '.bash': 'shellscript',
            '.zsh': 'shellscript',
            '.txt': 'plaintext',
            '.rtf': 'plaintext',
            '.pdf': 'pdf'
        };
        return langMap[ext] || 'plaintext';
    }
}
exports.FileHandler = FileHandler;
//# sourceMappingURL=FileHandler.js.map