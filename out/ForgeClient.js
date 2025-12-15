"use strict";
/**
 * 🔥 FORGE CLIENT
 * ===============
 * WebSocket-Client für die Kommunikation mit Kybernetikon Forge Synapse
 *
 * Verbindet sich mit ws://localhost:8000/ws/nexus
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ForgeClient = void 0;
exports.getForgeClient = getForgeClient;
const ws_1 = __importDefault(require("ws"));
class ForgeClient {
    constructor(wsUrl = 'ws://localhost:8000/ws/nexus') {
        this.ws = null;
        this.connected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 2000;
        this.messageHandlers = [];
        this.connectionHandlers = [];
        this.pendingRequests = new Map();
        this.messageQueue = [];
        this.wsUrl = wsUrl;
    }
    /**
     * Listener für eingehende Nachrichten registrieren
     */
    onMessage(handler) {
        this.messageHandlers.push(handler);
    }
    /**
     * Listener für Verbindungsänderungen registrieren
     */
    onConnectionChange(handler) {
        this.connectionHandlers.push(handler);
    }
    /**
     * Verbindungsstatus melden
     */
    notifyConnectionChange(connected) {
        this.connected = connected;
        for (const handler of this.connectionHandlers) {
            handler(connected);
        }
    }
    /**
     * Eingehende Nachricht verarbeiten
     */
    notifyMessage(message) {
        for (const handler of this.messageHandlers) {
            handler(message);
        }
    }
    /**
     * Mit Forge Synapse verbinden
     */
    async connect() {
        return new Promise((resolve) => {
            try {
                // ws Library für Node.js WebSocket
                this.ws = new ws_1.default(this.wsUrl);
                this.ws.on('open', () => {
                    console.log('🔌 Forge Synapse verbunden');
                    this.connected = true;
                    this.reconnectAttempts = 0;
                    this.notifyConnectionChange(true);
                    // Wartende Nachrichten senden
                    this.flushMessageQueue();
                    resolve(true);
                });
                this.ws.on('close', () => {
                    console.log('🔌 Forge Synapse getrennt');
                    this.connected = false;
                    this.notifyConnectionChange(false);
                    // Auto-Reconnect versuchen
                    this.attemptReconnect();
                });
                this.ws.on('error', (error) => {
                    console.error('🔌 Forge Synapse Fehler:', error);
                    this.connected = false;
                    this.notifyConnectionChange(false);
                    resolve(false);
                });
                this.ws.on('message', (data) => {
                    try {
                        const message = JSON.parse(data.toString());
                        this.handleMessage(message);
                    }
                    catch (e) {
                        console.error('Fehler beim Parsen der Nachricht:', e);
                    }
                });
            }
            catch (error) {
                console.error('Verbindungsfehler:', error);
                resolve(false);
            }
        });
    }
    /**
     * Eingehende Nachricht verarbeiten
     */
    handleMessage(message) {
        // Prüfen ob es eine Antwort auf eine ausstehende Anfrage ist
        if (message.type === 'final_answer' || message.type === 'response' || message.type === 'chat_response' || message.type === 'plan_response') {
            // Für final_answer: Suche nach pending request
            for (const [requestId, resolver] of this.pendingRequests.entries()) {
                this.pendingRequests.delete(requestId);
                resolver(message);
                return;
            }
        }
        // Request-ID basierte Auflösung (Fallback)
        if (message.data) {
            const requestId = message.data?.request_id;
            if (requestId && this.pendingRequests.has(requestId)) {
                const resolver = this.pendingRequests.get(requestId);
                this.pendingRequests.delete(requestId);
                resolver(message);
                return;
            }
        }
        // Allgemeine Nachricht-Handler aufrufen
        this.notifyMessage(message);
    }
    /**
     * Warteschlange leeren
     */
    flushMessageQueue() {
        while (this.messageQueue.length > 0) {
            const message = this.messageQueue.shift();
            this.sendRaw(message);
        }
    }
    /**
     * Reconnect versuchen
     */
    attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log('🔌 Max Reconnect-Versuche erreicht');
            return;
        }
        this.reconnectAttempts++;
        console.log(`🔌 Reconnect Versuch ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
        setTimeout(() => {
            this.connect();
        }, this.reconnectDelay * this.reconnectAttempts);
    }
    /**
     * Verbindung trennen
     */
    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.connected = false;
        this.notifyConnectionChange(false);
    }
    /**
     * Prüfen ob verbunden
     */
    isConnected() {
        return this.connected && this.ws?.readyState === ws_1.default.OPEN;
    }
    /**
     * Rohe Nachricht senden
     */
    sendRaw(message) {
        if (!this.ws || this.ws.readyState !== ws_1.default.OPEN) {
            this.messageQueue.push(message);
            return false;
        }
        try {
            this.ws.send(JSON.stringify(message));
            return true;
        }
        catch (error) {
            console.error('Fehler beim Senden:', error);
            this.messageQueue.push(message);
            return false;
        }
    }
    /**
     * Nachricht senden und auf Antwort warten
     */
    async sendAndWait(message, timeoutMs = 60000) {
        return new Promise((resolve, reject) => {
            const requestId = this.generateRequestId();
            const messageWithId = {
                ...message,
                request_id: requestId
            };
            // Timeout setzen
            const timeout = setTimeout(() => {
                this.pendingRequests.delete(requestId);
                reject(new Error('Timeout beim Warten auf Antwort'));
            }, timeoutMs);
            // Resolver registrieren
            this.pendingRequests.set(requestId, (response) => {
                clearTimeout(timeout);
                resolve(response);
            });
            // Nachricht senden
            if (!this.sendRaw(messageWithId)) {
                // Wenn nicht verbunden, versuche zu verbinden
                this.connect().then((connected) => {
                    if (!connected) {
                        clearTimeout(timeout);
                        this.pendingRequests.delete(requestId);
                        reject(new Error('Keine Verbindung zur Forge'));
                    }
                });
            }
        });
    }
    /**
     * Request-ID generieren
     */
    generateRequestId() {
        return 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    // ═══════════════════════════════════════════════════════════════
    // FORGE API METHODEN
    // ═══════════════════════════════════════════════════════════════
    /**
     * Chat-Nachricht senden
     */
    async chat(message, history = [], attachments = []) {
        const forgeMessage = {
            type: 'chat_message',
            content: message,
            data: {
                history: history,
                attachments: attachments
            },
            timestamp: new Date().toISOString()
        };
        return this.sendAndWait(forgeMessage);
    }
    /**
     * Plan erstellen (PLAN-Modus)
     */
    async createPlan(task, context) {
        const forgeMessage = {
            type: 'create_plan',
            content: task,
            data: {
                context: context
            },
            timestamp: new Date().toISOString()
        };
        return this.sendAndWait(forgeMessage, 120000); // 2 Minuten Timeout für Plan-Erstellung
    }
    /**
     * Plan-Schritt ausführen (ACT-Modus)
     */
    async executeStep(planId, stepId) {
        const forgeMessage = {
            type: 'execute_step',
            data: {
                plan_id: planId,
                step_id: stepId
            },
            timestamp: new Date().toISOString()
        };
        return this.sendAndWait(forgeMessage, 180000); // 3 Minuten Timeout für Schritt-Ausführung
    }
    /**
     * Datei lesen
     */
    async readFile(filePath) {
        const forgeMessage = {
            type: 'read_file',
            file_path: filePath,
            timestamp: new Date().toISOString()
        };
        return this.sendAndWait(forgeMessage);
    }
    /**
     * Datei schreiben
     */
    async writeFile(filePath, content) {
        const forgeMessage = {
            type: 'write_file',
            file_path: filePath,
            content: content,
            timestamp: new Date().toISOString()
        };
        return this.sendAndWait(forgeMessage);
    }
    /**
     * Datei analysieren
     */
    async analyzeFile(filePath) {
        const forgeMessage = {
            type: 'analyze_file',
            file_path: filePath,
            timestamp: new Date().toISOString()
        };
        return this.sendAndWait(forgeMessage);
    }
    /**
     * Code ausführen
     */
    async executeCode(code, language = 'python') {
        const forgeMessage = {
            type: 'execute_code',
            code: code,
            data: {
                language: language
            },
            timestamp: new Date().toISOString()
        };
        return this.sendAndWait(forgeMessage);
    }
    /**
     * Projekt erstellen
     */
    async createProject(name, description, requirements) {
        const forgeMessage = {
            type: 'create_project',
            project: name,
            data: {
                description: description,
                requirements: requirements
            },
            timestamp: new Date().toISOString()
        };
        return this.sendAndWait(forgeMessage, 300000); // 5 Minuten für Projekt-Erstellung
    }
    /**
     * Status abfragen
     */
    async getStatus() {
        const forgeMessage = {
            type: 'status',
            timestamp: new Date().toISOString()
        };
        return this.sendAndWait(forgeMessage, 5000);
    }
    /**
     * Masters (Agenten) abfragen
     */
    async getMasters() {
        const forgeMessage = {
            type: 'get_masters',
            timestamp: new Date().toISOString()
        };
        return this.sendAndWait(forgeMessage, 5000);
    }
}
exports.ForgeClient = ForgeClient;
// Singleton-Instanz
let forgeClientInstance = null;
function getForgeClient(wsUrl) {
    if (!forgeClientInstance) {
        forgeClientInstance = new ForgeClient(wsUrl);
    }
    return forgeClientInstance;
}
//# sourceMappingURL=ForgeClient.js.map