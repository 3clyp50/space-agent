import assert from "node:assert/strict";
import test from "node:test";

import { getDefaultCodexModelId, normalizeCodexModelId } from "../app/L0/_all/mod/_core/openai_codex/models.js";

test("normalizeCodexModelId trims whitespace and returns empty for missing values", () => {
  assert.equal(normalizeCodexModelId(""), "");
  assert.equal(normalizeCodexModelId(null), "");
  assert.equal(normalizeCodexModelId(undefined), "");
  assert.equal(normalizeCodexModelId("   \n\t "), "");
  assert.equal(normalizeCodexModelId("  gpt-5.5 "), "gpt-5.5");
});

test("getDefaultCodexModelId returns the first valid id", () => {
  assert.equal(
    getDefaultCodexModelId([
      { id: "  gpt-5.5 ", description: "New model" },
      { id: "gpt-4o", description: "Legacy model" }
    ]),
    "gpt-5.5"
  );
});

test("getDefaultCodexModelId skips invalid entries", () => {
  assert.equal(
    getDefaultCodexModelId([
      { description: "No id" },
      { id: "", description: "Blank id" },
      { id: "\tgpt-5.5-mini\n" }
    ]),
    "gpt-5.5-mini"
  );
});

test("getDefaultCodexModelId returns empty string when no usable entries exist", () => {
  assert.equal(getDefaultCodexModelId(null), "");
  assert.equal(getDefaultCodexModelId([]), "");
  assert.equal(getDefaultCodexModelId([{ id: "", description: "blank" }]), "");
});
