'use strict';
// Squiggle for VS Code. Plain CommonJS: no build step and no runtime dependencies.
// Highlighting, snippets and indentation are declarative (see package.json); this file adds
// the "Open in Squiggle Studio" command and the post-length counter in the status bar.

const vscode = require('vscode');
const zlib = require('zlib');

/** POST_LIMIT in packages/core/src/vocab.ts (scripts/gen-grammar.mjs checks they agree). */
const POST_LIMIT = 280;
/** The studio only takes share payloads up to 8,000 characters (decodeCode in packages/core/src/share.ts). */
const MAX_URL = 8000;
/** A piece can be up to 20,000 characters (decodeCode refuses anything bigger). */
const MAX_CODE = 20000;

/** The code as it goes into a post: line endings normalized, trailing blanks dropped (postText in share.ts). */
function postText(code) {
  return code.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').replace(/^\n+/, '').replace(/\n+$/, '');
}

/**
 * Characters as X counts them (postLength in share.ts): most Latin text, punctuation and
 * symbols count 1, everything else (CJK, emoji…) counts 2.
 */
function postLength(code) {
  let n = 0;
  for (const ch of postText(code)) {
    const cp = ch.codePointAt(0);
    const light = cp <= 4351 || (cp >= 8192 && cp <= 8205) || (cp >= 8208 && cp <= 8223) || (cp >= 8242 && cp <= 8247);
    n += light ? 1 : 2;
  }
  return n;
}

/** code → share payload: raw DEFLATE of the UTF-8 bytes, then base64url without padding (encodeCode in share.ts). */
function encodePayload(code) {
  return zlib.deflateRawSync(Buffer.from(code, 'utf8'), { level: 9 }).toString('base64url');
}

/** The studio link for a piece of code. */
function studioLink(code, base) {
  return `${base.replace(/\/+$/, '')}/studio?c=${encodePayload(code)}`;
}

/** The site from the squiggle.studioUrl setting, or undefined (with an error shown) when it isn't usable. */
function studioBase() {
  const config = vscode.workspace.getConfiguration('squiggle');
  const fallback = config.inspect('studioUrl')?.defaultValue;
  const url = String(config.get('studioUrl') || '').trim() || fallback;
  if (!/^https?:\/\/[^/\s]+/i.test(url || '')) {
    void vscode.window
      .showErrorMessage(`The squiggle.studioUrl setting ("${url}") isn't a web address.`, 'Open Settings')
      .then((pick) => pick && vscode.commands.executeCommand('workbench.action.openSettings', 'squiggle.studioUrl'));
    return undefined;
  }
  return url.replace(/\/+$/, '');
}

/** The editor the command is about: the one showing `uri` when a menu passes it, else the active one. */
async function targetEditorOrDocument(uri) {
  const active = vscode.window.activeTextEditor;
  if (!(uri instanceof vscode.Uri) || (active && active.document.uri.toString() === uri.toString())) {
    return { editor: active, document: active && active.document };
  }
  const visible = vscode.window.visibleTextEditors.find((e) => e.document.uri.toString() === uri.toString());
  if (visible) return { editor: visible, document: visible.document };
  return { editor: undefined, document: await vscode.workspace.openTextDocument(uri) };
}

async function openInStudio(uri) {
  const { editor, document } = await targetEditorOrDocument(uri);
  if (!document) {
    void vscode.window.showErrorMessage('Open a Squiggle (.sqg) file first.');
    return;
  }

  // The selection when there is one, otherwise the whole file.
  let code = '';
  let what = 'this file';
  if (editor && !editor.selection.isEmpty) {
    code = document.getText(editor.selection);
    what = 'the selection';
  }
  if (!code.trim()) {
    code = document.getText();
    what = 'this file';
  }
  code = code.replace(/\r\n?/g, '\n');
  if (!code.trim()) {
    void vscode.window.showInformationMessage('There is no Squiggle code to open yet.');
    return;
  }

  const bytes = Buffer.byteLength(code, 'utf8');
  if (bytes > MAX_CODE) {
    void vscode.window.showErrorMessage(
      `Squiggle Studio takes pieces up to ${MAX_CODE.toLocaleString('en-US')} characters; ${what} has ${bytes.toLocaleString('en-US')}.`,
    );
    return;
  }

  const base = studioBase();
  if (!base) return;
  const url = studioLink(code, base);
  if (url.length > MAX_URL) {
    void vscode.window.showErrorMessage(
      `The link for ${what} would be ${url.length.toLocaleString('en-US')} characters, over the ${MAX_URL.toLocaleString('en-US')} a share link can hold. Select a smaller part, or trim the piece.`,
    );
    return;
  }
  const opened = await vscode.env.openExternal(vscode.Uri.parse(url));
  if (!opened) void vscode.window.showWarningMessage('Squiggle Studio did not open.');
}

function activate(context) {
  const item = vscode.window.createStatusBarItem('squiggle.postLength', vscode.StatusBarAlignment.Right, 100);
  item.name = 'Squiggle Post Length';
  item.command = { command: 'squiggle.openInStudio', title: 'Open in Squiggle Studio' };

  const refresh = () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'squiggle') {
      item.hide();
      return;
    }
    const n = postLength(editor.document.getText());
    const fits = n <= POST_LIMIT;
    item.text = `${n} / ${POST_LIMIT}`;
    item.tooltip =
      `Squiggle: ${n} / ${POST_LIMIT} characters, counted the way X counts them` +
      (fits ? ' · fits in a post' : ` · ${n - POST_LIMIT} over a post`) +
      '\nClick to open in Squiggle Studio';
    item.backgroundColor = fits ? undefined : new vscode.ThemeColor('statusBarItem.warningBackground');
    item.accessibilityInformation = {
      label: `Squiggle post length: ${n} of ${POST_LIMIT} characters${fits ? ', fits in a post' : ''}`,
      role: 'button',
    };
    item.show();
  };

  context.subscriptions.push(
    item,
    vscode.commands.registerCommand('squiggle.openInStudio', openInStudio),
    vscode.window.onDidChangeActiveTextEditor(refresh),
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document === vscode.window.activeTextEditor?.document) refresh();
    }),
    // Changing a file's language mode reopens its document.
    vscode.workspace.onDidOpenTextDocument(refresh),
  );
  refresh();
}

function deactivate() {}

module.exports = { activate, deactivate, postText, postLength, encodePayload, studioLink, POST_LIMIT, MAX_URL };
