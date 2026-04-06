import { parse as parseYaml, stringify as stringifyYaml } from "./vendor/yaml/index.js";

const YAML_STRINGIFY_OPTIONS = {
  defaultKeyType: "PLAIN",
  indent: 2,
  keepUndefined: true,
  lineWidth: 0,
  nullStr: ""
};

function normalizeYamlSource(sourceText) {
  return String(sourceText ?? "").replace(/^\uFEFF/u, "");
}

export function parseYamlScalar(value) {
  const normalized = normalizeYamlSource(value).trim();

  if (!normalized) {
    return "";
  }

  return parseYaml(normalized, {
    prettyErrors: false
  });
}

export function parseSimpleYaml(sourceText) {
  const normalized = normalizeYamlSource(sourceText);

  if (!normalized.trim()) {
    return {};
  }

  const parsed = parseYaml(normalized, {
    prettyErrors: false
  });

  return parsed === null || parsed === undefined ? {} : parsed;
}

export function serializeSimpleYaml(source) {
  const serialized = stringifyYaml(source ?? {}, YAML_STRINGIFY_OPTIONS);

  if (!serialized) {
    return "\n";
  }

  return serialized.endsWith("\n") ? serialized : `${serialized}\n`;
}
