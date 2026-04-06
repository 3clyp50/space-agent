# AGENTS

## Purpose

`tests/` owns repo-level verification harnesses and evaluation fixtures

Keep test workflows explicit scriptable and isolated from app runtime behavior unless a test explicitly targets that runtime

## Documentation Hierarchy

`tests/AGENTS.md` owns the top-level test tree and the contract for deeper test harness docs

Current deeper docs:

- `tests/agent_llm_performance/AGENTS.md`
- `tests/agent_llm_turn_flags/AGENTS.md`

Parent vs child split:

- this file owns the top-level test layout and shared test-workflow boundaries
- `agent_llm_performance/AGENTS.md` owns the LLM prompt-performance harness, its config, cases, prompts, and scoring rules
- `agent_llm_turn_flags/AGENTS.md` owns the flagged-turn LLM prompt-performance harness, its config, cases, prompts, and scoring rules

Child doc section pattern:

- `Purpose`
- `Ownership`
- `Local Contracts`
- `Development Guidance`

## Ownership

This scope owns:

- repo-level test harnesses under `tests/`
- shared expectations for test config, fixtures, scripted execution, and saved evaluation results

## Local Contracts

- keep harnesses runnable from the CLI with explicit file paths or config-driven defaults
- keep provider config local to each harness and load secrets from environment or repo `.env`, never hardcode them
- keep prompts, histories, cases, and results as separate files so evaluation remains reusable
- prefer deterministic scoring rules first; if an LLM judge is added later, keep it secondary and clearly separated
- treat automated passes as provisional when behavioral quality still needs human judgment; a winning prompt or harness change should be manually reviewed before it is treated as validated
- do not mutate app or server runtime state from prompt-evaluation harnesses unless the harness explicitly exists to test those mutations
- when a new long-lived harness lands under `tests/`, add a child `AGENTS.md` before the harness grows

## Development Guidance

- keep fixtures hand-authored and readable
- keep fixtures independent and side-effect-free so harnesses can parallelize them safely
- keep harness outputs easy to diff and resume next session
- update the root `AGENTS.md` when the top-level test workflow or ownership map changes
