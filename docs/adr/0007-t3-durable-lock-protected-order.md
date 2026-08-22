# ADR 0007: T3 implemented — versioned, lock-protected order record

## Context

`designs/README.md`'s T3 ("Instant feel vs. durable order") was previously decided-but-not-built
beyond the optimistic in-memory update plus a synchronous, unlocked `writeJSON` to
`nocturne.rates.order.v1` (a bare `string[]`). Two tabs reordering at the same instant settle on
whichever wrote last, with no version field and no lock. New scope requires the documented
upgrade: a versioned record written under `navigator.locks.request()`, adopted cross-tab via the
existing `storage` event, with validation on read unchanged (CONV-persistence-1). No new
dependency: the Web Locks API is a browser built-in, not a package.

Ground truth: `order.ts`'s `reorder()` (pure array splice, unit-tested) does not change.
`persisted.ts`'s `readOrder()` (validates against a symbol universe, drops unknown, appends
missing) is reused, not replaced. Per ADR 0006, the reorderable universe stays bounded to the
curated 15 plus current pins, so the durable record stays small regardless of "All" scope.

## Decision

**New key, versioned record.** `nocturne.rates.order.v2` holds:

```
export interface OrderRecord {
  schemaVersion: number
  updatedAt: number
  order: string[]
}
```

**Migration, one-way, non-destructive.** A new module, `order-record.ts`:

```
export function readOrderRecord(
  kv: KVStore, validSymbols: readonly string[], clock: () => number,
): OrderRecord
export async function writeOrderRecord(
  kv: KVStore, locks: LocksPort, record: OrderRecord,
): Promise<void>
```

`readOrderRecord` tries `order.v2` first (validated: `schemaVersion` is a known number,
`updatedAt` is a number, `order` passes the existing `isStringArray`/symbol-filtering rules). If
absent or invalid, it falls back to reading `order.v1` via the existing `readOrder()`, wraps the
result as `{ schemaVersion: 2, updatedAt: clock(), order: <validated v1 array> }`, and writes it
once to `.v2` so every subsequent read is a `.v2` read. **`order.v1` is left in place, untouched
— it is not deleted.** Removing it would be irreversible if a rollback to a version that only
reads `.v1` ever happened; leaving stale, unread data in `localStorage` is a mild, accepted cost
against that safety margin.

**Lock-protected write, injectable.**

```
export interface LocksPort {
  request<T>(name: string, fn: () => Promise<T> | T): Promise<T>
}
```

Production wraps `navigator.locks.request(name, () => fn())`, guarded by
`typeof navigator !== 'undefined' && 'locks' in navigator` (true during SSR, and on any browser
without the Web Locks API) — when the guard fails, `writeOrderRecord` calls `fn()` directly,
unguarded, which is exactly today's shipped behavior (no regression, just no lock protection).
Inside the lock, the write reads the currently-stored record, compares `updatedAt`, and only
persists the new record if its `updatedAt` is **strictly greater** than the stored one — this is
the last-write-wins rule, made atomic against interleaving by the lock's critical section rather
than by two independent, unordered `getItem`/`setItem` calls.

Tests inject a fake `LocksPort` — a no-op passthrough for the sequential case, and a
contention-simulating fake (queues two `request()` calls, resolves them out of submission order,
or holds the first open while the second is attempted) to prove the strictly-greater-`updatedAt`
rule produces a deterministic, non-corrupted result without ever touching a real
`navigator.locks`.

**Tie-break on equal `updatedAt`.** Prefer the record already in storage — a new write only
overwrites when strictly newer, never on a tie. This favors stability over churn on the rare
same-millisecond collision (the same class of rare race T1 already accepts as acceptable,
per ADR/README T1) rather than an arbitrary coin-flip.

**Cross-tab adoption.** The existing `storage`-event listener (`addEventListeners(window,
handle.signal, { storage: onStorage })`) gains a case for `order.v2`: on change, read the new
stored record and adopt it into in-memory `order` **only if its `updatedAt` is newer** than what
this tab currently holds — the same one-directional, newer-wins rule the write path enforces,
applied on the read/adopt side too.

**`favs` stays on the existing, unlocked `.v1` scheme — deliberately, not by oversight.**
Pin/unpin is a single click, trivially and immediately re-doable, and a lost race is visually
obvious the instant it happens (the star doesn't change). A lost *order* race can silently
discard several deliberate drag/keyboard repositioning actions the user has no easy way to
notice went missing. The lock-and-version investment is targeted where losing a race is
expensive to the user, not applied uniformly for its own sake.

## Consequences

- Two tabs reordering at the genuinely same instant no longer silently corrupt each other's
  write via an unordered read-modify-write — the lock serializes entry, and the
  strictly-greater-`updatedAt` rule makes the outcome deterministic (last valid writer wins,
  ties favor the existing value) rather than racy.
- **Not solved:** true convergence (a CRDT-style merge of both tabs' intended positions). A
  same-millisecond collision still picks one tab's order and discards the other's, exactly as
  the original T3 text already accepted ("both are the wrong weight for a client-only
  dashboard"); this ADR makes the *chosen* winner deterministic, it does not merge intents.
- Durability is now genuinely asynchronous (`navigator.locks.request` returns a `Promise`),
  whereas the original synchronous `writeJSON` guaranteed a write completed before the handler
  returned. The optimistic in-memory update (`order` + `handle.update()`) still happens
  synchronously in the same handler, so the *visible* reorder is still instant; but the durable
  write now has a small window (typically a microtask or two, longer only under real lock
  contention) where a reload could in principle race ahead of it — a slightly weaker guarantee
  than v1's fully-synchronous write, accepted as the necessary cost of real cross-tab lock
  protection.
- On a browser without the Web Locks API (or during SSR), the write silently degrades to
  today's unlocked behavior — no crash, no feature loss beyond losing the lock's collision
  protection, consistent with "no error page, ever."
- `order.v1` remains forever as inert, unread-after-migration data; a future cleanup could prune
  it, but that is out of scope here (removing persisted data is a one-way door, not undone by
  this ADR).

## Repo `README.md` "Tension Decisions" update (content to apply during implementation)

Both T2 and T3 flip from "decided, not implemented" to **IMPLEMENTED**, with their "Given up"
text replaced (this design pass does not edit `README.md` itself — see the design brief's
migration note):

- **T2 — given up (updated):** dragging is still only offered for the curated 15 plus pinned
  symbols, not the full "All" universe — a "move to top" affordance for the rest remains
  unbuilt. Uncurated symbols show their own code as their name (no names endpoint reachable
  without spending a budget token) and carry no session Δ/trend (flat sparkline, `—`) unless
  pinned. Fiat currencies are included, not filtered — the endpoint carries no type metadata to
  filter by. Cards/grid view is not virtualized; "All" scope is table-view only.
- **T3 — given up (updated):** the lock makes the last-write-wins outcome deterministic, not a
  merge — a genuine same-instant collision across two tabs still discards one tab's intended
  order rather than combining both. `favs` deliberately keeps the simpler, unlocked scheme;
  losing a pin race is cheap to notice and redo, unlike losing a multi-step reorder.
