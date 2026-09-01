import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolverForCode } from "./registry.js";

const CHECKS_DIR = join(dirname(fileURLToPath(import.meta.url)), "../integrity/checks");

/**
 * Finding codes emitted by integrity checks — parsed from check source files.
 * @returns {string[]}
 */
function enumerateIntegrityFindingCodes() {
  /** @type {Set<string>} */
  const codes = new Set();
  for (const file of readdirSync(CHECKS_DIR)) {
    if (!file.endsWith(".js")) continue;
    const content = readFileSync(join(CHECKS_DIR, file), "utf8");
    for (const match of content.matchAll(/code:\s*"([^"]+)"/g)) {
      codes.add(match[1]);
    }
  }
  return [...codes].sort();
}

/**
 * Codes intentionally without a resolver — must stay empty unless a new check is verify-only.
 * @type {Record<string, string>}
 */
const NO_RESOLVER = {};

describe("integrity finding resolver coverage", () => {
  it("every integrity finding code has a resolver or is on NO_RESOLVER", () => {
    const codes = enumerateIntegrityFindingCodes();
    assert.ok(codes.length >= 30, `expected many integrity codes, got ${codes.length}`);

    /** @type {string[]} */
    const uncovered = [];
    for (const code of codes) {
      if (NO_RESOLVER[code]) continue;
      if (!resolverForCode(code)) uncovered.push(code);
    }

    assert.deepEqual(
      uncovered,
      [],
      `integrity codes without resolvers: ${uncovered.join(", ") || "(none)"}`,
    );
  });

  it("NO_RESOLVER entries reference real integrity codes", () => {
    const codes = new Set(enumerateIntegrityFindingCodes());
    for (const code of Object.keys(NO_RESOLVER)) {
      assert.ok(codes.has(code), `${code} is on NO_RESOLVER but not emitted by integrity checks`);
    }
  });
});
