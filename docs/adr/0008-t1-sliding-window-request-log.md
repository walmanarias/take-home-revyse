# ADR 0008: T1's shared budget is a sliding-window request log, not a leaky bucket

- Date: 2026-08-24
- Status: accepted (supersedes the T1 mechanism chosen in `docs/design/crypto-dashboard.md`)
- Decided by: the repo owner, in response to the 2026-08-24 external review
  (`docs/curation/2026-08-24-external-review.md`)

## Context

FR-9 shipped as a leaky bucket in `localStorage`: capacity 10, `tokens += (elapsed / 60_000) * 10`
on every read. A leaky bucket bounds the **long-run average** at 10/min. It does not bound the
count inside a sliding 60-second window: from a full bucket a client spends 10 immediately and one
more every 6s as the bucket refills — up to ~20 inside a moving minute.

An external reviewer measured 16 Coinbase requests in one 60s window by spamming manual refresh in
a second tab while the leader polled. Every budget AC (AC-5, AC-6, AC-7) passed throughout, because
they verify token accounting rather than the bound the NFR claimed. The UI compounded it: the strip
read `n/10 left this minute` and carried `aria-label="Requests left this minute"`, and the footnote
described a "10-requests-per-minute bucket" — all fixed-window language over a mechanism that never
enforced a fixed window.

Two options were on the table: restate the guarantee as a burst-tolerant average everywhere
(free, but concedes the headline number the README calls the product's core promise), or make the
promise literally true. The second was chosen — the cap is the feature.

## Decision

Replace the bucket with a **sliding-window request log**. The persisted record becomes
`{ stamps: number[] }` — the timestamps of granted requests — under a new versioned key
`nocturne.rates.budget.v2`. A grant is refused whenever 10 stamps already fall inside the trailing
60,000ms; a granted stamp is appended and the record is rewritten pruned to the window, so it stays
bounded at ≤10 entries. `read(now)` reports `{ remaining, nextTokenInMs }`, where `nextTokenInMs`
is the oldest in-window stamp's exit — the true wait, which the Refresh button now renders as
`Wait 59s` rather than a 6s refill tick.

Two deliberate details:

- **No migration from v1.** A budget is at most 60 seconds of state. A client that reloads across
  the deploy simply starts one fresh window; the v1 record is left in place, unread, for rollback
  safety — the same policy as `nocturne.rates.order.v1` (ADR 0007).
- **Stamps dated after `now` are discarded** (AC-112). A device clock that moves backwards would
  otherwise lock the budget out for as long as the skew, which is a far worse failure than the one
  extra request that discarding costs.

## Consequences

- The NFR is now literally true and, per CONV-process-4, names the AC that fails if it is violated:
  **AC-108** replays the reviewer's exact probe (10 grants in 5.6s, then every attempt refused
  until the first grant leaves the window) and asserts no trailing 60s window ever holds more
  than 10 grants.
- **The cross-tab overdraw race is unchanged** (AC-116). `localStorage` writes are not atomic, so
  two tabs reading the same snapshot can both append and one write clobbers the other, losing a
  stamp. That stays bounded at ~1 request per racing pair and still has no client-side fix; the
  real fix for both defects is a server-side proxy that owns the key and the quota.
- **The UI is now honest but stricter-looking.** At the instant of the 10th grant the window is
  genuinely full, so Refresh disables and the strip reads `0/10 left this minute · +1 in 59s`. The
  1s `tick()` re-render walks the countdown down and re-enables the button when a slot frees. A
  test driving refreshes faster than one per 6.67s will see the button disabled between cycles —
  that is the mechanism working, not a defect (see AC-65's pacing comment).
- Every statement of the cap — FR-9, the NFR, README T1, the budget strip, the footnote — now uses
  the same rolling-window language, pinned by AC-117.
