#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  parseSimpleYaml,
  serializeSimpleYaml
} from "../../app/L0/_all/mod/_core/framework/js/yaml-lite.js";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, "../..");
const DEFAULT_CONFIG_PATH = path.join(SCRIPT_DIR, "config.yaml");
const EXECUTION_SEPARATOR = "_____javascript";
const TERMINATION_SEPARATOR = "_____terminate";
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const configPath = args.config ? resolveFromCwd(args.config) : DEFAULT_CONFIG_PATH;
  const config = await loadConfig(configPath);

  await loadDotEnv(path.join(ROOT_DIR, ".env"));

  if (args.system && args.history) {
    const systemPath = resolveFromCwd(args.system);
    const historyPath = resolveFromCwd(args.history);
    const casePath = args.case ? resolveFromCwd(args.case) : null;
    const caseDef = casePath ? await loadJson(casePath) : null;
    const systemPrompt = await fs.readFile(systemPath, "utf8");
    const history = await loadJson(historyPath);
    const response = await requestCompletion(config, systemPrompt, history);
    const evaluation = caseDef ? evaluateResponse(response.content, caseDef.expect) : null;
    printSingleResult(systemPath, historyPath, response, evaluation);
    return;
  }

  const activePrompts = normalizeList(config.run?.active_prompts);
  const activeCases = normalizeList(config.run?.active_cases);
  const promptIds = args.prompt_id ? [String(args.prompt_id)] : activePrompts;
  const caseIds = args.case_id ? [String(args.case_id)] : activeCases;
  const promptPaths = promptIds.map((promptId) => resolvePromptPath(config, promptId));
  const casePaths = caseIds.map((caseId) => resolveCasePath(config, caseId));
  const promptSummaries = [];
  const caseConcurrency = resolveCaseConcurrency(args.case_concurrency, config.run?.case_concurrency);

  for (const promptPath of promptPaths) {
    const caseResults = await runPromptCases(config, promptPath, casePaths, caseConcurrency);

    promptSummaries.push(buildPromptSummary(path.basename(promptPath, ".md"), caseResults));
  }

  promptSummaries.sort(comparePromptSummaries);

  if (!args.prompt_id && !args.case_id) {
    await saveResults(config, promptSummaries);
  }

  printMatrixSummary(promptSummaries, config.provider.model);
}

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const entry = argv[index];

    if (!entry.startsWith("--")) {
      continue;
    }

    const key = entry.slice(2).replace(/-/g, "_");
    const next = argv[index + 1];

    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    index += 1;
  }

  return args;
}

function resolveFromCwd(targetPath) {
  return path.resolve(process.cwd(), targetPath);
}

function resolveRelative(baseDir, targetPath) {
  return path.resolve(baseDir, String(targetPath || ""));
}

async function loadConfig(configPath) {
  const configText = await fs.readFile(configPath, "utf8");
  const parsed = parseSimpleYaml(configText);
  const configDir = path.dirname(configPath);

  return {
    _configPath: configPath,
    _configDir: configDir,
    provider: {
      api_base: parsed.provider?.api_base || "https://openrouter.ai/api/v1/chat/completions",
      model: parsed.provider?.model || "openai/gpt-5.4-mini",
      api_key_env: parsed.provider?.api_key_env || "OPENROUTER_API_KEY",
      temperature: toNumber(parsed.provider?.temperature, 0.2),
      max_tokens: toInteger(parsed.provider?.max_tokens, 4000),
      timeout_ms: toInteger(parsed.provider?.timeout_ms, 90000),
      retry_count: toInteger(parsed.provider?.retry_count, 2),
      retry_backoff_ms: toInteger(parsed.provider?.retry_backoff_ms, 1500),
      referer: parsed.provider?.referer || "https://space-agent.local/tests/agent_llm_performance",
      title: parsed.provider?.title || "Space Agent Prompt Performance Tests"
    },
    paths: {
      prompts_dir: resolveRelative(configDir, parsed.paths?.prompts_dir || "./prompts"),
      cases_dir: resolveRelative(configDir, parsed.paths?.cases_dir || "./cases"),
      histories_dir: resolveRelative(configDir, parsed.paths?.histories_dir || "./histories"),
      results_dir: resolveRelative(configDir, parsed.paths?.results_dir || "./results"),
      leaderboard_file: resolveRelative(configDir, parsed.paths?.leaderboard_file || "./results/leaderboard.yaml"),
      latest_run_file: resolveRelative(configDir, parsed.paths?.latest_run_file || "./results/latest-run.json")
    },
    run: {
      active_prompts: normalizeList(parsed.run?.active_prompts),
      active_cases: normalizeList(parsed.run?.active_cases),
      case_concurrency: resolveCaseConcurrency(null, parsed.run?.case_concurrency)
    }
  };
}

function toNumber(value, fallback) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : fallback;
}

function toInteger(value, fallback) {
  const normalized = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(normalized) ? normalized : fallback;
}

function normalizeList(value) {
  return Array.isArray(value) ? value.map((entry) => String(entry)) : [];
}

function resolveCaseConcurrency(cliValue, configValue) {
  const rawValue = cliValue ?? configValue;

  if (rawValue == null || rawValue === "") {
    return Infinity;
  }

  if (rawValue === true) {
    return Infinity;
  }

  const normalized = String(rawValue).trim().toLowerCase();

  if (!normalized || normalized === "all" || normalized === "max" || normalized === "parallel") {
    return Infinity;
  }

  const parsed = Number.parseInt(normalized, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return Infinity;
  }

  return parsed;
}

async function loadDotEnv(envPath) {
  if (process.env.OPENROUTER_API_KEY) {
    return;
  }

  let envText = "";

  try {
    envText = await fs.readFile(envPath, "utf8");
  } catch {
    return;
  }

  envText.split(/\r?\n/u).forEach((line) => {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex <= 0) {
      return;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  });
}

function resolvePromptPath(config, promptId) {
  return path.join(config.paths.prompts_dir, `${promptId}.md`);
}

function resolveCasePath(config, caseId) {
  return path.join(config.paths.cases_dir, `${caseId}.json`);
}

async function loadJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function requestCompletion(config, systemPrompt, history) {
  const apiKey = process.env[config.provider.api_key_env];

  if (!apiKey) {
    throw new Error(`Missing ${config.provider.api_key_env} in environment or repo .env`);
  }

  const attempts = Math.max(1, config.provider.retry_count + 1);
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(config.provider.api_base, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": config.provider.referer,
          "X-Title": config.provider.title
        },
        body: JSON.stringify({
          model: config.provider.model,
          temperature: config.provider.temperature,
          max_tokens: config.provider.max_tokens,
          messages: [
            {
              role: "system",
              content: systemPrompt
            },
            ...history
          ]
        }),
        signal: AbortSignal.timeout(config.provider.timeout_ms)
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        const error = new Error(payload.error?.message || payload.error || JSON.stringify(payload));
        error.status = response.status;

        if (attempt < attempts && shouldRetryRequestError(error)) {
          await delay(config.provider.retry_backoff_ms * attempt);
          continue;
        }

        throw error;
      }

      const message = payload.choices?.[0]?.message || {};
      return {
        content: extractMessageContent(message.content),
        usage: payload.usage || {}
      };
    } catch (error) {
      lastError = error;

      if (attempt < attempts && shouldRetryRequestError(error)) {
        await delay(config.provider.retry_backoff_ms * attempt);
        continue;
      }

      throw error;
    }
  }

  throw lastError || new Error("request failed");
}

function extractMessageContent(content) {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((part) => {
      if (typeof part === "string") {
        return part;
      }

      if (typeof part?.text === "string") {
        return part.text;
      }

      return "";
    })
    .join("");
}

async function runCase(config, promptPath, casePath) {
  const systemPrompt = await fs.readFile(promptPath, "utf8");
  return runPreparedCase(config, promptPath, casePath, systemPrompt);
}

async function runPreparedCase(config, promptPath, casePath, systemPrompt) {
  const caseDef = await loadJson(casePath);
  const historyPath = resolveRelative(path.dirname(casePath), caseDef.history);
  const history = await loadJson(historyPath);

  try {
    const response = await requestCompletion(config, systemPrompt, history);
    const evaluation = evaluateResponse(response.content, caseDef.expect);

    return {
      case_id: caseDef.id,
      description: caseDef.description,
      prompt_id: path.basename(promptPath, ".md"),
      prompt_path: path.relative(ROOT_DIR, promptPath),
      case_path: path.relative(ROOT_DIR, casePath),
      history_path: path.relative(ROOT_DIR, historyPath),
      passed: evaluation.passed,
      failures: evaluation.failures,
      response_type: evaluation.response_type,
      response: response.content,
      usage: response.usage
    };
  } catch (error) {
    return buildCaseErrorResult(promptPath, casePath, historyPath, caseDef, error);
  }
}

async function runPromptCases(config, promptPath, casePaths, caseConcurrency) {
  const systemPrompt = await fs.readFile(promptPath, "utf8");
  return mapLimit(casePaths, caseConcurrency, (casePath) =>
    runPreparedCase(config, promptPath, casePath, systemPrompt)
  );
}

async function mapLimit(items, limit, worker) {
  const maxConcurrency = normalizeConcurrencyLimit(limit, items.length);
  const results = new Array(items.length);
  let nextIndex = 0;

  const runners = Array.from({ length: maxConcurrency }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  });

  await Promise.all(runners);
  return results;
}

function normalizeConcurrencyLimit(limit, itemCount) {
  if (!itemCount) {
    return 0;
  }

  if (!Number.isFinite(limit)) {
    return itemCount;
  }

  return Math.max(1, Math.min(itemCount, Math.trunc(limit)));
}

function evaluateResponse(content, expect = {}) {
  const normalized = String(content || "");
  const separatorMatches = normalized.match(new RegExp(EXECUTION_SEPARATOR, "gu")) || [];
  const terminationMatches = normalized.match(new RegExp(TERMINATION_SEPARATOR, "gu")) || [];
  const separatorLineMatches = normalized.match(/^_____javascript$/gmu) || [];
  const hasExecutionMarker = separatorMatches.length > 0;
  const hasTerminationMarker = terminationMatches.length > 0;
  const trimmedEnd = normalized.trimEnd();
  const responseType =
    hasExecutionMarker && hasTerminationMarker
      ? "mixed"
      : hasExecutionMarker
        ? "thrust"
        : hasTerminationMarker
          ? "terminal"
          : "unmarked";
  const separatorIndex = normalized.indexOf(EXECUTION_SEPARATOR);
  const terminationIndex = normalized.indexOf(TERMINATION_SEPARATOR);
  const beforeSeparator = separatorIndex === -1 ? "" : normalized.slice(0, separatorIndex).trim();
  const codeAfterSeparator =
    separatorIndex === -1
      ? ""
      : normalized
          .slice(separatorIndex)
          .split(/\r?\n/u)
          .slice(1)
          .join("\n")
          .trim();
  const beforeTermination =
    terminationIndex === -1 ? "" : normalized.slice(0, terminationIndex).trim();
  const failures = [];

  if (!hasExecutionMarker && !hasTerminationMarker) {
    failures.push("response must include exactly one output marker");
  }

  if (hasExecutionMarker && hasTerminationMarker) {
    failures.push("response must not mix execution and termination markers");
  }

  if (expect.response_type && responseType !== expect.response_type) {
    failures.push(`expected ${expect.response_type} but got ${responseType}`);
  }

  if (responseType === "thrust" && separatorLineMatches.length !== 1) {
    failures.push("execution separator must appear exactly once on its own line");
  }

  if (responseType === "thrust" && !codeAfterSeparator) {
    failures.push("missing code after execution separator");
  }

  if (responseType === "terminal" && terminationMatches.length !== 1) {
    failures.push("termination marker must appear exactly once");
  }

  if (responseType === "terminal" && !trimmedEnd.endsWith(TERMINATION_SEPARATOR)) {
    failures.push("termination marker must be the final suffix");
  }

  if (expect.require_staging_line && responseType === "thrust" && !beforeSeparator) {
    failures.push("missing staging line before execution separator");
  }

  if (expect.require_separator_line && separatorLineMatches.length !== 1) {
    failures.push("execution separator must appear exactly once on its own line");
  }

  if (expect.require_single_separator && separatorMatches.length !== 1) {
    failures.push("execution separator must appear exactly once");
  }

  if (expect.require_code_after_separator && !codeAfterSeparator) {
    failures.push("missing code after execution separator");
  }

  if (expect.require_terminal_text && responseType === "terminal" && !beforeTermination) {
    failures.push("missing visible text before termination marker");
  }

  if (expect.require_valid_javascript) {
    const validationError = validateJavascriptBody(codeAfterSeparator);

    if (validationError) {
      failures.push(`invalid javascript after execution separator: ${validationError}`);
    }
  }

  for (const requiredText of expect.must_contain || []) {
    if (!normalized.includes(requiredText)) {
      failures.push(`missing required text: ${requiredText}`);
    }
  }

  for (const forbiddenText of expect.must_not_contain || []) {
    if (normalized.includes(forbiddenText)) {
      failures.push(`contains forbidden text: ${forbiddenText}`);
    }
  }

  for (const patternDef of expect.must_match || []) {
    const pattern = toRegExp(patternDef);

    if (!pattern.test(normalized)) {
      failures.push(`missing required pattern: ${pattern}`);
    }
  }

  for (const patternDef of expect.must_not_match || []) {
    const pattern = toRegExp(patternDef);

    if (pattern.test(normalized)) {
      failures.push(`matched forbidden pattern: ${pattern}`);
    }
  }

  return {
    passed: failures.length === 0,
    failures,
    response_type: responseType
  };
}

function validateJavascriptBody(sourceText) {
  const normalized = String(sourceText || "").trim();

  if (!normalized) {
    return "missing code";
  }

  try {
    new AsyncFunction(normalized);
    return "";
  } catch (error) {
    return error?.message || String(error);
  }
}

function toRegExp(patternDef) {
  if (patternDef && typeof patternDef === "object") {
    return new RegExp(patternDef.pattern || "", patternDef.flags || "u");
  }

  return new RegExp(String(patternDef || ""), "u");
}

function buildPromptSummary(promptId, caseResults) {
  const passedCases = caseResults.filter((result) => result.passed).length;
  const totalCases = caseResults.length;

  return {
    prompt_id: promptId,
    passed_cases: passedCases,
    total_cases: totalCases,
    pass_rate: totalCases ? Number((passedCases / totalCases).toFixed(4)) : 0,
    failed_cases: caseResults.filter((result) => !result.passed).map((result) => result.case_id),
    cases: caseResults
  };
}

function buildCaseErrorResult(promptPath, casePath, historyPath, caseDef, error) {
  return {
    case_id: caseDef.id,
    description: caseDef.description,
    prompt_id: path.basename(promptPath, ".md"),
    prompt_path: path.relative(ROOT_DIR, promptPath),
    case_path: path.relative(ROOT_DIR, casePath),
    history_path: path.relative(ROOT_DIR, historyPath),
    passed: false,
    failures: [`request error: ${error?.message || String(error)}`],
    response_type: "error",
    response: "",
    usage: {},
    harness_error: true
  };
}

function shouldRetryRequestError(error) {
  const status = Number(error?.status);

  if (Number.isFinite(status)) {
    return status === 408 || status === 409 || status === 429 || status >= 500;
  }

  const message = String(error?.message || error || "").toLowerCase();
  return message.includes("fetch failed") || message.includes("timeout") || message.includes("econnreset");
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, ms || 0));
  });
}

function comparePromptSummaries(a, b) {
  if (b.passed_cases !== a.passed_cases) {
    return b.passed_cases - a.passed_cases;
  }

  if (b.pass_rate !== a.pass_rate) {
    return b.pass_rate - a.pass_rate;
  }

  return a.prompt_id.localeCompare(b.prompt_id);
}

async function saveResults(config, promptSummaries) {
  const generatedAt = new Date().toISOString();

  await fs.mkdir(config.paths.results_dir, {
    recursive: true
  });

  const latestRun = {
    generated_at: generatedAt,
    model: config.provider.model,
    results: promptSummaries
  };

  await fs.writeFile(config.paths.latest_run_file, `${JSON.stringify(latestRun, null, 2)}\n`, "utf8");

  const leaderboard = {
    generated_at: generatedAt,
    model: config.provider.model,
    prompts: promptSummaries.map((summary, index) => ({
      rank: index + 1,
      id: summary.prompt_id,
      passed_cases: summary.passed_cases,
      total_cases: summary.total_cases,
      pass_rate: summary.pass_rate,
      failed_cases: summary.failed_cases
    }))
  };

  await fs.writeFile(config.paths.leaderboard_file, serializeSimpleYaml(leaderboard), "utf8");
}

function printSingleResult(systemPath, historyPath, response, evaluation) {
  console.log(`system: ${path.relative(ROOT_DIR, systemPath)}`);
  console.log(`history: ${path.relative(ROOT_DIR, historyPath)}`);
  console.log("");
  console.log("assistant↓");
  console.log(response.content || "(empty)");

  if (!evaluation) {
    return;
  }

  console.log("");
  console.log(`result: ${evaluation.passed ? "PASS" : "FAIL"}`);

  evaluation.failures.forEach((failure) => {
    console.log(`- ${failure}`);
  });
}

function printMatrixSummary(promptSummaries, model) {
  console.log(`model: ${model}`);
  console.log("");

  promptSummaries.forEach((summary) => {
    console.log(
      `${summary.prompt_id}: ${summary.passed_cases}/${summary.total_cases} passed (${Math.round(
        summary.pass_rate * 100
      )}%)`
    );

    summary.cases.forEach((caseResult) => {
      const status = caseResult.passed ? "PASS" : "FAIL";
      console.log(`  ${status} ${caseResult.case_id}`);

      if (!caseResult.passed) {
        caseResult.failures.forEach((failure) => {
          console.log(`    - ${failure}`);
        });
      }
    });

    console.log("");
  });
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
