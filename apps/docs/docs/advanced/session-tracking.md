---
sidebar_position: 4
title: Session Tracking
---

# Session Tracking

Automatically group events into sessions. Session IDs are random UUIDs — no PII.

```ts
const client = await SunglassesCore.create({
  enableSessionTracking: true,
  sessionIdleTimeoutMs: 30 * 60 * 1000, // default: 30 minutes
  ...
});
```

When enabled:

- Every event gains `context.sessionId`
- A synthetic `$session_start` event is emitted at the beginning of each new session
- Sessions expire after the configured idle timeout
