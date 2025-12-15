/**
 * 💬 CHAT VIEW PROVIDER
 * =====================
 * Webview-Provider für das Chat-UI mit Plan/Act Modus
 */

import * as vscode from 'vscode';
import { ForgeClient, ChatMessage, ForgeResponse, ForgePlan, ForgePlanStep } from '../ForgeClient';
import { FileHandler } from '../integrations/FileHandler';
import { DevAccessManager } from '../integrations/DevAccessManager';

export class ChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'kyberion.chatView';

    private view?: vscode.WebviewView;
    private messageHistory: ChatMessage[] = [];
    private isConnected: boolean = false;
    private isPlanMode: boolean = false;
    private currentPlan: ForgePlan | null = null;
    private isExecuting: boolean = false;
    private attachedFiles: { name: string; content: string }[] = [];

    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly forgeClient: ForgeClient,
        private readonly fileHandler: FileHandler,
        private readonly devAccess?: DevAccessManager
    ) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this.view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri]
        };

        webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

        // Initialen Verbindungsstatus senden (nach kurzer Verzögerung, damit Webview bereit ist)
        setTimeout(() => {
            const connected = this.forgeClient.isConnected();
            this.isConnected = connected;
            this.postMessage({ type: 'connectionStatus', connected: connected });
        }, 100);

        // Nachrichten vom Webview empfangen
        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'sendMessage':
                    await this.handleSendMessage(data.message);
                    break;
                case 'connect':
                    await this.handleConnect();
                    break;
                case 'disconnect':
                    this.handleDisconnect();
                    break;
                case 'toggleMode':
                    this.togglePlanMode();
                    break;
                case 'createPlan':
                    await this.handleCreatePlan(data.message);
                    break;
                case 'startExecution':
                    await this.startPlanExecution();
                    break;
                case 'pauseExecution':
                    this.pausePlanExecution();
                    break;
                case 'resumeExecution':
                    await this.resumePlanExecution();
                    break;
                case 'attachFile':
                    await this.handleAttachFile();
                    break;
                case 'removeAttachment':
                    this.removeAttachment(data.index);
                    break;
                case 'clearChat':
                    this.clearChat();
                    break;
            }
        });
    }

    /**
     * Verbindungsstatus aktualisieren
     */
    public updateConnectionStatus(connected: boolean) {
        this.isConnected = connected;
        this.postMessage({ type: 'connectionStatus', connected: connected });
    }

    /**
     * Plan/Act Modus umschalten
     */
    public togglePlanMode() {
        this.isPlanMode = !this.isPlanMode;
        this.postMessage({ type: 'modeChanged', isPlanMode: this.isPlanMode });
    }

    /**
     * Forge-Nachricht verarbeiten (Thoughts, Agent-Aktivitäten)
     */
    public handleForgeMessage(message: ForgeResponse) {
        if (message.type === 'thought') {
            this.postMessage({ 
                type: 'thought', 
                content: message.content,
                agent: message.agent
            });
        } else if (message.type === 'agent_activity') {
            this.postMessage({ 
                type: 'agentActivity', 
                agent: message.agent,
                action: message.content
            });
        }
    }

    /**
     * Datei zum Analysieren senden
     */
    public analyzeFile(filePath: string, content: string) {
        const fileName = filePath.split('/').pop() || filePath;
        this.attachedFiles.push({ name: fileName, content: content });
        this.postMessage({ 
            type: 'fileAttached', 
            files: this.attachedFiles.map(f => f.name) 
        });
        
        // Automatische Nachricht
        const message = 'Bitte analysiere diese Datei: ' + fileName;
        this.handleSendMessage(message);
    }

    /**
     * Nachricht senden
     */
    private async handleSendMessage(message: string) {
        if (!this.isConnected) {
            this.postMessage({ 
                type: 'error', 
                message: 'Nicht verbunden. Bitte zuerst verbinden.' 
            });
            return;
        }

        // Angehängte Dateien zum Message hinzufügen
        let fullMessage = message;
        if (this.attachedFiles.length > 0) {
            fullMessage += '\n\n--- Angehängte Dateien ---\n';
            for (const file of this.attachedFiles) {
                fullMessage += '\n### ' + file.name + ':\n```\n' + file.content + '\n```\n';
            }
            this.attachedFiles = [];
            this.postMessage({ type: 'fileAttached', files: [] });
        }

        // User-Nachricht anzeigen
        this.postMessage({ type: 'userMessage', message: message });
        this.messageHistory.push({ role: 'user', content: message });

        // "Kyberion denkt..." anzeigen
        this.postMessage({ type: 'thinking', isThinking: true });

        try {
            const response = await this.forgeClient.chat(fullMessage, this.messageHistory);
            
            this.postMessage({ type: 'thinking', isThinking: false });

            if (response) {
                const content = response.content || '';
                this.messageHistory.push({ role: 'assistant', content: content });
                this.postMessage({ 
                    type: 'assistantMessage', 
                    message: content,
                    thinking: response.thinking,
                    tools: response.data?.tools_used
                });
            } else {
                this.postMessage({ 
                    type: 'error', 
                    message: 'Keine Antwort vom Server.' 
                });
            }
        } catch (error) {
            this.postMessage({ type: 'thinking', isThinking: false });
            this.postMessage({ 
                type: 'error', 
                message: 'Fehler: ' + String(error) 
            });
        }
    }

    /**
     * Verbinden
     */
    private async handleConnect() {
        this.postMessage({ type: 'connecting' });
        const connected = await this.forgeClient.connect();
        this.updateConnectionStatus(connected);
        
        if (!connected) {
            this.postMessage({ 
                type: 'error', 
                message: 'Verbindung fehlgeschlagen. Läuft die Forge auf Port 8000?' 
            });
        }
    }

    /**
     * Trennen
     */
    private handleDisconnect() {
        this.forgeClient.disconnect();
        this.updateConnectionStatus(false);
    }

    /**
     * Datei anhängen
     */
    private async handleAttachFile() {
        const files = await vscode.window.showOpenDialog({
            canSelectMany: true,
            openLabel: 'Anhängen',
            filters: {
                'Alle Dateien': ['*'],
                'Code': ['py', 'ts', 'js', 'tsx', 'jsx', 'json', 'html', 'css'],
                'Text': ['txt', 'md', 'rtf'],
                'Dokumente': ['pdf']
            }
        });

        if (files && files.length > 0) {
            for (const file of files) {
                const content = await this.fileHandler.readFile(file.fsPath);
                if (content) {
                    const fileName = file.fsPath.split('/').pop() || file.fsPath;
                    this.attachedFiles.push({ name: fileName, content: content });
                }
            }
            this.postMessage({ 
                type: 'fileAttached', 
                files: this.attachedFiles.map(f => f.name) 
            });
        }
    }

    /**
     * Anhang entfernen
     */
    private removeAttachment(index: number) {
        this.attachedFiles.splice(index, 1);
        this.postMessage({ 
            type: 'fileAttached', 
            files: this.attachedFiles.map(f => f.name) 
        });
    }

    /**
     * Chat leeren
     */
    private clearChat() {
        this.messageHistory = [];
        this.attachedFiles = [];
        this.currentPlan = null;
        this.postMessage({ type: 'chatCleared' });
    }

    /**
     * Plan erstellen
     */
    private async handleCreatePlan(taskDescription: string) {
        if (!this.isConnected) {
            this.postMessage({ 
                type: 'error', 
                message: 'Nicht verbunden.' 
            });
            return;
        }

        this.postMessage({ type: 'thinking', isThinking: true, message: 'Erstelle Plan...' });

        try {
            const response = await this.forgeClient.createPlan(taskDescription);
            
            this.postMessage({ type: 'thinking', isThinking: false });

            if (response && response.plan) {
                this.currentPlan = response.plan;
                this.postMessage({ type: 'planCreated', plan: response.plan });
            } else if (response && response.content) {
                // Versuche JSON aus Antwort zu extrahieren
                const plan = this.extractPlanFromResponse(response.content, taskDescription);
                this.currentPlan = plan;
                this.postMessage({ type: 'planCreated', plan: plan });
            }
        } catch (error) {
            this.postMessage({ type: 'thinking', isThinking: false });
            this.postMessage({ 
                type: 'error', 
                message: 'Plan-Erstellung fehlgeschlagen: ' + String(error) 
            });
        }
    }

    /**
     * Plan aus Antwort extrahieren
     */
    private extractPlanFromResponse(response: string, originalTask: string): ForgePlan {
        try {
            // Versuche JSON zu finden
            const jsonMatch = response.match(/\{[\s\S]*"steps"[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                return {
                    id: 'plan-' + Date.now(),
                    title: parsed.title || 'Plan',
                    goal: parsed.goal || originalTask,
                    steps: (parsed.steps || []).map((s: { id?: number; title?: string; description?: string }, idx: number) => ({
                        id: s.id || idx + 1,
                        title: s.title || 'Schritt ' + (idx + 1),
                        description: s.description || '',
                        status: 'pending' as const
                    })),
                    currentStepIndex: 0,
                    status: 'draft'
                };
            }
        } catch (e) {
            console.log('JSON-Parsing fehlgeschlagen, erstelle einfachen Plan');
        }

        // Fallback: Einfacher Plan aus Text
        return {
            id: 'plan-' + Date.now(),
            title: 'Plan für: ' + originalTask.substring(0, 50),
            goal: originalTask,
            steps: [{
                id: 1,
                title: 'Aufgabe analysieren',
                description: originalTask,
                status: 'pending'
            }],
            currentStepIndex: 0,
            status: 'draft'
        };
    }

    /**
     * Plan-Ausführung starten
     */
    private async startPlanExecution() {
        if (!this.currentPlan || this.isExecuting) {
            return;
        }

        this.isExecuting = true;
        this.currentPlan.status = 'running';
        this.postMessage({ type: 'executionStarted' });

        await this.executeNextStep();
    }

    /**
     * Nächsten Schritt ausführen
     */
    private async executeNextStep() {
        if (!this.currentPlan || !this.isExecuting) {
            return;
        }

        const stepIndex = this.currentPlan.currentStepIndex;
        if (stepIndex >= this.currentPlan.steps.length) {
            // Alle Schritte fertig
            this.currentPlan.status = 'completed';
            this.isExecuting = false;
            this.postMessage({ type: 'executionCompleted', plan: this.currentPlan });
            return;
        }

        const step = this.currentPlan.steps[stepIndex];
        step.status = 'in-progress';
        this.postMessage({ type: 'stepStarted', stepIndex: stepIndex, step: step });

        try {
            // Kontext aus bisherigen Schritten
            const context = this.currentPlan.steps
                .slice(0, stepIndex)
                .filter(s => s.status === 'completed')
                .map(s => s.title + ': ' + (s.result || 'OK'))
                .join('\n');

            const response = await this.forgeClient.executeStep(this.currentPlan.id, step.id);

            if (response) {
                step.status = 'completed';
                step.result = response.content || 'Schritt abgeschlossen';
                if (response.files_created) {
                    step.files_created = response.files_created;
                }
                if (response.files_modified) {
                    step.files_modified = response.files_modified;
                }
                this.postMessage({ type: 'stepCompleted', stepIndex: stepIndex, step: step });

                // Nächster Schritt
                this.currentPlan.currentStepIndex++;
                
                // Kleine Pause, dann weiter
                await new Promise(resolve => setTimeout(resolve, 500));
                await this.executeNextStep();
            } else {
                throw new Error('Keine Antwort vom Server');
            }
        } catch (error) {
            step.status = 'failed';
            step.error = String(error);
            this.currentPlan.status = 'failed';
            this.isExecuting = false;
            this.postMessage({ type: 'stepFailed', stepIndex: stepIndex, step: step, error: String(error) });
        }
    }

    /**
     * Ausführung pausieren
     */
    private pausePlanExecution() {
        this.isExecuting = false;
        if (this.currentPlan) {
            this.currentPlan.status = 'paused';
        }
        this.postMessage({ type: 'executionPaused' });
    }

    /**
     * Ausführung fortsetzen
     */
    private async resumePlanExecution() {
        if (!this.currentPlan) {
            return;
        }
        this.isExecuting = true;
        this.currentPlan.status = 'running';
        this.postMessage({ type: 'executionResumed' });
        await this.executeNextStep();
    }

    /**
     * Nachricht an Webview senden
     */
    private postMessage(message: unknown) {
        if (this.view) {
            this.view.webview.postMessage(message);
        }
    }

    /**
     * HTML für Webview generieren
     * WICHTIG: String-Konkatenation statt Template Literals!
     */
    private getHtmlForWebview(_webview: vscode.Webview): string {
        const html: string[] = [];
        
        html.push('<!DOCTYPE html>');
        html.push('<html lang="de">');
        html.push('<head>');
        html.push('<meta charset="UTF-8">');
        html.push('<meta name="viewport" content="width=device-width, initial-scale=1.0">');
        html.push('<title>Kyberion Chat</title>');
        html.push('<style>');
        html.push(this.getStyles());
        html.push('</style>');
        html.push('</head>');
        html.push('<body>');
        html.push(this.getBodyHtml());
        html.push('<script>');
        html.push(this.getScript());
        html.push('</script>');
        html.push('</body>');
        html.push('</html>');
        
        return html.join('\n');
    }

    /**
     * CSS Styles
     */
    private getStyles(): string {
        return [
            '* { box-sizing: border-box; margin: 0; padding: 0; }',
            'body { font-family: var(--vscode-font-family); background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); height: 100vh; display: flex; flex-direction: column; }',
            
            '/* Header */',
            '.header { padding: 10px; border-bottom: 1px solid var(--vscode-panel-border); display: flex; align-items: center; gap: 10px; }',
            '.status-dot { width: 10px; height: 10px; border-radius: 50%; background: #dc3545; }',
            '.status-dot.connected { background: #28a745; }',
            '.header-title { flex: 1; font-weight: bold; }',
            
            '/* Mode Toggle */',
            '.mode-toggle { display: flex; border-radius: 6px; overflow: hidden; border: 1px solid var(--vscode-button-border); }',
            '.mode-btn { padding: 6px 12px; background: transparent; color: var(--vscode-button-foreground); border: none; cursor: pointer; font-size: 12px; }',
            '.mode-btn.active { background: var(--vscode-button-background); }',
            '.mode-btn:hover { background: var(--vscode-button-hoverBackground); }',
            
            '/* Chat Container */',
            '.chat-container { flex: 1; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 12px; }',
            
            '/* Messages */',
            '.message { max-width: 85%; padding: 10px 14px; border-radius: 12px; line-height: 1.5; }',
            '.message.user { align-self: flex-end; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-bottom-right-radius: 4px; }',
            '.message.assistant { align-self: flex-start; background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); border-bottom-left-radius: 4px; }',
            '.message.error { background: #dc354520; border: 1px solid #dc3545; color: #dc3545; }',
            
            '/* Thinking Animation */',
            '.thinking { display: none; align-items: center; gap: 8px; padding: 10px; color: var(--vscode-descriptionForeground); }',
            '.thinking.visible { display: flex; }',
            '.thinking-dots { display: flex; gap: 4px; }',
            '.thinking-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--vscode-button-background); animation: bounce 1.4s infinite ease-in-out both; }',
            '.thinking-dot:nth-child(1) { animation-delay: -0.32s; }',
            '.thinking-dot:nth-child(2) { animation-delay: -0.16s; }',
            '@keyframes bounce { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }',
            
            '/* Thinking Collapsible */',
            '.thinking-content { margin-top: 8px; padding: 8px; background: var(--vscode-textBlockQuote-background); border-radius: 6px; font-size: 12px; color: var(--vscode-descriptionForeground); }',
            '.thinking-toggle { cursor: pointer; color: var(--vscode-textLink-foreground); font-size: 11px; margin-top: 6px; }',
            
            '/* Code Blocks */',
            'pre { background: var(--vscode-textCodeBlock-background); padding: 10px; border-radius: 6px; overflow-x: auto; margin: 8px 0; }',
            'code { font-family: var(--vscode-editor-font-family); font-size: 13px; }',
            
            '/* Plan View */',
            '.plan-container { display: none; flex: 1; overflow-y: auto; padding: 10px; }',
            '.plan-container.visible { display: block; }',
            '.plan-header { font-size: 16px; font-weight: bold; margin-bottom: 10px; }',
            '.plan-goal { color: var(--vscode-descriptionForeground); margin-bottom: 16px; font-size: 13px; }',
            '.plan-steps { display: flex; flex-direction: column; gap: 10px; }',
            '.plan-step { padding: 12px; background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); border-radius: 8px; }',
            '.step-header { display: flex; align-items: center; gap: 8px; }',
            '.step-status { font-size: 16px; }',
            '.step-title { font-weight: 500; flex: 1; }',
            '.step-description { font-size: 12px; color: var(--vscode-descriptionForeground); margin-top: 6px; }',
            '.step-result { font-size: 12px; margin-top: 8px; padding: 8px; background: var(--vscode-textBlockQuote-background); border-radius: 4px; }',
            
            '/* Attachments */',
            '.attachments { display: flex; flex-wrap: wrap; gap: 6px; padding: 6px 10px; border-top: 1px solid var(--vscode-panel-border); }',
            '.attachment { display: flex; align-items: center; gap: 4px; padding: 4px 8px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); border-radius: 4px; font-size: 11px; }',
            '.attachment-remove { cursor: pointer; opacity: 0.7; }',
            '.attachment-remove:hover { opacity: 1; }',
            
            '/* Input Area */',
            '.input-area { padding: 10px; border-top: 1px solid var(--vscode-panel-border); }',
            '.input-row { display: flex; gap: 8px; align-items: flex-end; }',
            '.input-wrapper { flex: 1; display: flex; flex-direction: column; gap: 6px; }',
            'textarea { width: 100%; min-height: 60px; max-height: 150px; padding: 10px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 8px; resize: vertical; font-family: inherit; font-size: 13px; }',
            'textarea:focus { outline: none; border-color: var(--vscode-focusBorder); }',
            
            '/* Buttons */',
            '.btn { padding: 10px 16px; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500; display: flex; align-items: center; justify-content: center; gap: 6px; }',
            '.btn-primary { background: #0078d4; color: white; }',
            '.btn-primary:hover { background: #106ebe; }',
            '.btn-secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }',
            '.btn-secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }',
            '.btn-danger { background: #dc3545; color: white; }',
            '.btn-danger:hover { background: #c82333; }',
            '.btn-icon { padding: 8px; background: transparent; border: 1px solid var(--vscode-button-border); }',
            '.btn-icon:hover { background: var(--vscode-button-hoverBackground); }',
            '.btn:disabled { opacity: 0.5; cursor: not-allowed; }',
            
            '/* Action Buttons (Plan Mode) */',
            '.action-buttons { display: flex; gap: 8px; padding: 10px; border-top: 1px solid var(--vscode-panel-border); }',
            '.action-buttons.hidden { display: none; }',
            
            '/* Welcome */',
            '.welcome { text-align: center; padding: 40px 20px; color: var(--vscode-descriptionForeground); }',
            '.welcome-icon { font-size: 48px; margin-bottom: 16px; }',
            '.welcome-title { font-size: 18px; font-weight: bold; color: var(--vscode-editor-foreground); margin-bottom: 8px; }',
            '.welcome-text { font-size: 13px; line-height: 1.6; }'
        ].join('\n');
    }

    /**
     * Body HTML
     */
    private getBodyHtml(): string {
        return [
            '<!-- Header -->',
            '<div class="header">',
            '  <div class="status-dot" id="statusDot"></div>',
            '  <span class="header-title">Kyberion</span>',
            '  <div class="mode-toggle">',
            '    <button class="mode-btn active" id="chatModeBtn" onclick="setMode(\'chat\')">💬 Chat</button>',
            '    <button class="mode-btn" id="planModeBtn" onclick="setMode(\'plan\')">📋 Plan</button>',
            '  </div>',
            '  <button class="btn btn-icon" onclick="toggleConnection()" id="connectBtn" title="Verbinden">🔌</button>',
            '</div>',
            '',
            '<!-- Chat Container -->',
            '<div class="chat-container" id="chatContainer">',
            '  <div class="welcome" id="welcome">',
            '    <div class="welcome-icon">🌟</div>',
            '    <div class="welcome-title">Willkommen bei Kyberion</div>',
            '    <div class="welcome-text">',
            '      Ich bin dein KI-Assistent.<br>',
            '      Verbinde dich mit dem Backend und starte eine Konversation.',
            '    </div>',
            '  </div>',
            '</div>',
            '',
            '<!-- Plan Container -->',
            '<div class="plan-container" id="planContainer">',
            '  <div class="plan-header" id="planTitle">Neuen Plan erstellen</div>',
            '  <div class="plan-goal" id="planGoal">Beschreibe eine Aufgabe und ich erstelle einen strukturierten Plan.</div>',
            '  <div class="plan-steps" id="planSteps"></div>',
            '</div>',
            '',
            '<!-- Thinking Indicator -->',
            '<div class="thinking" id="thinking">',
            '  <div class="thinking-dots">',
            '    <div class="thinking-dot"></div>',
            '    <div class="thinking-dot"></div>',
            '    <div class="thinking-dot"></div>',
            '  </div>',
            '  <span id="thinkingText">Kyberion denkt...</span>',
            '</div>',
            '',
            '<!-- Attachments -->',
            '<div class="attachments" id="attachments" style="display: none;"></div>',
            '',
            '<!-- Action Buttons (Plan Mode) -->',
            '<div class="action-buttons hidden" id="actionButtons">',
            '  <button class="btn btn-primary" id="actBtn" onclick="startExecution()">▶️ ACT Starten</button>',
            '  <button class="btn btn-secondary" id="pauseBtn" onclick="pauseExecution()" style="display: none;">⏸️ Pause</button>',
            '  <button class="btn btn-secondary" id="resumeBtn" onclick="resumeExecution()" style="display: none;">▶️ Fortsetzen</button>',
            '  <button class="btn btn-secondary" onclick="recreatePlan()">🔄 Neu</button>',
            '</div>',
            '',
            '<!-- Input Area -->',
            '<div class="input-area">',
            '  <div class="input-row">',
            '    <button class="btn btn-icon" onclick="attachFile()" title="Datei anhängen">📎</button>',
            '    <div class="input-wrapper">',
            '      <textarea id="messageInput" placeholder="Nachricht eingeben..." onkeydown="handleKeyDown(event)"></textarea>',
            '    </div>',
            '    <button class="btn btn-primary" onclick="sendMessage()" id="sendBtn">➤</button>',
            '  </div>',
            '</div>'
        ].join('\n');
    }

    /**
     * JavaScript
     */
    private getScript(): string {
        return [
            'const vscode = acquireVsCodeApi();',
            'let isConnected = false;',
            'let isPlanMode = false;',
            'let currentPlan = null;',
            '',
            '// Elemente',
            'const chatContainer = document.getElementById("chatContainer");',
            'const planContainer = document.getElementById("planContainer");',
            'const welcome = document.getElementById("welcome");',
            'const thinking = document.getElementById("thinking");',
            'const thinkingText = document.getElementById("thinkingText");',
            'const statusDot = document.getElementById("statusDot");',
            'const messageInput = document.getElementById("messageInput");',
            'const attachmentsDiv = document.getElementById("attachments");',
            'const actionButtons = document.getElementById("actionButtons");',
            'const planSteps = document.getElementById("planSteps");',
            'const planTitle = document.getElementById("planTitle");',
            'const planGoal = document.getElementById("planGoal");',
            '',
            '// Modus wechseln',
            'function setMode(mode) {',
            '  isPlanMode = mode === "plan";',
            '  document.getElementById("chatModeBtn").classList.toggle("active", !isPlanMode);',
            '  document.getElementById("planModeBtn").classList.toggle("active", isPlanMode);',
            '  chatContainer.style.display = isPlanMode ? "none" : "flex";',
            '  planContainer.classList.toggle("visible", isPlanMode);',
            '  actionButtons.classList.toggle("hidden", !isPlanMode || !currentPlan);',
            '  messageInput.placeholder = isPlanMode ? "Beschreibe die Aufgabe..." : "Nachricht eingeben...";',
            '}',
            '',
            '// Verbindung',
            'function toggleConnection() {',
            '  if (isConnected) {',
            '    vscode.postMessage({ type: "disconnect" });',
            '  } else {',
            '    vscode.postMessage({ type: "connect" });',
            '  }',
            '}',
            '',
            '// Nachricht senden',
            'function sendMessage() {',
            '  const message = messageInput.value.trim();',
            '  if (!message) return;',
            '  ',
            '  if (isPlanMode && !currentPlan) {',
            '    vscode.postMessage({ type: "createPlan", message: message });',
            '  } else {',
            '    vscode.postMessage({ type: "sendMessage", message: message });',
            '  }',
            '  messageInput.value = "";',
            '}',
            '',
            '// Tastatur-Handler',
            'function handleKeyDown(event) {',
            '  if (event.key === "Enter" && !event.shiftKey) {',
            '    event.preventDefault();',
            '    sendMessage();',
            '  }',
            '}',
            '',
            '// Datei anhängen',
            'function attachFile() {',
            '  vscode.postMessage({ type: "attachFile" });',
            '}',
            '',
            '// Plan-Ausführung',
            'function startExecution() {',
            '  vscode.postMessage({ type: "startExecution" });',
            '}',
            '',
            'function pauseExecution() {',
            '  vscode.postMessage({ type: "pauseExecution" });',
            '}',
            '',
            'function resumeExecution() {',
            '  vscode.postMessage({ type: "resumeExecution" });',
            '}',
            '',
            'function recreatePlan() {',
            '  currentPlan = null;',
            '  planSteps.innerHTML = "";',
            '  planTitle.textContent = "Neuen Plan erstellen";',
            '  planGoal.textContent = "Beschreibe eine Aufgabe und ich erstelle einen strukturierten Plan.";',
            '  actionButtons.classList.add("hidden");',
            '}',
            '',
            '// Nachricht hinzufügen',
            'function addMessage(content, type, extra) {',
            '  welcome.style.display = "none";',
            '  ',
            '  const msg = document.createElement("div");',
            '  msg.className = "message " + type;',
            '  ',
            '  // Markdown-ähnliches Rendering',
            '  let html = content;',
            '  // Code-Blöcke',
            '  html = html.replace(/```(\\w*)\\n([\\s\\S]*?)```/g, function(match, lang, code) {',
            '    return "<pre><code class=\\"language-" + lang + "\\">" + escapeHtml(code) + "</code></pre>";',
            '  });',
            '  // Inline-Code',
            '  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");',
            '  // Bold',
            '  html = html.replace(/\\*\\*([^*]+)\\*\\*/g, "<strong>$1</strong>");',
            '  // Newlines',
            '  html = html.replace(/\\n/g, "<br>");',
            '  ',
            '  msg.innerHTML = html;',
            '  ',
            '  // Thinking anzeigen (collapsible)',
            '  if (extra && extra.thinking) {',
            '    const thinkingDiv = document.createElement("div");',
            '    thinkingDiv.className = "thinking-content";',
            '    thinkingDiv.style.display = "none";',
            '    thinkingDiv.textContent = extra.thinking;',
            '    ',
            '    const toggle = document.createElement("div");',
            '    toggle.className = "thinking-toggle";',
            '    toggle.textContent = "💭 Gedanken anzeigen";',
            '    toggle.onclick = function() {',
            '      const visible = thinkingDiv.style.display !== "none";',
            '      thinkingDiv.style.display = visible ? "none" : "block";',
            '      toggle.textContent = visible ? "💭 Gedanken anzeigen" : "💭 Gedanken verbergen";',
            '    };',
            '    ',
            '    msg.appendChild(toggle);',
            '    msg.appendChild(thinkingDiv);',
            '  }',
            '  ',
            '  chatContainer.appendChild(msg);',
            '  chatContainer.scrollTop = chatContainer.scrollHeight;',
            '}',
            '',
            'function escapeHtml(text) {',
            '  const div = document.createElement("div");',
            '  div.textContent = text;',
            '  return div.innerHTML;',
            '}',
            '',
            '// Status-Icon für Plan-Schritt',
            'function getStepStatusIcon(status) {',
            '  switch(status) {',
            '    case "pending": return "⏳";',
            '    case "in-progress": return "🔄";',
            '    case "completed": return "✅";',
            '    case "failed": return "❌";',
            '    default: return "⏳";',
            '  }',
            '}',
            '',
            '// Plan-Schritt rendern',
            'function renderPlanStep(step) {',
            '  const div = document.createElement("div");',
            '  div.className = "plan-step";',
            '  div.id = "step-" + step.id;',
            '  ',
            '  let html = "<div class=\\"step-header\\">";',
            '  html += "<span class=\\"step-status\\">" + getStepStatusIcon(step.status) + "</span>";',
            '  html += "<span class=\\"step-title\\">Schritt " + step.id + ": " + escapeHtml(step.title) + "</span>";',
            '  html += "</div>";',
            '  if (step.description) {',
            '    html += "<div class=\\"step-description\\">" + escapeHtml(step.description) + "</div>";',
            '  }',
            '  if (step.result) {',
            '    html += "<div class=\\"step-result\\">✓ " + escapeHtml(step.result.substring(0, 200)) + "</div>";',
            '  }',
            '  if (step.error) {',
            '    html += "<div class=\\"step-result\\" style=\\"color: #dc3545;\\">✗ " + escapeHtml(step.error) + "</div>";',
            '  }',
            '  ',
            '  div.innerHTML = html;',
            '  return div;',
            '}',
            '',
            '// Plan rendern',
            'function renderPlan(plan) {',
            '  currentPlan = plan;',
            '  planTitle.textContent = "📋 " + plan.title;',
            '  planGoal.textContent = plan.goal;',
            '  planSteps.innerHTML = "";',
            '  ',
            '  for (const step of plan.steps) {',
            '    planSteps.appendChild(renderPlanStep(step));',
            '  }',
            '  ',
            '  actionButtons.classList.remove("hidden");',
            '}',
            '',
            '// Schritt aktualisieren',
            'function updateStep(stepIndex, step) {',
            '  const existing = document.getElementById("step-" + step.id);',
            '  if (existing) {',
            '    existing.replaceWith(renderPlanStep(step));',
            '  }',
            '}',
            '',
            '// Nachrichten von Extension empfangen',
            'window.addEventListener("message", function(event) {',
            '  const data = event.data;',
            '  ',
            '  switch(data.type) {',
            '    case "connectionStatus":',
            '      isConnected = data.connected;',
            '      statusDot.classList.toggle("connected", isConnected);',
            '      document.getElementById("connectBtn").title = isConnected ? "Trennen" : "Verbinden";',
            '      break;',
            '    ',
            '    case "connecting":',
            '      thinkingText.textContent = "Verbinde...";',
            '      thinking.classList.add("visible");',
            '      break;',
            '    ',
            '    case "thinking":',
            '      if (data.isThinking) {',
            '        thinkingText.textContent = data.message || "Kyberion denkt...";',
            '        thinking.classList.add("visible");',
            '      } else {',
            '        thinking.classList.remove("visible");',
            '      }',
            '      break;',
            '    ',
            '    case "userMessage":',
            '      addMessage(data.message, "user");',
            '      break;',
            '    ',
            '    case "assistantMessage":',
            '      addMessage(data.message, "assistant", { thinking: data.thinking, tools: data.tools });',
            '      break;',
            '    ',
            '    case "error":',
            '      addMessage(data.message, "error");',
            '      break;',
            '    ',
            '    case "fileAttached":',
            '      if (data.files && data.files.length > 0) {',
            '        attachmentsDiv.style.display = "flex";',
            '        attachmentsDiv.innerHTML = data.files.map(function(f, i) {',
            '          return "<div class=\\"attachment\\">📄 " + escapeHtml(f) + " <span class=\\"attachment-remove\\" onclick=\\"removeAttachment(" + i + ")\\">×</span></div>";',
            '        }).join("");',
            '      } else {',
            '        attachmentsDiv.style.display = "none";',
            '        attachmentsDiv.innerHTML = "";',
            '      }',
            '      break;',
            '    ',
            '    case "modeChanged":',
            '      setMode(data.isPlanMode ? "plan" : "chat");',
            '      break;',
            '    ',
            '    case "planCreated":',
            '      renderPlan(data.plan);',
            '      thinking.classList.remove("visible");',
            '      break;',
            '    ',
            '    case "executionStarted":',
            '      document.getElementById("actBtn").style.display = "none";',
            '      document.getElementById("pauseBtn").style.display = "flex";',
            '      document.getElementById("resumeBtn").style.display = "none";',
            '      break;',
            '    ',
            '    case "stepStarted":',
            '    case "stepCompleted":',
            '    case "stepFailed":',
            '      updateStep(data.stepIndex, data.step);',
            '      break;',
            '    ',
            '    case "executionPaused":',
            '      document.getElementById("actBtn").style.display = "none";',
            '      document.getElementById("pauseBtn").style.display = "none";',
            '      document.getElementById("resumeBtn").style.display = "flex";',
            '      break;',
            '    ',
            '    case "executionResumed":',
            '      document.getElementById("actBtn").style.display = "none";',
            '      document.getElementById("pauseBtn").style.display = "flex";',
            '      document.getElementById("resumeBtn").style.display = "none";',
            '      break;',
            '    ',
            '    case "executionCompleted":',
            '      document.getElementById("actBtn").style.display = "none";',
            '      document.getElementById("pauseBtn").style.display = "none";',
            '      document.getElementById("resumeBtn").style.display = "none";',
            '      addMessage("✅ Plan erfolgreich abgeschlossen!", "assistant");',
            '      break;',
            '    ',
            '    case "chatCleared":',
            '      chatContainer.innerHTML = "";',
            '      welcome.style.display = "block";',
            '      chatContainer.appendChild(welcome);',
            '      recreatePlan();',
            '      break;',
            '  }',
            '});',
            '',
            'function removeAttachment(index) {',
            '  vscode.postMessage({ type: "removeAttachment", index: index });',
            '}'
        ].join('\n');
    }
}
