# @drakkar.software/sunglasses-adapter-starfish

## 0.9.2

### Patch Changes

- Documented that Starfish's `starfish-events` server plugin (v3.0.0-alpha.62+) assigns the authoritative Parquet batch id server-side and ignores the client-generated `{batchId}` placeholder in the push URL. No adapter behavior changes — `send()` is unaffected.
