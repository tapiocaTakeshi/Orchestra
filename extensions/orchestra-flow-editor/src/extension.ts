import * as vscode from 'vscode';
import { FlowEditorProvider } from './providers/editorProvider';

export function activate(context: vscode.ExtensionContext) {
  const provider = new FlowEditorProvider(context);

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider('orchestra-flow-editor', provider, {
      webviewOptions: {
        retainContextWhenHidden: true,
      },
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('orchestra-flow-editor.open', async (uri?: vscode.Uri) => {
      if (uri) {
        await vscode.commands.executeCommand('vscode.openWith', uri, 'orchestra-flow-editor');
      }
    })
  );
}

export function deactivate() {}
