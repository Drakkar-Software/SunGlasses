---
sidebar_position: 3
title: Frequency Counting
---

# Event Frequency Counting

Track how many times each event fires, bucketed by day, week, month, or all-time. Counts survive app restarts.

```ts
const client = await SunglassesCore.create({
  enableEventCounting: true,
  middleware: [
    new FrequencyMiddleware({
      counter: client.eventCounter!,
      periods: ['daily', 'monthly'],
    }),
  ],
  ...
});

// Check counts at any time
const todayClicks = await client.getEventCount('button_clicked', 'daily');
const thisMonthClicks = await client.getEventCount('button_clicked', 'monthly');
const totalClicks = await client.getEventCount('button_clicked', 'all-time');

// Reset a specific event's counts
await client.resetEventCount('button_clicked');
```

When `FrequencyMiddleware` is active, these properties are added to each event:

```json
{ "$count_daily": 3, "$count_monthly": 12 }
```

:::note
Counts only accumulate for `capture()` events — not `screen`, `identify`, or `alias`.
:::

Enable `enableEventCounting: true` in config or counts will always return 0.
