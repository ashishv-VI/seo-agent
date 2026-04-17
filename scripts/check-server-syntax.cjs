/**
 * Syntax-check all server JS files, skipping node_modules.
 * Run: node scripts/check-server-syntax.cjs
 */
const { execSync } = require("child_process");
const { readdirSync, statSync } = require("fs");
const path = require("path");

function collectJs(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) { collectJs(full, out); continue; }
    if (entry.endsWith(".js")) out.push(full);
  }
  return out;
}

const files = collectJs(path.join(__dirname, "..", "server"));
let failed = 0;
for (const f of files) {
  try {
    execSync(`node --check "${f}"`, { stdio: "pipe" });
  } catch (e) {
    console.error(`FAIL: ${f}\n${e.stderr?.toString().trim()}`);
    failed++;
  }
}
if (failed === 0) {
  console.log(`OK: ${files.length} server files passed syntax check`);
  process.exit(0);
} else {
  console.error(`\n${failed} file(s) failed syntax check`);
  process.exit(1);
}
