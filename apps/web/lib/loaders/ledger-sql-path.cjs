/**
 * The ledger finds its migrations with `new URL("../sql/", import.meta.url)`. Turbopack reads
 * that as a file to bundle and stops the build, because it is a folder. This loader, which runs
 * on that one file, swaps the expression for the same folder found from where the app runs.
 * Once the ledger no longer has the expression, the loader changes nothing and can go.
 */
module.exports = function ledgerSqlPath(source) {
  return source.replace(
    'new URL("../sql/", import.meta.url)',
    "new URL(`file://${process.cwd()}/../../packages/ledger/sql/`)",
  );
};
