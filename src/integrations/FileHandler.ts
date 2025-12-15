/**
 * 📁 FILE HANDLER
 * ===============
 * Dateisystem-Operationen für die Kyberion Extension
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class FileHandler {
    private devDirectory: string;

    constructor() {
        const config = vscode.workspace.getConfiguration('kyberion');
        this.devDirectory = config.get<string>('devDirectory') || '/Users/gregorklauss/dev';
    }

    /**
     * Datei lesen
     */
    async readFile(filePath: string): Promise<string | null> {
        try {
            // Sicherheitscheck: Nur im dev-Verzeichnis
            if (!this.isAllowedPath(filePath)) {
                console.warn('Zugriff verweigert:', filePath);
                return null;
            }

            const content = await fs.promises.readFile(filePath, 'utf-8');
            return content;
        } catch (error) {
            console.error('Fehler beim Lesen:', error);
            return null;
        }
    }

    /**
     * Datei schreiben
     */
    async writeFile(filePath: string, content: string): Promise<boolean> {
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
        } catch (error) {
            console.error('Fehler beim Schreiben:', error);
            return false;
        }
    }

    /**
     * Datei erstellen
     */
    async createFile(filePath: string, content: string = ''): Promise<boolean> {
        return this.writeFile(filePath, content);
    }

    /**
     * Datei löschen
     */
    async deleteFile(filePath: string): Promise<boolean> {
        try {
            if (!this.isAllowedPath(filePath)) {
                console.warn('Löschzugriff verweigert:', filePath);
                return false;
            }

            await fs.promises.unlink(filePath);
            return true;
        } catch (error) {
            console.error('Fehler beim Löschen:', error);
            return false;
        }
    }

    /**
     * Ordner erstellen
     */
    async createDirectory(dirPath: string): Promise<boolean> {
        try {
            if (!this.isAllowedPath(dirPath)) {
                console.warn('Ordner-Erstellung verweigert:', dirPath);
                return false;
            }

            await fs.promises.mkdir(dirPath, { recursive: true });
            return true;
        } catch (error) {
            console.error('Fehler beim Ordner erstellen:', error);
            return false;
        }
    }

    /**
     * Ordner-Inhalt auflisten
     */
    async listDirectory(dirPath: string): Promise<string[] | null> {
        try {
            if (!this.isAllowedPath(dirPath)) {
                console.warn('Ordner-Zugriff verweigert:', dirPath);
                return null;
            }

            const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
            return entries.map(entry => {
                return entry.isDirectory() ? entry.name + '/' : entry.name;
            });
        } catch (error) {
            console.error('Fehler beim Auflisten:', error);
            return null;
        }
    }

    /**
     * Prüfen ob Datei existiert
     */
    async exists(filePath: string): Promise<boolean> {
        try {
            await fs.promises.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Datei umbenennen / verschieben
     */
    async rename(oldPath: string, newPath: string): Promise<boolean> {
        try {
            if (!this.isAllowedPath(oldPath) || !this.isAllowedPath(newPath)) {
                console.warn('Umbenennen verweigert:', oldPath, '->', newPath);
                return false;
            }

            await fs.promises.rename(oldPath, newPath);
            return true;
        } catch (error) {
            console.error('Fehler beim Umbenennen:', error);
            return false;
        }
    }

    /**
     * Datei-Info abrufen
     */
    async getFileInfo(filePath: string): Promise<FileInfo | null> {
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
        } catch (error) {
            console.error('Fehler beim Info-Abruf:', error);
            return null;
        }
    }

    /**
     * Sicherheitscheck: Pfad im erlaubten Bereich?
     */
    private isAllowedPath(filePath: string): boolean {
        const normalized = path.normalize(filePath);
        return normalized.startsWith(this.devDirectory);
    }

    /**
     * Datei-Extension zu Sprache mappen
     */
    getLanguageForFile(filePath: string): string {
        const ext = path.extname(filePath).toLowerCase();
        const langMap: Record<string, string> = {
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

export interface FileInfo {
    path: string;
    name: string;
    extension: string;
    size: number;
    isDirectory: boolean;
    modifiedAt: Date;
    createdAt: Date;
}
