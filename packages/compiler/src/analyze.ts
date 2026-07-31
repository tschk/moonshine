import { readFileSync } from "node:fs";
import ts from "typescript";

export type ModuleFacts = {
  clientBoundary: boolean;
  serverOnly: boolean;
  exportsHandler: boolean;
  exportsLoader: boolean;
  exportsAction: boolean;
  requestBound: boolean;
  interactive: boolean;
  unresolvedDynamicImport: boolean;
};

const HTTP_METHODS = [
  "GET",
  "POST",
  "PUT",
  "DELETE",
  "PATCH",
  "OPTIONS",
  "HEAD",
];

function getSourceFile(file: string, program?: ts.Program): ts.SourceFile {
  if (program) {
    const source = program.getSourceFile(file);
    if (source) return source;
  }
  const text = readFileSync(file, "utf8");
  const scriptKind = file.endsWith(".tsx")
    ? ts.ScriptKind.TSX
    : ts.ScriptKind.TS;
  return ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );
}

function isUseClientDirective(source: ts.SourceFile, node: ts.Node): boolean {
  if (!ts.isExpressionStatement(node)) return false;
  if (node.parent !== source) return false;
  if (!ts.isStringLiteral(node.expression)) return false;
  return node.expression.text === "use client";
}

function isExportedName(node: ts.Node, name: string): boolean {
  const flags = ts.getCombinedModifierFlags(node as ts.Declaration);
  if (!(flags & ts.ModifierFlags.Export)) return false;
  if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) {
    return node.name?.text === name;
  }
  if (ts.isVariableDeclaration(node)) {
    if (ts.isIdentifier(node.name)) return node.name.text === name;
  }
  if (
    ts.isExportDeclaration(node) &&
    node.exportClause &&
    ts.isNamedExports(node.exportClause)
  ) {
    for (const elem of node.exportClause.elements) {
      if (elem.name.text === name) return true;
    }
  }
  return false;
}

function isExportedHandler(node: ts.Node): boolean {
  if (isExportedName(node, "handler")) return true;
  for (const method of HTTP_METHODS) {
    if (isExportedName(node, method)) return true;
  }
  return false;
}

function isRequestBoundImport(node: ts.Node): boolean {
  if (!ts.isImportDeclaration(node)) return false;
  if (!ts.isStringLiteral(node.moduleSpecifier)) return false;
  const text = node.moduleSpecifier.text.toLowerCase();
  return (
    text.includes("cookies") ||
    text.includes("headers") ||
    text.includes("request")
  );
}

function isNonLiteralDynamicImport(node: ts.Node): boolean {
  if (!ts.isCallExpression(node)) return false;
  if (node.expression.kind !== ts.SyntaxKind.ImportKeyword) return false;
  const arg = node.arguments[0];
  return arg !== undefined && !ts.isStringLiteral(arg);
}

function isJsxEventAttribute(node: ts.Node): boolean {
  if (!ts.isJsxAttribute(node)) return false;
  const name = ts.isIdentifier(node.name) ? node.name.text : undefined;
  return !!name && /^on[A-Z]/.test(name);
}

function isIslandCall(node: ts.Node): boolean {
  if (!ts.isCallExpression(node)) return false;
  const expr = node.expression;
  if (ts.isIdentifier(expr)) return expr.text === "island";
  if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.name)) {
    return expr.name.text === "island";
  }
  return false;
}

function getFileSuffix(file: string): "server" | "client" | undefined {
  const lower = file.toLowerCase();
  if (lower.endsWith(".server.ts") || lower.endsWith(".server.tsx"))
    return "server";
  if (lower.endsWith(".client.ts") || lower.endsWith(".client.tsx"))
    return "client";
  return undefined;
}

export function analyzeModule(file: string, program?: ts.Program): ModuleFacts {
  const source = getSourceFile(file, program);
  const suffix = getFileSuffix(file);
  const facts: ModuleFacts = {
    clientBoundary: suffix === "client",
    serverOnly: suffix === "server",
    exportsHandler: false,
    exportsLoader: false,
    exportsAction: false,
    requestBound: false,
    interactive: false,
    unresolvedDynamicImport: false,
  };

  function visit(node: ts.Node) {
    if (isUseClientDirective(source, node)) facts.clientBoundary = true;
    if (isExportedHandler(node)) facts.exportsHandler = true;
    if (isExportedName(node, "loader")) facts.exportsLoader = true;
    if (isExportedName(node, "action")) facts.exportsAction = true;
    if (isRequestBoundImport(node)) facts.requestBound = true;
    if (isNonLiteralDynamicImport(node)) facts.unresolvedDynamicImport = true;
    if (isJsxEventAttribute(node)) facts.interactive = true;
    if (isIslandCall(node)) facts.interactive = true;
    ts.forEachChild(node, visit);
  }

  visit(source);
  return facts;
}
