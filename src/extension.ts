import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

// ---------------------------------------------------------------------------
// Keyword-Daten (aus data/goc-keywords.json und data/gp-keywords.json)
// ---------------------------------------------------------------------------

interface KeywordInfo {
  keyword: string;
  syntax: string;
  description: string;
  seeAlso: string;
}

let gocKeywordMap: Map<string, KeywordInfo> = new Map();
let gpKeywordMap: Map<string, KeywordInfo> = new Map();

function loadKeywordData(context: vscode.ExtensionContext) {
  gocKeywordMap = loadKeywordFile(context, 'goc-keywords.json');
  gpKeywordMap = loadKeywordFile(context, 'gp-keywords.json');
}

function loadKeywordFile(context: vscode.ExtensionContext, fileName: string): Map<string, KeywordInfo> {
  try {
    const filePath = path.join(context.extensionPath, 'data', fileName);
    const raw = fs.readFileSync(filePath, 'utf8');
    const entries: KeywordInfo[] = JSON.parse(raw);
    return new Map(entries.map(e => [e.keyword, e]));
  } catch (err) {
    console.error(`GEOS GOC: Konnte ${fileName} nicht laden.`, err);
    return new Map();
  }
}

function buildHover(info: KeywordInfo): vscode.Hover {
  const md = new vscode.MarkdownString(undefined, true);
  if (info.syntax) {
    md.appendCodeblock(info.syntax, 'goc');
  }
  md.appendMarkdown(info.description);
  if (info.seeAlso) {
    md.appendMarkdown(`\n\n**Siehe auch:** ${info.seeAlso}`);
  }
  return new vscode.Hover(md);
}

// Wortmuster inkl. optionalem führendem '@', damit z.B. "@vardataAlias" als
// Ganzes erkannt wird (der Standard-wordPattern der Sprache schließt '@' aus).
const GOC_HOVER_WORD_PATTERN = /@?[A-Za-z_][A-Za-z0-9_]*/;

function registerHoverProviders(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.languages.registerHoverProvider('goc', {
      provideHover(document, position) {
        const range = document.getWordRangeAtPosition(position, GOC_HOVER_WORD_PATTERN);
        if (!range) {
          return undefined;
        }
        const info = gocKeywordMap.get(document.getText(range));
        return info ? buildHover(info) : undefined;
      }
    })
  );

  context.subscriptions.push(
    vscode.languages.registerHoverProvider('geos-gp', {
      provideHover(document, position) {
        const range = document.getWordRangeAtPosition(position);
        if (!range) {
          return undefined;
        }
        const info = gpKeywordMap.get(document.getText(range));
        return info ? buildHover(info) : undefined;
      }
    })
  );
}

// ---------------------------------------------------------------------------
// Outline / Document Symbols für .goc-Dateien
//
// Dies ist bewusst ein leichtgewichtiger, regex-basierter Scanner und kein
// vollständiger Parser. Er deckt die üblichen Muster ab (@class/@endc,
// @classdecl, @object .. = { .. }, @method .. { .. }, @start/@end), kann
// aber bei sehr ungewöhnlich formatiertem Code danebenliegen.
// ---------------------------------------------------------------------------

/**
 * Findet den Index der schließenden geschweiften Klammer, die zur
 * öffnenden Klammer an openIndex gehört. Überspringt dabei String-Literale
 * und Kommentare, damit z.B. eine '}' in einem String nicht mitgezählt wird.
 */
function findMatchingBrace(text: string, openIndex: number): number {
  let depth = 0;
  let i = openIndex;
  const len = text.length;
  while (i < len) {
    const ch = text[i];

    if (ch === '/' && text[i + 1] === '/') {
      const nl = text.indexOf('\n', i);
      i = nl === -1 ? len : nl + 1;
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end === -1 ? len : end + 2;
      continue;
    }
    if (ch === '"' || ch === '\'') {
      const quote = ch;
      i++;
      while (i < len && text[i] !== quote) {
        if (text[i] === '\\') {
          i++;
        }
        i++;
      }
      i++;
      continue;
    }

    if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
    i++;
  }
  return -1;
}

class GocDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
  provideDocumentSymbols(document: vscode.TextDocument): vscode.DocumentSymbol[] {
    const text = document.getText();
    const symbols: vscode.DocumentSymbol[] = [];

    this.collectClassSymbols(text, document, symbols);
    this.collectClassDeclSymbols(text, document, symbols);
    this.collectObjectSymbols(text, document, symbols);
    this.collectMethodSymbols(text, document, symbols);
    this.collectResourceSymbols(text, document, symbols);

    symbols.sort((a, b) => document.offsetAt(a.range.start) - document.offsetAt(b.range.start));
    return symbols;
  }

  private collectClassSymbols(text: string, document: vscode.TextDocument, out: vscode.DocumentSymbol[]) {
    const headerRe = /^[ \t]*@class[ \t]+([A-Za-z_]\w*)/gm;
    let m: RegExpExecArray | null;
    while ((m = headerRe.exec(text))) {
      const name = m[1];
      const startOffset = m.index;
      const endRe = /^[ \t]*@endc\b/gm;
      endRe.lastIndex = headerRe.lastIndex;
      const endMatch = endRe.exec(text);
      const endOffset = endMatch ? endMatch.index + endMatch[0].length : text.length;

      const range = new vscode.Range(document.positionAt(startOffset), document.positionAt(endOffset));
      const nameOffset = startOffset + m[0].lastIndexOf(name);
      const nameRange = new vscode.Range(document.positionAt(nameOffset), document.positionAt(nameOffset + name.length));

      out.push(new vscode.DocumentSymbol(name, 'Klasse', vscode.SymbolKind.Class, range, nameRange));
    }
  }

  private collectClassDeclSymbols(text: string, document: vscode.TextDocument, out: vscode.DocumentSymbol[]) {
    const re = /^[ \t]*@classdecl[ \t]+([A-Za-z_]\w*)/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const name = m[1];
      const lineStart = m.index;
      const nl = text.indexOf('\n', lineStart);
      const lineEnd = nl === -1 ? text.length : nl;
      const range = new vscode.Range(document.positionAt(lineStart), document.positionAt(lineEnd));
      out.push(new vscode.DocumentSymbol(name, 'Klassendeklaration', vscode.SymbolKind.Interface, range, range));
    }
  }

  private collectObjectSymbols(text: string, document: vscode.TextDocument, out: vscode.DocumentSymbol[]) {
    const re = /^[ \t]*@object[ \t]+([A-Za-z_]\w*)[ \t]+([A-Za-z_]\w*)[^{;]*=\s*\{/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const className = m[1];
      const objName = m[2];
      const braceIndex = m.index + m[0].length - 1;
      const closeIndex = findMatchingBrace(text, braceIndex);
      const endOffset = closeIndex === -1 ? text.length : closeIndex + 1;

      const range = new vscode.Range(document.positionAt(m.index), document.positionAt(endOffset));
      const nameOffset = m.index + m[0].lastIndexOf(objName);
      const nameRange = new vscode.Range(document.positionAt(nameOffset), document.positionAt(nameOffset + objName.length));

      out.push(new vscode.DocumentSymbol(objName, className, vscode.SymbolKind.Object, range, nameRange));
    }
  }

  private collectMethodSymbols(text: string, document: vscode.TextDocument, out: vscode.DocumentSymbol[]) {
    const re = /^[ \t]*@method[ \t]+([^{;]+)\{/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const header = m[1].trim().replace(/\s+/g, ' ');
      const parts = header.split(',').map(p => p.trim()).filter(Boolean);
      const displayName = parts.length > 0 ? parts[parts.length - 1] : header;
      const detail = parts.length > 1 ? parts.slice(0, -1).join(', ') : '';

      const braceIndex = m.index + m[0].length - 1;
      const closeIndex = findMatchingBrace(text, braceIndex);
      const endOffset = closeIndex === -1 ? text.length : closeIndex + 1;

      const range = new vscode.Range(document.positionAt(m.index), document.positionAt(endOffset));
      out.push(new vscode.DocumentSymbol(displayName, detail, vscode.SymbolKind.Method, range, range));
    }
  }

  private collectResourceSymbols(text: string, document: vscode.TextDocument, out: vscode.DocumentSymbol[]) {
    const startRe = /^[ \t]*@start[ \t]+([A-Za-z_]\w*)/gm;
    let m: RegExpExecArray | null;
    while ((m = startRe.exec(text))) {
      const name = m[1];
      const startOffset = m.index;
      const endRe = /^[ \t]*@end\b/gm;
      endRe.lastIndex = startRe.lastIndex;
      const endMatch = endRe.exec(text);
      const endOffset = endMatch ? endMatch.index + endMatch[0].length : text.length;

      const range = new vscode.Range(document.positionAt(startOffset), document.positionAt(endOffset));
      out.push(new vscode.DocumentSymbol(name, 'Resource-Block', vscode.SymbolKind.Namespace, range, range));
    }
  }
}

// ---------------------------------------------------------------------------
// Include-Navigation für #include und @include (.goc/.goh)
//
// Der SDK-Pfad wird über eine konfigurierbare Umgebungsvariable ermittelt
// (Einstellung "geos-goc.sdkEnvVar"), da der tatsächliche Name je nach
// SDK-Installation variiert. Zusätzlich werden explizit konfigurierte Pfade
// (geos-goc.includePaths) sowie die vom Watcom-Toolchain üblicherweise
// gesetzte INCLUDE-Umgebungsvariable als Suchpfade berücksichtigt.
// ---------------------------------------------------------------------------

interface IncludeDirective {
  startOffset: number;
  endOffset: number;
  rawPath: string;
  quoted: boolean;
  isHash: boolean;
}

/** Findet alle #include- und @include-Direktiven im Text (reine Offset-Logik, kein vscode-Bezug). */
function findIncludeDirectives(text: string): IncludeDirective[] {
  const results: IncludeDirective[] = [];
  const re = /^[ \t]*(#[ \t]*include|@include)[ \t]*(<([^>]+)>|"([^"]+)")/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const isHash = m[1].startsWith('#');
    const angle = m[3];
    const quotedPath = m[4];
    const rawPath = angle !== undefined ? angle : quotedPath;
    const quoted = angle === undefined;
    const delimGroup = m[2];
    const delimIndexInMatch = m[0].indexOf(delimGroup);
    const startOffset = m.index + delimIndexInMatch + 1;
    const endOffset = startOffset + rawPath.length;
    results.push({ startOffset, endOffset, rawPath, quoted, isHash });
  }
  return results;
}

function splitPathList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  const sep = value.includes(';') ? ';' : path.delimiter;
  return value.split(sep).map(p => p.trim()).filter(Boolean);
}

/** Ermittelt die tatsächlich existierenden Include-Suchverzeichnisse (reine Logik, testbar ohne vscode-API). */
function computeIncludeSearchDirs(
  explicitPaths: string[],
  sdkRoot: string | undefined,
  sdkSubdirs: string[],
  watcomIncludeVar: string | undefined
): string[] {
  const dirs: string[] = [];
  dirs.push(...explicitPaths);
  if (sdkRoot) {
    for (const sub of sdkSubdirs) {
      dirs.push(path.join(sdkRoot, sub));
    }
  }
  dirs.push(...splitPathList(watcomIncludeVar));

  const seen = new Set<string>();
  return dirs.filter(d => {
    if (!d || seen.has(d)) {
      return false;
    }
    seen.add(d);
    try {
      return fs.statSync(d).isDirectory();
    } catch {
      return false;
    }
  });
}

/**
 * Löst einen Include-Pfad auf. Bei Anführungszeichen wird zuerst im
 * Verzeichnis der aktuellen Datei gesucht (wie beim C-Präprozessor), bei
 * spitzen Klammern zuerst in den Standard-Suchverzeichnissen.
 */
function resolveIncludePath(currentFileDir: string, rawPath: string, quoted: boolean, searchDirs: string[]): string | undefined {
  const candidates: string[] = [];
  if (quoted) {
    candidates.push(path.join(currentFileDir, rawPath));
  }
  for (const dir of searchDirs) {
    candidates.push(path.join(dir, rawPath));
  }
  if (!quoted) {
    candidates.push(path.join(currentFileDir, rawPath));
  }
  for (const c of candidates) {
    try {
      if (fs.statSync(c).isFile()) {
        return c;
      }
    } catch {
      // Kandidat existiert nicht, nächsten probieren.
    }
  }
  return undefined;
}

function getSdkRoot(): string | undefined {
  const envVarName = vscode.workspace.getConfiguration('geos-goc').get<string>('sdkEnvVar', 'ROOT_DIR').trim();
  if (!envVarName) {
    return undefined;
  }
  const value = process.env[envVarName];
  return value && value.length > 0 ? value : undefined;
}

/** Ersetzt "${workspaceFolder}" in konfigurierten Pfaden, analog zu tasks.json/launch.json. */
function substituteWorkspaceFolder(p: string, document: vscode.TextDocument): string {
  if (!p.includes('${workspaceFolder}')) {
    return p;
  }
  const folder = vscode.workspace.getWorkspaceFolder(document.uri) ?? vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    return p;
  }
  return p.split('${workspaceFolder}').join(folder.uri.fsPath);
}

function getIncludeSearchDirs(document: vscode.TextDocument): string[] {
  const config = vscode.workspace.getConfiguration('geos-goc');
  const explicitPaths = config
    .get<string[]>('includePaths', [])
    .map(p => substituteWorkspaceFolder(p, document));
  const sdkSubdirs = config.get<string[]>('sdkIncludeSubdirs', ['CInclude']);
  return computeIncludeSearchDirs(explicitPaths, getSdkRoot(), sdkSubdirs, process.env.INCLUDE);
}

class GocIncludeLinkProvider implements vscode.DocumentLinkProvider {
  provideDocumentLinks(document: vscode.TextDocument): vscode.DocumentLink[] {
    const text = document.getText();
    const currentFileDir = path.dirname(document.uri.fsPath);
    const searchDirs = getIncludeSearchDirs(document);
    const links: vscode.DocumentLink[] = [];

    for (const d of findIncludeDirectives(text)) {
      const resolved = resolveIncludePath(currentFileDir, d.rawPath, d.quoted, searchDirs);
      if (resolved) {
        const range = new vscode.Range(document.positionAt(d.startOffset), document.positionAt(d.endOffset));
        const link = new vscode.DocumentLink(range, vscode.Uri.file(resolved));
        link.tooltip = resolved;
        links.push(link);
      }
    }
    return links;
  }
}

/** Diagnostics für Include-Direktiven: .goh nicht via #include, sowie nicht auflösbare Pfade. */
function checkIncludeIssues(document: vscode.TextDocument): vscode.Diagnostic[] {
  const text = document.getText();
  const currentFileDir = path.dirname(document.uri.fsPath);
  const searchDirs = getIncludeSearchDirs(document);
  const diagnostics: vscode.Diagnostic[] = [];

  for (const d of findIncludeDirectives(text)) {
    const range = new vscode.Range(document.positionAt(d.startOffset), document.positionAt(d.endOffset));

    if (d.isHash && /\.goh$/i.test(d.rawPath)) {
      diagnostics.push(new vscode.Diagnostic(
        range,
        '.goh-Dateien enthalten Goc-Syntax, die vom C-Präprozessor/Compiler nicht verarbeitet werden kann. Bitte mit @include statt #include einbinden.',
        vscode.DiagnosticSeverity.Error
      ));
      continue;
    }

    const resolved = resolveIncludePath(currentFileDir, d.rawPath, d.quoted, searchDirs);
    if (!resolved) {
      diagnostics.push(new vscode.Diagnostic(
        range,
        `Datei "${d.rawPath}" wurde in keinem Include-Suchpfad gefunden. SDK-Pfad korrekt über die Einstellung "geos-goc.sdkEnvVar" konfiguriert?`,
        vscode.DiagnosticSeverity.Warning
      ));
    }
  }

  return diagnostics;
}

// ---------------------------------------------------------------------------
// Diagnostics: unbalancierte Direktiven-Blockpaare
// (@start/@end, @class/@endc, @deflib/@endlib, @if(def/ndef)/@endif)
// ---------------------------------------------------------------------------

interface BlockGroup {
  id: string;
  openRe: RegExp;
  closeRe: RegExp;
  label: string;
}

const BLOCK_GROUPS: BlockGroup[] = [
  { id: 'start', openRe: /^[ \t]*@start\b/, closeRe: /^[ \t]*@end\b/, label: '@start / @end' },
  { id: 'class', openRe: /^[ \t]*@class\b/, closeRe: /^[ \t]*@endc\b/, label: '@class / @endc' },
  { id: 'deflib', openRe: /^[ \t]*@deflib\b/, closeRe: /^[ \t]*@endlib\b/, label: '@deflib / @endlib' },
  { id: 'if', openRe: /^[ \t]*@(if|ifdef|ifndef)\b/, closeRe: /^[ \t]*@endif\b/, label: '@if / @ifdef / @ifndef / @endif' }
];

function checkBlockBalance(document: vscode.TextDocument): vscode.Diagnostic[] {
  const diagnostics: vscode.Diagnostic[] = [];
  const stack: { id: string; label: string; line: number }[] = [];

  for (let lineNum = 0; lineNum < document.lineCount; lineNum++) {
    const lineText = document.lineAt(lineNum).text;

    for (const group of BLOCK_GROUPS) {
      if (group.closeRe.test(lineText)) {
        const top = stack[stack.length - 1];
        if (top && top.id === group.id) {
          stack.pop();
        } else {
          diagnostics.push(new vscode.Diagnostic(
            document.lineAt(lineNum).range,
            `Unerwartetes Ende für ${group.label} ohne passenden Anfang im aktuellen Block.`,
            vscode.DiagnosticSeverity.Warning
          ));
        }
        break;
      }
      if (group.openRe.test(lineText)) {
        stack.push({ id: group.id, label: group.label, line: lineNum });
        break;
      }
    }
  }

  for (const entry of stack) {
    diagnostics.push(new vscode.Diagnostic(
      document.lineAt(entry.line).range,
      `${entry.label}: Block wurde bis Dateiende nicht geschlossen.`,
      vscode.DiagnosticSeverity.Warning
    ));
  }

  return diagnostics;
}

function registerDiagnostics(context: vscode.ExtensionContext) {
  const collection = vscode.languages.createDiagnosticCollection('geos-goc');
  context.subscriptions.push(collection);

  const refresh = (doc: vscode.TextDocument) => {
    if (doc.languageId !== 'goc') {
      return;
    }
    const diagnostics = [...checkBlockBalance(doc), ...checkIncludeIssues(doc)];
    collection.set(doc.uri, diagnostics);
  };

  vscode.workspace.textDocuments.forEach(refresh);

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(refresh),
    vscode.workspace.onDidChangeTextDocument(e => {
      if (e.document.languageId !== 'goc') {
        return;
      }
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => refresh(e.document), 400);
    }),
    vscode.workspace.onDidCloseTextDocument(doc => collection.delete(doc.uri)),
    // Include-Suchpfade können sich ändern (Einstellung oder Umgebungsvariable
    // über einen Neustart hinweg) -> bei Konfigurationsänderung neu prüfen.
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('geos-goc')) {
        vscode.workspace.textDocuments.forEach(refresh);
      }
    })
  );
}

// ---------------------------------------------------------------------------
// Aktivierung
// ---------------------------------------------------------------------------

export function activate(context: vscode.ExtensionContext) {
  loadKeywordData(context);
  registerHoverProviders(context);

  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider('goc', new GocDocumentSymbolProvider())
  );

  context.subscriptions.push(
    vscode.languages.registerDocumentLinkProvider('goc', new GocIncludeLinkProvider())
  );

  registerDiagnostics(context);
}

export function deactivate() {}
