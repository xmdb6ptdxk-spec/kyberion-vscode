/**
 * 🔌 NEXUS CLIENT
 * ===============
 * API-Client für die Kommunikation mit dem Kybernetikon Backend
 */

// Typen für API-Antworten
export interface ChatResponse {
    response: string;
    thinking?: string;
    tools_used?: ToolUsage[];
    prompt_analysis?: PromptAnalysis;
}

export interface ToolUsage {
    tool: string;
    args: Record<string, unknown>;
    result: unknown;
}

export interface PromptAnalysis {
    quality: string;
    quality_score: number;
    language: string;
    domain: string;
    issues: string[];
    ambiguities: string[];
    suggestions: string[];
    improved_versions: string[];
    clarifying_questions: string[];
}

export interface SystemStatus {
    agent_count?: number;
    mode?: string;
    uptime?: number;
    phi_level?: number;
    consciousness_level?: string;
}

export interface PlanStep {
    id: number;
    title: string;
    description: string;
    status: 'pending' | 'in-progress' | 'completed' | 'failed';
    result?: string;
    error?: string;
    files_created?: string[];
    files_modified?: string[];
}

export interface Plan {
    id: string;
    title: string;
    goal: string;
    steps: PlanStep[];
    currentStepIndex: number;
    status: 'draft' | 'running' | 'paused' | 'completed' | 'failed';
    createdAt: Date;
    updatedAt: Date;
}

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

export class NexusClient {
    private apiUrl: string;
    private connected: boolean = false;
    private connectionListeners: ((connected: boolean) => void)[] = [];

    constructor(apiUrl: string) {
        this.apiUrl = apiUrl;
    }

    /**
     * Listener für Verbindungsänderungen registrieren
     */
    onConnectionChange(listener: (connected: boolean) => void): void {
        this.connectionListeners.push(listener);
    }

    /**
     * Verbindungsstatus melden
     */
    private notifyConnectionChange(connected: boolean): void {
        this.connected = connected;
        for (const listener of this.connectionListeners) {
            listener(connected);
        }
    }

    /**
     * Mit Backend verbinden
     */
    async connect(): Promise<boolean> {
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
        } catch (error) {
            console.error('Verbindung fehlgeschlagen:', error);
            this.notifyConnectionChange(false);
            return false;
        }
    }

    /**
     * Verbindung trennen
     */
    disconnect(): void {
        this.notifyConnectionChange(false);
    }

    /**
     * Verbindungsstatus prüfen
     */
    isConnected(): boolean {
        return this.connected;
    }

    /**
     * Chat-Nachricht senden
     */
    async chat(message: string, history: ChatMessage[] = [], mode: 'chat' | 'plan' | 'act' = 'chat'): Promise<ChatResponse | null> {
        try {
            const body: Record<string, unknown> = {
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
                return await response.json() as ChatResponse;
            }
            return null;
        } catch (error) {
            console.error('Chat-Fehler:', error);
            return null;
        }
    }

    /**
     * Plan-Schritt ausführen
     */
    async executeStep(step: PlanStep, context: string): Promise<ChatResponse | null> {
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
                return await response.json() as ChatResponse;
            }
            return null;
        } catch (error) {
            console.error('Schritt-Ausführung fehlgeschlagen:', error);
            return null;
        }
    }

    /**
     * System-Status abrufen
     */
    async getStatus(): Promise<SystemStatus | null> {
        try {
            const response = await this.fetchWithTimeout(this.apiUrl + '/api/system/status', {
                method: 'GET'
            });

            if (response.ok) {
                return await response.json() as SystemStatus;
            }
            return null;
        } catch (error) {
            console.error('Status-Abruf fehlgeschlagen:', error);
            return null;
        }
    }

    /**
     * Agenten-Liste abrufen
     */
    async getAgents(): Promise<unknown[] | null> {
        try {
            const response = await this.fetchWithTimeout(this.apiUrl + '/api/mind/agents', {
                method: 'GET'
            });

            if (response.ok) {
                const data = await response.json() as { agents?: unknown[] };
                return data.agents || [];
            }
            return null;
        } catch (error) {
            console.error('Agenten-Abruf fehlgeschlagen:', error);
            return null;
        }
    }

    /**
     * Datei lesen (über Backend)
     */
    async readFile(path: string): Promise<string | null> {
        try {
            const response = await this.fetchWithTimeout(this.apiUrl + '/api/file/read', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ path: path })
            });

            if (response.ok) {
                const data = await response.json() as { content?: string };
                return data.content || null;
            }
            return null;
        } catch (error) {
            console.error('Datei-Lesen fehlgeschlagen:', error);
            return null;
        }
    }

    /**
     * Fetch mit Timeout
     */
    private async fetchWithTimeout(url: string, options: RequestInit, timeout: number = 60000): Promise<Response> {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);

        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            clearTimeout(id);
            return response;
        } catch (error) {
            clearTimeout(id);
            throw error;
        }
    }
}
