# Rule: Give every numeric formatter an explicit precision floor (advisory — curated)
> Enforces: CONV-api-2. Advisory — surfaced by /review and /ship, not a commit gate.

- A fixed-decimal tier turns anything below its resolution into a **false zero** (`$0.0000`,
  `0 ₿`) that reads as a real quantity. Nothing throws, so only a human looking at the rendered
  output notices. Decide the smallest representable value and render below it as an explicit
  bounded placeholder (`< $0.00000001`), never as zero.
- When a formatting tier was specified against a curated sample, re-check it against the widest
  input set the feature can actually reach (here: "All" scope's ~640 Coinbase symbols, not the
  curated 15) before shipping.
- Prefer significant-digit formatting over fixed decimals for values spanning many orders of
  magnitude, and cap the decimals so rendered width stays bounded for the column that holds it.
