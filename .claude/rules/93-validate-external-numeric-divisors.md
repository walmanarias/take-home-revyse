# Rule: Validate external API numeric fields before using them as a divisor (advisory — curated)
> Enforces: CONV-api-1. Advisory — surfaced by /review and /ship, not a commit gate.

- Any numeric field sourced from a third-party API response that is used as a divisor must be
  checked (`Number.isFinite(x) && x > 0`, or the domain-appropriate equivalent) before dividing.
- On an invalid divisor, produce an explicit "invalid" value (e.g. `NaN`) that downstream
  formatting already renders as a placeholder (`—`) — don't let `Infinity`, `NaN`, or a
  sign-flipped result silently reach the UI.
- Flag any new divide-by-external-field expression in review if it lacks a guard.
