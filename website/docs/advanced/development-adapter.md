---
sidebar_position: 7
title: Development Adapter
---

# Development Adapter

For quick local testing, wire an inline adapter that logs batches to the console. No extra package needed.

```ts
const devAdapter = {
  async send(batch) { console.log('[sunglasses]', batch); },
};

SunglassesCore.create({
  adapters: [devAdapter],
  defaultOptIn: true, // opt in for local dev
  debug: true,
  ...
});
```

Replace with `HttpStorageAdapter` or `StarfishAnalyticsAdapter` for production.

:::tip
Never ship a console-logging adapter to production — it may leak event properties in device logs.
:::
