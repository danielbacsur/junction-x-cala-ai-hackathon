const MARKER = "/packages/ledger/";

/**
 * The ledger finds its own folders (its migrations, its saved fixtures) with
 * `new URL("../sql/", import.meta.url)`. Turbopack reads that as a file to bundle and stops the
 * build, because it is a folder. This loader runs on the ledger's sources and swaps each such
 * expression for the same folder, found from where the app runs. The web app never reads those
 * folders: only the ledger's own scripts do. Once the ledger no longer has such an expression,
 * the loader changes nothing and can go.
 */
module.exports = function ledgerFolders(source) {
  const file = this.resourcePath.split("\\").join("/");
  const at = file.lastIndexOf(MARKER);

  if (at < 0) return source;

  // Where this file sits inside the ledger package, such as ["src", "research"].
  const here = file
    .slice(at + MARKER.length)
    .split("/")
    .slice(0, -1);

  return source.replace(/new URL\("(\.{1,2}\/[^"]*\/)", import\.meta\.url\)/g, (_expression, relative) => {
    const folder = [...here];

    for (const part of relative.split("/")) {
      if (part === "..") folder.pop();
      else if (part && part !== ".") folder.push(part);
    }

    return "new URL(`file://${process.cwd()}/../../packages/ledger/" + folder.join("/") + "/`)";
  });
};
