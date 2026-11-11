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

// Test 7: Formula beginning with @
assert.strictEqual(
    Fmt.csvCell("@SUM(A1:A5)"),
    "'@SUM(A1:A5)"
);

// Test 8: Formula with leading whitespace
assert.strictEqual(
    Fmt.csvCell("  =1+1"),
    "'  =1+1"
);

// Test 9: Negative number stored as a string
assert.strictEqual(
    Fmt.csvCell("-500"),
    "'-500"
);

// Test 10: Undefined values
assert.strictEqual(
    Fmt.csvCell(undefined),
    ""
);

// Test 11: Double quotation marks
assert.strictEqual(
    Fmt.csvCell('Hello "World"'),
    '"Hello ""World"""'
);

// Test 12: Newline handling
assert.strictEqual(
    Fmt.csvCell("Hello\nWorld"),
    '"Hello\nWorld"'
);

console.log("All 12 VOLTIX CSV tests passed!");