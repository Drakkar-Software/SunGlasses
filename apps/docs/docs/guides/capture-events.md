---
sidebar_position: 1
title: Capture Events
---

# Capture Events

## Basic capture

```ts
client.capture('button_clicked', { buttonId: 'cta', screen: 'home' });
```

`capture()` is consent-gated. If the user has not opted in, the call returns immediately with no side effects.

## Screen views

```ts
client.screen('Checkout', { step: 2 });
```

On web, enable automatic screen tracking via `SunglassesProvider`:

```tsx
<SunglassesProvider client={client} screenTracking={{ useHistoryApi: true }}>
```

On React Native, use `useExpoRouterScreenTracking` or `useNavigationScreenTracking`. See [Screen tracking](/guides/screen-tracking).

## Identify and group

```ts
client.identify('user-123', { plan: 'pro', country: 'US' });
client.alias('user-123', anonymousId);
client.group('org-456', { name: 'Acme Corp' });
```

## Super properties

Properties registered with `register()` are merged into every subsequent event:

```ts
client.register({ experiment_group: 'A' });
client.unregister('experiment_group');
client.getRegisteredProperties();
```

## Advanced capture options

Pass a third argument to `capture()` for back-dating or deduplication:

```ts
// Back-date an offline event
client.capture('purchase_completed', { amount: 29.99 }, {
  timestamp: '2026-01-15T10:00:00.000Z',
});

// Inject a server-side deduplication ID
client.capture('order_created', { orderId: '123' }, {
  messageId: '550e8400-e29b-41d4-a716-446655440000',
});
```

## UTM / attribution

See [Screen tracking](/guides/screen-tracking) for UTM capture on web and deep links.

## Type-safe events

See [Type-safe event catalog](/advanced/typed-events) for compile-time event name checking.
