import * as vscode from 'vscode';
import { ForgeClient, getForgeClient } from './ForgeClient';
import { ChatViewProvider } from './views/ChatViewProvider';
import { FileHandler } from './integrations/FileHandler';
import { DevAccessManager } from './integrations/DevAccessManager';

let forgeClient: ForgeClient;
let chatViewProvider: ChatViewProvider;
let fileHandler: FileHandler;
let devAccess: DevAccessManager;
let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
    console.log('Kyberion Forge Extension wird aktiviert...');

    const config = vscode.workspace.getConfiguration('kyberion');
    const wsUrl = config.get<string>('forgeWsUrl') || 'ws://localhost:8000/ws/nexus';
    const autoConnect = config.get<boolean>('autoConnect') ?? true;

    forgeClient = getForgeClient(wsUrl);
    fileHandler = new FileHandler();
    devAccess = new DevAccessManager();

    // DevAccessManager global verfügbar machen
    (global as any).kyberionDevAccess = devAccess;

    chatViewProvider = new ChatViewProvider(context.extensionUri, forgeClient, fileHandler, devAccess);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'kyberion.chatView',
            chatViewProvider,
            { webviewOptions: { retainContextWhenHidden: true } }
        )
    );

    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'kyberion.showStatus';
    updateStatusBar(false);
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    registerCommands(context);

    forgeClient.onConnectionChange((connected) => {
        updateStatusBar(connected);
        chatViewProvider.updateConnectionStatus(connected);
    });

    forgeClient.onMessage((message) => {
        if (message.type === 'thought' || message.type === 'agent_activity') {
            chatViewProvider.handleForgeMessage(message);
        }
    });

    if (autoConnect) {
        forgeClient.connect().then(connected => {
            if (connected) {
                vscode.window.showInformationMessage('Kyberion Forge verbunden!');
            }
        });
    }

    console.log('🔓 Kyberion Forge Extension aktiviert mit vollen DEV-Berechtigungen!');
}

function registerCommands(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('kyberion.openChat', () => {
            vscode.commands.executeCommand('kyberion.chatView.focus');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('kyberion.connect', async () => {
            const connected = await forgeClient.connect();
            if (connected) {
                vscode.window.showInformationMessage('Kyberion Forge verbunden!');
            } else {
                vscode.window.showErrorMessage('Verbindung fehlgeschlagen');
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('kyberion.disconnect', () => {
            forgeClient.disconnect();
            vscode.window.showInformationMessage('Forge getrennt.');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('kyberion.analyzeFile', async (uri?: vscode.Uri) => {
            let fileUri = uri;
            if (!fileUri && vscode.window.activeTextEditor) {
                fileUri = vscode.window.activeTextEditor.document.uri;
            }
            if (fileUri) {
                const content = await fileHandler.readFile(fileUri.fsPath);
                if (content) {
                    chatViewProvider.analyzeFile(fileUri.fsPath, content);
                    vscode.commands.executeCommand('kyberion.chatView.focus');
                }
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('kyberion.showStatus', async () => {
            if (!forgeClient.isConnected()) {
                vscode.window.showWarningMessage('Forge nicht verbunden');
                return;
            }
            try {
                const status = await forgeClient.getStatus();
                vscode.window.showInformationMessage('Forge Status OK');
            } catch (error) {
                vscode.window.showErrorMessage('Status Fehler');
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('kyberion.togglePlanMode', () => {
            chatViewProvider.togglePlanMode();
        })
    );
}

function updateStatusBar(connected: boolean) {
    if (connected) {
        statusBarItem.text = '$(flame) Forge';
        statusBarItem.tooltip = 'Kyberion Forge verbunden';
        statusBarItem.backgroundColor = undefined;
    } else {
        statusBarItem.text = '$(debug-disconnect) Forge';
        statusBarItem.tooltip = 'Forge getrennt';
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    }
}

export function deactivate() {
    if (forgeClient) {
        forgeClient.disconnect();
    }
}
