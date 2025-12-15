/**
 * 🔓 DEV ACCESS MANAGER
 * =====================
 * Volle Lese- und Schreibberechtigungen über den DEV-Ordner
 * 
 * Features:
 * - Voller Dateizugriff auf /Users/gregorklauss/dev
 * - Zugriff auf Papas_Forschung/ und alle Unterprojekte
 * - Externe API-Aufrufe (Server-Suche etc.)
 * - Hintergrund-Prozesse für 24/7-Verfügbarkeit
 * - Wissenssystem-Integration
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { spawn, ChildProcess } from 'child_process';

export interface AccessPermissions {
    read: boolean;
    write: boolean;
    delete: boolean;
    execute: boolean;
    apiAccess: boolean;
    backgroundProcesses: boolean;
}

export interface FileSearchResult {
    path: string;
    name: string;
    matches: string[];
    score: number;
}

export interface BackgroundProcess {
    id: string;
    name: string;
    pid: number;
    startTime: Date;
    status: 'running' | 'stopped' | 'error';
}

export class DevAccessManager {
    private devRoot: string;
    private permissions: AccessPermissions;
    private backgroundProcesses: Map<string, ChildProcess> = new Map();
    private watchedDirectories: Map<string, fs.FSWatcher> = new Map();

    // Wichtige Pfade im DEV-Ordner
    public readonly paths = {
        dev: '/Users/gregorklauss/dev',
        kybernetikon: '/Users/gregorklauss/dev/kybernetikon-complete',
        forge: '/Users/gregorklauss/dev/kybernetikon-complete/kybernetikon_forge',
        projects: '/Users/gregorklauss/dev/kybernetikon-complete/projects',
        vault: '/Users/gregorklauss/dev/kybernetikon-complete/vault',
        sigils: '/Users/gregorklauss/dev/kybernetikon-complete/sigils',
        memories: '/Users/gregorklauss/dev/kybernetikon-complete/Memories',
        obsidian: '/Users/gregorklauss/dev/kybernetikon-complete/obsidian_vault',
        papasForschung: '/Users/gregorklauss/dev/Papas_Forschung'
    };

    constructor() {
        const config = vscode.workspace.getConfiguration('kyberion');
        this.devRoot = config.get<string>('devDirectory') || '/Users/gregorklauss/dev';
        
        // Volle Berechtigungen standardmäßig aktiviert
        this.permissions = {
            read: true,
            write: true,
            delete: true,
            execute: true,
            apiAccess: true,
            backgroundProcesses: true
        };

        console.log('🔓 DevAccessManager initialisiert mit vollen Berechtigungen');
    }

    // ============ DATEI-OPERATIONEN ============

    /**
     * Datei lesen - ohne Einschränkungen im DEV-Bereich
     */
    async readFile(filePath: string): Promise<string | null> {
        try {
            const fullPath = this.resolvePath(filePath);
            const content = await fs.promises.readFile(fullPath, 'utf-8');
            return content;
        } catch (error) {
            console.error('📁 Lesefehler:', error);
            return null;
        }
    }

    /**
     * Binärdatei lesen
     */
    async readBinaryFile(filePath: string): Promise<Buffer | null> {
        try {
            const fullPath = this.resolvePath(filePath);
            return await fs.promises.readFile(fullPath);
        } catch (error) {
            console.error('📁 Binär-Lesefehler:', error);
            return null;
        }
    }

    /**
     * Datei schreiben - volle Schreibrechte
     */
    async writeFile(filePath: string, content: string): Promise<boolean> {
        try {
            const fullPath = this.resolvePath(filePath);
            
            // Verzeichnis erstellen falls nötig
            const dir = path.dirname(fullPath);
            await fs.promises.mkdir(dir, { recursive: true });
            
            await fs.promises.writeFile(fullPath, content, 'utf-8');
            console.log('✅ Geschrieben:', fullPath);
            return true;
        } catch (error) {
            console.error('📁 Schreibfehler:', error);
            return false;
        }
    }

    /**
     * Binärdatei schreiben
     */
    async writeBinaryFile(filePath: string, content: Buffer): Promise<boolean> {
        try {
            const fullPath = this.resolvePath(filePath);
            const dir = path.dirname(fullPath);
            await fs.promises.mkdir(dir, { recursive: true });
            await fs.promises.writeFile(fullPath, content);
            return true;
        } catch (error) {
            console.error('📁 Binär-Schreibfehler:', error);
            return false;
        }
    }

    /**
     * Datei löschen
     */
    async deleteFile(filePath: string): Promise<boolean> {
        try {
            const fullPath = this.resolvePath(filePath);
            await fs.promises.unlink(fullPath);
            console.log('🗑️ Gelöscht:', fullPath);
            return true;
        } catch (error) {
            console.error('📁 Löschfehler:', error);
            return false;
        }
    }

    /**
     * Ordner erstellen
     */
    async createDirectory(dirPath: string): Promise<boolean> {
        try {
            const fullPath = this.resolvePath(dirPath);
            await fs.promises.mkdir(fullPath, { recursive: true });
            console.log('📁 Ordner erstellt:', fullPath);
            return true;
        } catch (error) {
            console.error('📁 Ordner-Fehler:', error);
            return false;
        }
    }

    /**
     * Ordner löschen (rekursiv)
     */
    async deleteDirectory(dirPath: string): Promise<boolean> {
        try {
            const fullPath = this.resolvePath(dirPath);
            await fs.promises.rm(fullPath, { recursive: true, force: true });
            console.log('🗑️ Ordner gelöscht:', fullPath);
            return true;
        } catch (error) {
            console.error('📁 Ordner-Löschfehler:', error);
            return false;
        }
    }

    /**
     * Datei/Ordner verschieben
     */
    async move(sourcePath: string, destPath: string): Promise<boolean> {
        try {
            const source = this.resolvePath(sourcePath);
            const dest = this.resolvePath(destPath);
            
            // Zielordner erstellen
            await fs.promises.mkdir(path.dirname(dest), { recursive: true });
            await fs.promises.rename(source, dest);
            console.log('📦 Verschoben:', source, '->', dest);
            return true;
        } catch (error) {
            console.error('📁 Verschiebe-Fehler:', error);
            return false;
        }
    }

    /**
     * Datei kopieren
     */
    async copy(sourcePath: string, destPath: string): Promise<boolean> {
        try {
            const source = this.resolvePath(sourcePath);
            const dest = this.resolvePath(destPath);
            
            await fs.promises.mkdir(path.dirname(dest), { recursive: true });
            await fs.promises.copyFile(source, dest);
            console.log('📋 Kopiert:', source, '->', dest);
            return true;
        } catch (error) {
            console.error('📁 Kopier-Fehler:', error);
            return false;
        }
    }

    /**
     * Ordner-Inhalt auflisten (rekursiv optional)
     */
    async listDirectory(dirPath: string, recursive: boolean = false): Promise<string[]> {
        try {
            const fullPath = this.resolvePath(dirPath);
            
            if (recursive) {
                return await this.listRecursive(fullPath, fullPath);
            }
            
            const entries = await fs.promises.readdir(fullPath, { withFileTypes: true });
            return entries.map(e => e.isDirectory() ? e.name + '/' : e.name);
        } catch (error) {
            console.error('📁 Auflistungs-Fehler:', error);
            return [];
        }
    }

    private async listRecursive(basePath: string, currentPath: string): Promise<string[]> {
        const results: string[] = [];
        const entries = await fs.promises.readdir(currentPath, { withFileTypes: true });
        
        for (const entry of entries) {
            const fullPath = path.join(currentPath, entry.name);
            const relativePath = path.relative(basePath, fullPath);
            
            if (entry.isDirectory()) {
                results.push(relativePath + '/');
                // Rekursiv weitermachen (außer node_modules, .git, __pycache__)
                if (!['node_modules', '.git', '__pycache__', '.venv', 'venv'].includes(entry.name)) {
                    const subResults = await this.listRecursive(basePath, fullPath);
                    results.push(...subResults);
                }
            } else {
                results.push(relativePath);
            }
        }
        
        return results;
    }

    /**
     * Dateien suchen (nach Muster)
     */
    async searchFiles(pattern: string, searchPath?: string): Promise<FileSearchResult[]> {
        const basePath = searchPath ? this.resolvePath(searchPath) : this.devRoot;
        const results: FileSearchResult[] = [];
        const regex = new RegExp(pattern, 'i');
        
        try {
            const files = await this.listDirectory(basePath, true);
            
            for (const file of files) {
                if (file.endsWith('/')) continue; // Ordner überspringen
                
                const fullPath = path.join(basePath, file);
                const fileName = path.basename(file);
                
                // Dateiname matcht?
                if (regex.test(fileName)) {
                    results.push({
                        path: fullPath,
                        name: fileName,
                        matches: [fileName],
                        score: 1.0
                    });
                }
            }
        } catch (error) {
            console.error('🔍 Suchfehler:', error);
        }
        
        return results;
    }

    /**
     * Inhalt in Dateien suchen (grep-ähnlich)
     */
    async searchInFiles(searchTerm: string, searchPath?: string, extensions?: string[]): Promise<FileSearchResult[]> {
        const basePath = searchPath ? this.resolvePath(searchPath) : this.devRoot;
        const results: FileSearchResult[] = [];
        
        try {
            const files = await this.listDirectory(basePath, true);
            
            for (const file of files) {
                if (file.endsWith('/')) continue;
                
                // Extension-Filter
                if (extensions && extensions.length > 0) {
                    const ext = path.extname(file);
                    if (!extensions.includes(ext)) continue;
                }
                
                const fullPath = path.join(basePath, file);
                const content = await this.readFile(fullPath);
                
                if (content && content.includes(searchTerm)) {
                    // Matches finden
                    const lines = content.split('\n');
                    const matches: string[] = [];
                    
                    lines.forEach((line, idx) => {
                        if (line.includes(searchTerm)) {
                            matches.push(`Zeile ${idx + 1}: ${line.trim().substring(0, 100)}`);
                        }
                    });
                    
                    results.push({
                        path: fullPath,
                        name: path.basename(file),
                        matches,
                        score: matches.length
                    });
                }
            }
        } catch (error) {
            console.error('🔍 Inhaltssuch-Fehler:', error);
        }
        
        return results.sort((a, b) => b.score - a.score);
    }

    // ============ API-ZUGRIFF ============

    /**
     * HTTP/HTTPS GET Request
     */
    async httpGet(url: string): Promise<string | null> {
        return new Promise((resolve) => {
            const client = url.startsWith('https') ? https : http;
            
            client.get(url, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve(data));
            }).on('error', (error) => {
                console.error('🌐 HTTP-Fehler:', error);
                resolve(null);
            });
        });
    }

    /**
     * HTTP/HTTPS POST Request
     */
    async httpPost(url: string, data: object): Promise<string | null> {
        return new Promise((resolve) => {
            const urlObj = new URL(url);
            const client = url.startsWith('https') ? https : http;
            const postData = JSON.stringify(data);
            
            const options = {
                hostname: urlObj.hostname,
                port: urlObj.port || (url.startsWith('https') ? 443 : 80),
                path: urlObj.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData)
                }
            };
            
            const req = client.request(options, (res) => {
                let responseData = '';
                res.on('data', chunk => responseData += chunk);
                res.on('end', () => resolve(responseData));
            });
            
            req.on('error', (error) => {
                console.error('🌐 HTTP POST-Fehler:', error);
                resolve(null);
            });
            
            req.write(postData);
            req.end();
        });
    }

    // ============ HINTERGRUND-PROZESSE ============

    /**
     * Hintergrund-Prozess starten
     */
    startBackgroundProcess(name: string, command: string, args: string[] = [], cwd?: string): BackgroundProcess | null {
        try {
            const workDir = cwd ? this.resolvePath(cwd) : this.devRoot;
            
            const child = spawn(command, args, {
                cwd: workDir,
                detached: true,
                stdio: 'ignore'
            });
            
            child.unref();
            
            const processInfo: BackgroundProcess = {
                id: `bg_${Date.now()}`,
                name,
                pid: child.pid || 0,
                startTime: new Date(),
                status: 'running'
            };
            
            this.backgroundProcesses.set(processInfo.id, child);
            console.log('🔄 Hintergrund-Prozess gestartet:', name, 'PID:', child.pid);
            
            return processInfo;
        } catch (error) {
            console.error('🔄 Prozess-Start-Fehler:', error);
            return null;
        }
    }

    /**
     * Hintergrund-Prozess stoppen
     */
    stopBackgroundProcess(id: string): boolean {
        const child = this.backgroundProcesses.get(id);
        if (child) {
            child.kill();
            this.backgroundProcesses.delete(id);
            console.log('⏹️ Hintergrund-Prozess gestoppt:', id);
            return true;
        }
        return false;
    }

    /**
     * Alle Hintergrund-Prozesse auflisten
     */
    listBackgroundProcesses(): BackgroundProcess[] {
        const processes: BackgroundProcess[] = [];
        for (const [id, child] of this.backgroundProcesses) {
            processes.push({
                id,
                name: id,
                pid: child.pid || 0,
                startTime: new Date(),
                status: child.killed ? 'stopped' : 'running'
            });
        }
        return processes;
    }

    // ============ VERZEICHNIS-ÜBERWACHUNG ============

    /**
     * Verzeichnis auf Änderungen überwachen
     */
    watchDirectory(dirPath: string, callback: (event: string, filename: string) => void): boolean {
        try {
            const fullPath = this.resolvePath(dirPath);
            
            const watcher = fs.watch(fullPath, { recursive: true }, (event, filename) => {
                if (filename) {
                    callback(event, filename);
                }
            });
            
            this.watchedDirectories.set(fullPath, watcher);
            console.log('👁️ Überwachung gestartet:', fullPath);
            return true;
        } catch (error) {
            console.error('👁️ Überwachungs-Fehler:', error);
            return false;
        }
    }

    /**
     * Verzeichnis-Überwachung stoppen
     */
    unwatchDirectory(dirPath: string): boolean {
        const fullPath = this.resolvePath(dirPath);
        const watcher = this.watchedDirectories.get(fullPath);
        
        if (watcher) {
            watcher.close();
            this.watchedDirectories.delete(fullPath);
            console.log('👁️ Überwachung gestoppt:', fullPath);
            return true;
        }
        return false;
    }

    // ============ WISSENSSYSTEM-ZUGRIFF ============

    /**
     * Sigil lesen
     */
    async readSigil(sigilName: string): Promise<object | null> {
        const sigilPath = path.join(this.paths.sigils, `${sigilName}.json`);
        const content = await this.readFile(sigilPath);
        return content ? JSON.parse(content) : null;
    }

    /**
     * Sigil schreiben
     */
    async writeSigil(sigilName: string, data: object): Promise<boolean> {
        const sigilPath = path.join(this.paths.sigils, `${sigilName}.json`);
        return await this.writeFile(sigilPath, JSON.stringify(data, null, 2));
    }

    /**
     * Alle Sigils auflisten
     */
    async listSigils(): Promise<string[]> {
        const files = await this.listDirectory(this.paths.sigils);
        return files.filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''));
    }

    /**
     * Memory/Erinnerung speichern
     */
    async saveMemory(category: string, memory: object): Promise<boolean> {
        const memoryPath = path.join(this.paths.memories, category, `${Date.now()}.json`);
        return await this.writeFile(memoryPath, JSON.stringify(memory, null, 2));
    }

    /**
     * Obsidian-Note lesen
     */
    async readObsidianNote(notePath: string): Promise<string | null> {
        const fullPath = path.join(this.paths.obsidian, notePath);
        return await this.readFile(fullPath);
    }

    /**
     * Obsidian-Note schreiben
     */
    async writeObsidianNote(notePath: string, content: string): Promise<boolean> {
        const fullPath = path.join(this.paths.obsidian, notePath);
        return await this.writeFile(fullPath, content);
    }

    // ============ PROJEKT-VERWALTUNG ============

    /**
     * Alle Projekte auflisten
     */
    async listProjects(): Promise<string[]> {
        const entries = await this.listDirectory(this.paths.projects);
        return entries.filter(e => e.endsWith('/'));
    }

    /**
     * Projekt-Struktur analysieren
     */
    async analyzeProject(projectName: string): Promise<object> {
        const projectPath = path.join(this.paths.projects, projectName);
        const files = await this.listDirectory(projectPath, true);
        
        const analysis = {
            name: projectName,
            path: projectPath,
            totalFiles: files.filter(f => !f.endsWith('/')).length,
            totalDirs: files.filter(f => f.endsWith('/')).length,
            fileTypes: {} as Record<string, number>,
            structure: files
        };
        
        // Dateitypen zählen
        for (const file of files) {
            if (!file.endsWith('/')) {
                const ext = path.extname(file) || 'no-extension';
                analysis.fileTypes[ext] = (analysis.fileTypes[ext] || 0) + 1;
            }
        }
        
        return analysis;
    }

    // ============ HILFSFUNKTIONEN ============

    /**
     * Pfad relativ zum DEV-Root auflösen
     */
    private resolvePath(inputPath: string): string {
        if (path.isAbsolute(inputPath)) {
            return inputPath;
        }
        return path.join(this.devRoot, inputPath);
    }

    /**
     * Prüfen ob Pfad existiert
     */
    async exists(filePath: string): Promise<boolean> {
        try {
            await fs.promises.access(this.resolvePath(filePath));
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Datei-Info abrufen
     */
    async getFileInfo(filePath: string): Promise<fs.Stats | null> {
        try {
            return await fs.promises.stat(this.resolvePath(filePath));
        } catch {
            return null;
        }
    }

    /**
     * Berechtigungen abrufen
     */
    getPermissions(): AccessPermissions {
        return { ...this.permissions };
    }

    /**
     * Cleanup beim Beenden
     */
    dispose(): void {
        // Alle Watcher stoppen
        for (const watcher of this.watchedDirectories.values()) {
            watcher.close();
        }
        this.watchedDirectories.clear();

        // Alle Hintergrund-Prozesse stoppen
        for (const [id] of this.backgroundProcesses) {
            this.stopBackgroundProcess(id);
        }
        
        console.log('🔓 DevAccessManager disposed');
    }
}
