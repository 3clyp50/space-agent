export function normalizeCodexModelId(value) {
  return String(value || "").trim();
}

export function getDefaultCodexModelId(catalog) {
  if (!Array.isArray(catalog)) {
    return "";
  }

  for (const entry of catalog) {
    const id = typeof entry?.id === "string" ? entry.id.trim() : "";

    if (id) {
      return id;
    }
  }

  return "";
}
