# Rule: A stated rate limit must match what the mechanism enforces (advisory — curated)
> Enforces: CONV-api-3, CONV-process-4. Advisory — surfaced by /review and /ship, not a commit gate.

- A leaky/token bucket (capacity `C`, continuous refill of `C` per window) caps the **long-run
  average**, not the count inside a sliding window: from a full bucket you get `C` immediately
  plus another `C` refill-paced, i.e. up to **~2C per window**. `budget.ts` (cap 10, +1 per
  6,000ms) was measured at 16 requests in one 60s window against a stated "10 per minute".
- If the cap is hard, use a fixed window or a sliding-window log. If burst-tolerant average is
  what you mean, say *that* — in the FR/NFR, the README trade-off, and the user-facing copy, in
  the same words. `n/10 left this minute` / `aria-label="Requests left this minute"` promises a
  fixed window; don't render it over a bucket.
- For any quantified NFR, name the one test that fails when the bound is violated. Token
  accounting tests (spend, refill timing, overdraw race) do **not** verify a window bound — they
  all stay green through the overshoot. Drive the adversarial path: burst from an idle/full
  state, a second actor, manual refresh racing the auto-poll.
- Probe the headline claim — whatever the README calls the product's core promise — before
  shipping. It is the first thing an outside reviewer attacks, and the happy path never shows it.
