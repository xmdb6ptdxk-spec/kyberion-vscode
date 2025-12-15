"use strict";
/**
 * 🔌 NEXUS CLIENT
 * ===============
 * API-Client für die Kommunikation mit dem Kybernetikon Backend
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.NexusClient = void 0;
class NexusClient {
    constructor(apiUrl) {
        this.connected = false;
        this.connectionListeners = [];
        this.apiUrl = apiUrl;
    }
    /**
     * Listener für Verbindungsänderungen registrieren
     */
    onConnectionChange(listener) {
        this.connectionListeners.push(listener);
    }
    /**
     * Verbindungsstatus melden
     */
    notifyConnectionChange(connected) {
        this.connected = connected;
        for (const listener of this.connectionListeners) {
            listener(connected);
        }
    }
    /**
     * Mit Backend verbinden
     */
    async connect() {
        try {
            const response = await this.fetchWithTimeout(this.apiUrl + '/api/system/status', {
                method: 'GET'
            });
            if (response.ok) {
                this.notifyConnectionChange(true);
                return true;
            }
            this.notifyConnectionChange(false);
            return false;
        }
        catch (error) {
            console.error('Verbindung fehlgeschlagen:', error);
            this.notifyConnectionChange(false);
            return false;
        }
    }
    /**
     * Verbindung trennen
     */
    disconnect() {
        this.notifyConnectionChange(false);
    }
    /**
     * Verbindungsstatus prüfen
     */
    isConnected() {
        return this.connected;
    }
    /**
     * Chat-Nachricht senden
     */
    async chat(message, history = [], mode = 'chat') {
        try {
            const body = {
                message: message,
                history: history
            };
            // Plan-Modus: Prefix für Plan-Erstellung
            if (mode === 'plan') {
                body.message = 'Erstelle einen strukturierten Plan für folgende Aufgabe. Antworte NUR mit einem JSON-Objekt im Format: {"title": "...", "goal": "...", "steps": [{"id": 1, "title": "...", "description": "..."}]}. Aufgabe: ' + message;
            }
            const response = await this.fetchWithTimeout(this.apiUrl + '/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });
            if (response.ok) {
                return await response.json();
            }
            return null;
        }
        catch (error) {
            console.error('Chat-Fehler:', error);
            return null;
        }
    }
    /**
     * Plan-Schritt ausführen
     */
    async executeStep(step, context) {
        try {
            const message = 'Führe folgenden Schritt aus und gib das Ergebnis zurück. ' +
                'Schritt: ' + step.title + '. ' +
                'Beschreibung: ' + step.description + '. ' +
                'Bisheriger Kontext: ' + context;
            const response = await this.fetchWithTimeout(this.apiUrl + '/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: message,
                    mode: 'act'
                })
            });
            if (response.ok) {
                return await response.json();
            }
            return null;
        }
        catch (error) {
            console.error('Schritt-Ausführung fehlgeschlagen:', error);
            return null;
        }
    }
    /**
     * System-Status abrufen
     */
    async getStatus() {
        try {
            const response = await this.fetchWithTimeout(this.apiUrl + '/api/system/status', {
                method: 'GET'
            });
            if (response.ok) {
                return await response.json();
            }
            return null;
        }
        catch (error) {
            console.error('Status-Abruf fehlgeschlagen:', error);
            return null;
        }
    }
    /**
     * Agenten-Liste abrufen
     */
    async getAgents() {
        try {
            const response = await this.fetchWithTimeout(this.apiUrl + '/api/mind/agents', {
                method: 'GET'
            });
            if (response.ok) {
                const data = await response.json();
                return data.agents || [];
            }
            return null;
        }
        catch (error) {
            console.error('Agenten-Abruf fehlgeschlagen:', error);
            return null;
        }
    }
    /**
     * Datei lesen (über Backend)
     */
    async readFile(path) {
        try {
            const response = await this.fetchWithTimeout(this.apiUrl + '/api/file/read', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ path: path })
            });
            if (response.ok) {
                const data = await response.json();
                return data.content || null;
            }
            return null;
        }
        catch (error) {
            console.error('Datei-Lesen fehlgeschlagen:', error);
            return null;
        }
    }
    /**
     * Fetch mit Timeout
     */
    async fetchWithTimeout(url, options, timeout = 60000) {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);
        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            clearTimeout(id);
            return response;
        }
        catch (error) {
            clearTimeout(id);
            throw error;
        }
    }
}
exports.NexusClient = NexusClient;
//# sourceMappingURL=NexusClient.js.map