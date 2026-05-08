import * as vscode from 'vscode';
import * as path from 'path';
import { FlowParser, FlowValidator } from '../services';
import { FlowDefinition } from '../types/flow';

interface FlowEditorMessage {
  type: 'flowLoaded' | 'flowChanged' | 'validationRequested' | 'exportRequested' | 'ready';
  data?: unknown;
}

export class FlowEditorProvider implements vscode.CustomEditorProvider<FlowEditorDocument> {
  private static readonly viewType = 'orchestra-flow-editor';

  constructor(private context: vscode.ExtensionContext) {}

  async openCustomDocument(uri: vscode.Uri, openContext: vscode.CustomDocumentOpenContext, token: vscode.CancellationToken): Promise<FlowEditorDocument> {
    const document = new FlowEditorDocument(uri);
    const fileData = await vscode.workspace.fs.readFile(uri);
    const fileText = new TextDecoder().decode(fileData);

    try {
      document.flow = FlowParser.parseJSON(fileText);
    } catch (error) {
      document.flow = this.createEmptyFlow(uri);
    }

    return document;
  }

  async saveCustomDocument(document: FlowEditorDocument, cancellation: vscode.CancellationToken): Promise<void> {
    const json = FlowParser.toJSON(document.flow);
    const data = new TextEncoder().encode(json);
    await vscode.workspace.fs.writeFile(document.uri, data);
  }

  async saveCustomDocumentAs(document: FlowEditorDocument, destination: vscode.Uri, cancellation: vscode.CancellationToken): Promise<void> {
    const json = FlowParser.toJSON(document.flow);
    const data = new TextEncoder().encode(json);
    await vscode.workspace.fs.writeFile(destination, data);
    document.uri = destination;
  }

  async revertCustomDocument(document: FlowEditorDocument, cancellation: vscode.CancellationToken): Promise<void> {
    const fileData = await vscode.workspace.fs.readFile(document.uri);
    const fileText = new TextDecoder().decode(fileData);
    try {
      document.flow = FlowParser.parseJSON(fileText);
    } catch {
      document.flow = this.createEmptyFlow(document.uri);
    }
  }

  async backupCustomDocument(document: FlowEditorDocument, backupId: string, cancellation: vscode.CancellationToken): Promise<vscode.CustomDocumentBackup> {
    const backup = await this.saveBackup(document, backupId);
    return backup;
  }

  resolveCustomEditor(document: FlowEditorDocument, webviewPanel: vscode.WebviewPanel, token: vscode.CancellationToken): void {
    webviewPanel.webview.options = {
      enableScripts: true,
      enableCommandUris: true,
    };

    webviewPanel.webview.html = this.getHtmlContent(webviewPanel.webview, document);

    const messageHandler = (message: FlowEditorMessage) => {
      switch (message.type) {
        case 'ready':
          webviewPanel.webview.postMessage({
            type: 'flowData',
            data: document.flow,
          });
          break;

        case 'flowChanged':
          if (message.data && typeof message.data === 'object') {
            document.flow = message.data as FlowDefinition;
            document.isDirty = true;
          }
          break;

        case 'validationRequested':
          const validation = FlowValidator.validate(document.flow);
          webviewPanel.webview.postMessage({
            type: 'validationResult',
            data: validation,
          });
          break;

        case 'exportRequested':
          const json = FlowParser.toJSON(document.flow);
          webviewPanel.webview.postMessage({
            type: 'exportData',
            data: json,
          });
          break;
      }
    };

    webviewPanel.webview.onDidReceiveMessage(messageHandler);
  }

  private getHtmlContent(webview: vscode.Webview, document: FlowEditorDocument): string {
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'editor.css'));
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'editor.js'));

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Orchestra Flow Editor</title>
    <link rel="stylesheet" href="${styleUri}">
</head>
<body>
    <div id="editor-container">
        <div id="toolbar">
            <div class="toolbar-group">
                <h2>Flow Editor</h2>
            </div>
            <div class="toolbar-group">
                <button id="save-btn" title="Save">Save</button>
                <button id="export-btn" title="Export">Export</button>
                <button id="validate-btn" title="Validate">Validate</button>
            </div>
        </div>

        <div id="main-content">
            <div id="toolbox" class="panel">
                <h3>Nodes</h3>
                <div class="toolbox-items">
                    <div class="toolbox-item" data-node-type="start">Start</div>
                    <div class="toolbox-item" data-node-type="task">Task</div>
                    <div class="toolbox-item" data-node-type="decision">Decision</div>
                    <div class="toolbox-item" data-node-type="parallel">Parallel</div>
                    <div class="toolbox-item" data-node-type="merge">Merge</div>
                    <div class="toolbox-item" data-node-type="end">End</div>
                </div>
            </div>

            <div id="canvas-container" class="canvas">
                <svg id="canvas" width="100%" height="100%"></svg>
            </div>

            <div id="properties" class="panel">
                <h3>Properties</h3>
                <div id="properties-content">
                    <p>Select a node to view properties</p>
                </div>
            </div>
        </div>

        <div id="validation-panel" class="panel">
            <h3>Validation</h3>
            <div id="validation-content">
                <p>Ready</p>
            </div>
        </div>
    </div>

    <script src="${scriptUri}"></script>
</body>
</html>`;
  }

  private createEmptyFlow(uri: vscode.Uri): FlowDefinition {
    return {
      id: path.basename(uri.fsPath, path.extname(uri.fsPath)),
      name: path.basename(uri.fsPath, path.extname(uri.fsPath)),
      version: '1.0.0',
      description: '',
      nodes: [],
      edges: [],
      metadata: {
        created: new Date().toISOString(),
      },
    };
  }

  private async saveBackup(document: FlowEditorDocument, backupId: string): Promise<vscode.CustomDocumentBackup> {
    const json = FlowParser.toJSON(document.flow);
    const data = new TextEncoder().encode(json);
    const backupUri = vscode.Uri.file(path.join(path.dirname(document.uri.fsPath), `.${path.basename(document.uri.fsPath)}.backup`));
    await vscode.workspace.fs.writeFile(backupUri, data);

    return {
      id: backupId,
      delete: async () => {
        try {
          await vscode.workspace.fs.delete(backupUri);
        } catch {}
      },
    };
  }
}

class FlowEditorDocument implements vscode.CustomDocument {
  flow: FlowDefinition = {
    id: '',
    name: '',
    version: '1.0.0',
    nodes: [],
    edges: [],
  };

  isDirty = false;

  constructor(public uri: vscode.Uri) {}

  dispose(): void {}
}
