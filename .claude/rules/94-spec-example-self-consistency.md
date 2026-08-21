# Rule: Spec examples must satisfy their own stated condition (advisory — curated)
> Enforces: CONV-process-1. Advisory — surfaced by /review and /ship, not a commit gate.

- When writing or reviewing an acceptance criterion with a concrete example value, verify the
  value actually satisfies the boundary/tier/condition the AC claims it demonstrates — don't
  assume a value copied from a design handoff or prototype is correct as-is.
- Treat a self-contradictory AC example as a spec defect to fix before implementation starts,
  not something to route around in code.
