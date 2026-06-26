---
sidebar_position: 4
title: Troubleshooting
---

# Troubleshooting

## Events are never sent

- Check consent: `client.getConsentStatus()` must be `'opted-in'`
- Check `disabled: false` in your config
- Enable `debug: true` and watch the console
- On React Native: ensure `react-native-get-random-values` is the first import

## Events are missing properties

- If `allowedProperties` is set, all other keys are stripped
- Check `deniedProperties` for accidental matches
- PII patterns (email, phone, IP, credit card) are redacted automatically

## Queue grows but never empties

- All adapters are failing — check network and endpoint config
- Events persist across restarts until an adapter succeeds

## Starfish sync conflicts

- 409s are retried automatically (up to `maxRetries`)
- High contention may exhaust retries — increase `maxRetries` on the Starfish client

## Event counting returns 0

- Ensure `enableEventCounting: true` in your config
- Counts only accumulate for `capture()` events (not screen/identify/alias)

## Error handling reference

| Scenario | Behaviour |
|----------|-----------|
| Adapter `send()` throws | Events stay in queue; retry on next flush |
| All adapters fail | Events stay in queue; no data is lost |
| Storage quota exceeded | Write silently ignored; queue may be inconsistent |
| Network timeout (HTTP) | Exponential backoff; discard after `maxRetries` |
| Middleware throws | Event dropped; error logged; pipeline continues |
