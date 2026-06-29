---
sidebar_position: 3
title: Local Event Archive
---

# Local Event Archive

Keep a permanent local copy of all events — separate from the queue. Archived events are **never removed after a flush**, ideal for offline-first apps and GDPR data export.

```ts
const client = await SunglassesCore.create({
  enableLocalArchive: true,
  ...
});

const data = await client.exportUserData();
console.log(data.archivedEvents.length);

// Prune old events from the archive
await client.clearLocalArchive({ maxAgeMs: 30 * 24 * 60 * 60 * 1000 });

// Clear the entire archive
await client.clearLocalArchive();
```

See [GDPR — data portability](/advanced/gdpr).
