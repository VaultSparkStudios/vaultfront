import ts from "typescript";

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete"]);

export function extractExpressRoutes(source, fileName = "Worker.ts") {
  const file = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const routes = [];
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "app" &&
      HTTP_METHODS.has(node.expression.name.text)
    ) {
      const pathArg = node.arguments[0];
      if (pathArg && ts.isStringLiteralLike(pathArg)) {
        const method = node.expression.name.text.toUpperCase();
        routes.push({
          method,
          path: pathArg.text,
          mutation: method !== "GET",
          line:
            file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1,
          registration: node.getText(file),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return routes;
}
