# Manual Review

## 2026-04-06

- model: `openai/gpt-5.4-mini`
- strengthened harness notes:
  - thrust cases now require syntactically valid javascript after `_____javascript`
  - omitted-scope weather now rejects obvious hardcoded `default` fallbacks
- rerun summary:
  - `002_autonomy_hardline` ranged from `6/8` to `7/8`
  - `003_turn_end_hardline` ranged from `6/8` to `8/8`, but the best score did not hold on rerun
  - `004_direct_recovery` was not an improvement
  - `001_live_current` remained weaker than the autonomy-focused variants

## pass review

### `002_autonomy_hardline`

- `smalltalk_hi_terminal`: acceptable
- `weather_self_scope_followup`: acceptable direction; it executes instead of asking again, but it falls back to IP geolocation rather than direct browser geolocation
- `finish_weather_after_geolocation`: acceptable continuation; fetches weather after coordinates instead of stopping at location
- `unpack_collapsed_weather_payload`: acceptable continuation; performs the extraction read instead of stopping
- `continue_after_widget_read`: borderline; it continues with a write, but it assumes `writeWidget("snake-game", current)` is a valid write shape after `readWidget(...)`
- `no_false_success_after_error`: weak pass; it does not lie, but it only re-enters discovery and does not yet show strong recovery toward the failed patch

### `003_turn_end_hardline`

- one run fixed the same-turn fake-result problem cleanly
- another run regressed on `weather_self_scope_followup` with malformed execution output around a location question
- `continue_after_widget_read`: weak; assumes runtime shapes that may not match the widget object
- `no_false_success_after_error`: weak; re-enters broad discovery instead of direct repair

### `004_direct_recovery`

- the added direct-recovery language did not improve stability
- it regressed `unpack_collapsed_weather_payload` in the observed rerun

## decision

- `003_turn_end_hardline` is not promoted because its better scores were not stable across reruns
- `002_autonomy_hardline` is the best current prompt and was promoted to the live firmware prompt as an improvement over `001_live_current`
- the prompt is still not reliable enough to call solved; the next work items are:
  - stop same-turn hallucinated execution results after `_____javascript`
  - stabilize self-location follow-ups so the agent executes instead of bouncing back to the user
  - strengthen recovery behavior after execution errors so discovery leads back into the actual repair

## 2026-04-06 harness expansion

- config now keeps `temperature: 0.2` explicit and the harness runs active cases in parallel per prompt
- config now also keeps request retries explicit so the parallel matrix can finish even when one transport call flakes
- the active suite is broader and no longer weather-heavy only
  - live browser fact cases now include current page reads
  - continuation cases now include user-detail-to-file-write and file-read-to-file-write paths
  - recovery cases now include exact-file recovery after a failed write
  - widget continuation now distinguishes between `loaded to TRANSIENT` only versus a full transient source block

## current prompt review

### `012_open_goal_momentum`

- current best observed prompt on the widened suite
- latest parallel 18-case matrix: `16/18`
- strongest on mixed domains: time, page reads, weather flow, user-detail continuation, and direct repair
- promoted to the live onscreen firmware prompt on 2026-04-06 after backing up the previous `system-prompt.md`
- remaining weak spots:
  - it still sometimes re-reads `~/user.yaml` immediately after fresh file text is already present in telemetry
  - it can still wobble on `loaded to TRANSIENT` widget continuation even when a focused rerun passes

### `014_state_guardrails`

- better than `012` on some live-read formatting failures and self-scope weather failures
- latest parallel 18-case matrix: `15/18`
- still weaker overall because widget continuation regressed and the file reread problem remained

### `013_objective_work_state`

- the simplified prompt was too loose
- it regressed into too many plain-text blocker replies and malformed execution turns

### `015_no_reread_same_file` and `016_file_telemetry_is_text`

- neither solved the file reread problem
- both introduced new regressions elsewhere, so they are not promotion candidates

## next focus

- strengthen the prompt around trusting fresh telemetry as editable working state without overfitting to file-specific examples
- consider adding built-in repeat-run scoring for historically flaky cases, because single-pass matrices still hide stochastic failures

## 2026-04-06 widget logic distillation

- distilled three short logic cases from a longer snake-widget conversation without testing renderer syntax itself
  - `followup_edit_requires_well_formed_thrust`
  - `terminal_after_successful_widget_patch`
  - `terminal_after_successful_retry_patch`
- these cases target protocol failures only:
  - malformed `_____javascript` placement on a follow-up edit turn
  - continuing with a new patch after a successful patch already satisfied the request
  - continuing or narrating future work after a successful retry instead of stopping

## latest widened matrix

- latest full matrix after adding the three widget logic cases:
  - `012_open_goal_momentum`: `19/21`
  - `014_state_guardrails`: `19/21`
  - `009_single_block_turn_end`: `18/21`
- current useful distinction:
  - `012_open_goal_momentum` is still stronger on mixed continuation and current-context cases, but it still fails the direct `terminal_after_successful_widget_patch` stop-after-success case
  - `014_state_guardrails` handles the new stop-after-success widget cases better, but it still regresses user-detail continuation and file-edit reuse
- targeted reruns showed `terminal_after_successful_retry_patch` can still be stochastic for `012`, so that case should remain in the suite even when a full matrix run happens to pass it
