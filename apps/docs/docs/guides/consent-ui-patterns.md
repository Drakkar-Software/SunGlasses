---
sidebar_position: 4
title: Consent UI Patterns
---

# Consent UI Patterns

SunGlasses does not ship a pre-built consent banner — you control the UX. The SDK provides the consent API; your app decides when and how to prompt users.

## First launch flow

On first launch, `getConsentStatus()` returns `'unknown'`. No events are collected until the user opts in.

```tsx
function ConsentBanner() {
  const client = useSunglasses();
  const status = useConsentStatus(client); // reactive hook from sunglasses-react

  if (status === 'opted-in' || status === 'opted-out') return null;

  return (
    <div>
      <p>We use analytics to improve the app. No data is collected until you accept.</p>
      <button onClick={() => client.optIn()}>Accept</button>
      <button onClick={() => client.optOut()}>Decline</button>
    </div>
  );
}
```

Place `<ConsentBanner />` inside `<SunglassesProvider>` so `useSunglasses()` and `useConsentStatus()` work.

## Settings screen — revoke consent

```tsx
function PrivacySettings() {
  const client = useSunglasses();

  return (
  <button onClick={() => client.optOut()}>
    Withdraw analytics consent
  </button>
  );
}
```

`optOut()` clears the queue immediately — no further events are sent.

## Wait for initialization

`SunglassesCore.create()` is async because consent is read from storage. Do not render tracking UI until the client is ready:

```tsx
const [client, setClient] = useState<ISunglassesClient | null>(null);

useEffect(() => {
  SunglassesCore.create({ ... }).then(setClient);
}, []);

if (!client) return <Loading />;
return <SunglassesProvider client={client}>...</SunglassesProvider>;
```

## Policy version changes

When you bump `consentPolicyVersion`, previously opted-in users revert to `'unknown'`. Show the banner again:

```ts
SunglassesCore.create({
  consentPolicyVersion: '2.0',
  ...
});
```

See [GDPR — consent versioning](/advanced/gdpr).

## Respect browser signals (web)

With `respectDoNotTrack: true` (default), users with GPC/DNT enabled are treated as opted out automatically. Your banner can still explain this:

```tsx
if (client.getConsentStatus() === 'opted-out') {
  // May be explicit opt-out OR browser signal — don't re-prompt aggressively
}
```

## Related

- [Consent](/privacy/consent)
- [Web setup](/getting-started/web-setup)
