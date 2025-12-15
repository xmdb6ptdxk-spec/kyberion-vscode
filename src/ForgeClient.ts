/**
 * 🔥 FORGE CLIENT
 * ===============
 * WebSocket-Client für die Kommunikation mit Kybernetikon Forge Synapse
 * 
 * Verbindet sich mit ws://localhost:8000/ws/nexus
 */

import * as vscode from 'vscode';
import WebSocket from 'ws';

// Typen für Forge-Kommunikation
export interface ForgeMessage {
    type: string;
    content?: string;
    data?: Record<string, unknown>;
    timestamp?: string;
    project?: string;
    file_path?: string;
    code?: string;
    error?: string;
}

export interface ForgeResponse {
    type: string;
    content?: string;
    thinking?: string;
    data?: Record<string, unknown>;
    timestamp?: string;
    agent?: string;
    plan?: ForgePlan;
    files_created?: string[];
    files_modified?: string[];
}

export interface ForgePlanStep {
    id: number;
    title: string;
    description: string;
    status: 'pending' | 'in-progress' | 'completed' | 'failed';
    result?: string;
    error?: string;
    files_created?: string[];
    files_modified?: string[];
}

export interface ForgePlan {
    id: string;
    title: string;
    goal: string;
    steps: ForgePlanStep[];
    currentStepIndex: number;
    status: 'draft' | 'running' | 'paused' | 'completed' | 'failed';
}

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    thinking?: string;
}

type MessageHandler = (message: ForgeResponse) => void;
type ConnectionHandler = (connected: boolean) => void;

export class ForgeClient {
    private wsUrl: string;
    private ws: WebSocket | null = null;
    private connected: boolean = false;
    private reconnectAttempts: number = 0;
    private maxReconnectAttempts: number = 10;
    private reconnectDelay: number = 2000;
    private messageHandlers: MessageHandler[] = [];
    private connectionHandlers: ConnectionHandler[] = [];
    private pendingRequests: Map<string, (response: ForgeResponse) => void> = new Map();
    private messageQueue: ForgeMessage[] = [];
    private heartbeatInterval: NodeJS.Timeout | null = null;
    private heartbeatTimeout: number = 30000; // 30 Sekunden

    constructor(wsUrl: string = 'ws://localhost:8000/ws/nexus') {
        this.wsUrl = wsUrl;
    }

    /**
     * Heartbeat starten um Verbindung am Leben zu halten
     */
    private startHeartbeat(): void {
        this.stopHeartbeat();
        this.heartbeatInterval = setInterval(() => {
            if (this.connected && this.ws) {
                this.sendRaw({
                    type: 'heartbeat',
                    timestamp: new Date().toISOString()
                });
            }
        }, this.heartbeatTimeout);
    }

    /**
     * Heartbeat stoppen
     */
    private stopHeartbeat(): void {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    /**
     * Listener für eingehende Nachrichten registrieren
     */
    onMessage(handler: MessageHandler): void {
        this.messageHandlers.push(handler);
    }

    /**
     * Listener für Verbindungsänderungen registrieren
     */
    onConnectionChange(handler: ConnectionHandler): void {
        this.connectionHandlers.push(handler);
    }

    /**
     * Verbindungsstatus melden
     */
    private notifyConnectionChange(connected: boolean): void {
        this.connected = connected;
        for (const handler of this.connectionHandlers) {
            handler(connected);
        }
    }

    /**
     * Eingehende Nachricht verarbeiten
     */
    private notifyMessage(message: ForgeResponse): void {
        for (const handler of this.messageHandlers) {
            handler(message);
        }
    }

    /**
     * Mit Forge Synapse verbinden
     */
    async connect(): Promise<boolean> {
        return new Promise((resolve) => {
            try {
                // ws Library für Node.js WebSocket
                this.ws = new WebSocket(this.wsUrl);

                this.ws.on('open', () => {
                    console.log('🔌 Forge Synapse verbunden');
                    this.connected = true;
                    this.reconnectAttempts = 0;
                    this.notifyConnectionChange(true);
                    
                    // Heartbeat starten
                    this.startHeartbeat();
                    
                    // Wartende Nachrichten senden
                    this.flushMessageQueue();
                    
                    resolve(true);
                });

                this.ws.on('close', () => {
                    console.log('🔌 Forge Synapse getrennt');
                    this.connected = false;
                    this.stopHeartbeat();
                    this.notifyConnectionChange(false);
                    
                    // Auto-Reconnect versuchen
                    this.attemptReconnect();
                });

                this.ws.on('error', (error) => {
                    console.error('🔌 Forge Synapse Fehler:', error);
                    this.connected = false;
                    this.stopHeartbeat();
                    this.notifyConnectionChange(false);
                    resolve(false);
                });

                this.ws.on('message', (data: WebSocket.Data) => {
                    try {
                        const message = JSON.parse(data.toString()) as ForgeResponse;
                        this.handleMessage(message);
                    } catch (e) {
                        console.error('Fehler beim Parsen der Nachricht:', e);
                    }
                });

            } catch (error) {
                console.error('Verbindungsfehler:', error);
                resolve(false);
            }
        });
    }

    /**
     * Eingehende Nachricht verarbeiten
     */
    private handleMessage(message: ForgeResponse): void {
        // Heartbeat-Ack ignorieren
        if (message.type === 'heartbeat_ack') {
            return;
        }

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
            const requestId = (message.data as Record<string, string>)?.request_id;
            if (requestId && this.pendingRequests.has(requestId)) {
                const resolver = this.pendingRequests.get(requestId)!;
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
    private flushMessageQueue(): void {
        while (this.messageQueue.length > 0) {
            const message = this.messageQueue.shift()!;
            this.sendRaw(message);
        }
    }

    /**
     * Reconnect versuchen
     */
    private attemptReconnect(): void {
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
    disconnect(): void {
        this.stopHeartbeat();
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
    isConnected(): boolean {
        return this.connected && this.ws?.readyState === WebSocket.OPEN;
    }

    /**
     * Rohe Nachricht senden
     */
    private sendRaw(message: ForgeMessage): boolean {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.messageQueue.push(message);
            return false;
        }

        try {
            this.ws.send(JSON.stringify(message));
            return true;
        } catch (error) {
            console.error('Fehler beim Senden:', error);
            this.messageQueue.push(message);
            return false;
        }
    }

    /**
     * Nachricht senden und auf Antwort warten
     */
    async sendAndWait(message: ForgeMessage, timeoutMs: number = 60000): Promise<ForgeResponse> {
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
    private generateRequestId(): string {
        return 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // ═══════════════════════════════════════════════════════════════
    // FORGE API METHODEN
    // ═══════════════════════════════════════════════════════════════

    /**
     * Chat-Nachricht senden
     */
    async chat(message: string, history: ChatMessage[] = [], attachments: string[] = []): Promise<ForgeResponse> {
        const forgeMessage: ForgeMessage = {
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
    async createPlan(task: string, context?: string): Promise<ForgeResponse> {
        const forgeMessage: ForgeMessage = {
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
    async executeStep(planId: string, stepId: number): Promise<ForgeResponse> {
        const forgeMessage: ForgeMessage = {
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
    async readFile(filePath: string): Promise<ForgeResponse> {
        const forgeMessage: ForgeMessage = {
            type: 'read_file',
            file_path: filePath,
            timestamp: new Date().toISOString()
        };

        return this.sendAndWait(forgeMessage);
    }

    /**
     * Datei schreiben
     */
    async writeFile(filePath: string, content: string): Promise<ForgeResponse> {
        const forgeMessage: ForgeMessage = {
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
    async analyzeFile(filePath: string): Promise<ForgeResponse> {
        const forgeMessage: ForgeMessage = {
            type: 'analyze_file',
            file_path: filePath,
            timestamp: new Date().toISOString()
        };

        return this.sendAndWait(forgeMessage);
    }

    /**
     * Code ausführen
     */
    async executeCode(code: string, language: string = 'python'): Promise<ForgeResponse> {
        const forgeMessage: ForgeMessage = {
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
    async createProject(name: string, description: string, requirements?: string): Promise<ForgeResponse> {
        const forgeMessage: ForgeMessage = {
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
    async getStatus(): Promise<ForgeResponse> {
        const forgeMessage: ForgeMessage = {
            type: 'status',
            timestamp: new Date().toISOString()
        };

        return this.sendAndWait(forgeMessage, 5000);
    }

    /**
     * Masters (Agenten) abfragen
     */
    async getMasters(): Promise<ForgeResponse> {
        const forgeMessage: ForgeMessage = {
            type: 'get_masters',
            timestamp: new Date().toISOString()
        };

        return this.sendAndWait(forgeMessage, 5000);
    }
}

// Singleton-Instanz
let forgeClientInstance: ForgeClient | null = null;

export function getForgeClient(wsUrl?: string): ForgeClient {
    if (!forgeClientInstance) {
        forgeClientInstance = new ForgeClient(wsUrl);
    }
    return forgeClientInstance;
}
