const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const context = { window: {} };

vm.runInNewContext(
    fs.readFileSync("src/dashboard/js/format.js", "utf8"),
    context
);

const Fmt = context.window.Fmt;

assert.strictEqual(Fmt.csvCell("Kanha"), "Kanha");
assert.strictEqual(Fmt.csvCell("=1+1"), "'=1+1");
assert.strictEqual(Fmt.csvCell("+SUM(A1:A5)"), "'+SUM(A1:A5)");
assert.strictEqual(Fmt.csvCell(-500), "-500");
assert.strictEqual(Fmt.csvCell(null), "");
assert.strictEqual(Fmt.csvCell("Hello, World"), '"Hello, World"');

console.log("All 6 tests passed!");