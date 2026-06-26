---
sidebar_position: 2
title: Sampling
---

# Sampling (Volume Reduction)

`SamplingMiddleware` randomly drops a fraction of `capture` events to reduce analytics costs.

```ts
import { SamplingMiddleware } from '@drakkar.software/sunglasses-core';

// Keep only 10% of events (drop 90%)
const sampling = new SamplingMiddleware({ sampleRate: 0.1 });

// Consistent sampling: same user always included or excluded
const consistentSampling = new SamplingMiddleware({
  sampleRate: 0.2,
  consistentSampling: true,  // Based on anonymousId hash
});

// Sample only specific events
const targeted = new SamplingMiddleware({
  sampleRate: 0.05,
  onlyFor: ['page_view', 'hover'],  // High-volume events only
});

SunglassesCore.create({ middleware: [sampling], ... });
```

## What is never sampled

`$screen`, `$identify`, and `$alias` events are never sampled — only `capture` events are affected.

Kept events receive a `$sample_rate` property indicating the configured rate.
