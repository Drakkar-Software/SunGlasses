---
sidebar_position: 2
title: Privacy Invariants
---

# Privacy Invariants

These rules must **never** be broken. They are enforced in code and documented here for contributors and AI-assisted development.

## 1. PiiSanitizer always runs first

In `SunglassesCore.ts`, `PiiSanitizer` is unconditionally prepended to the `MiddlewarePipeline`. Never remove or reorder it.

## 2. Consent gate is unconditional

Every public method in `SunglassesCore.ts` calls `this.canCapture()` before any I/O. If opted out, the method returns immediately with **zero side effects** — no queue writes, no network calls.

## 3. Never log distinctId or traits

The logger may log `anonymousId` (for debugging) but must **never** log `distinctId`, `traits`, or raw user identifiers — even in debug mode.

## 4. All consent reads are async

`ConsentManager.initialize()` reads from storage. Never assume consent state is available synchronously before `initialize()` completes.

## 5. Adapters must not mutate batches

`IAnalyticsAdapter.send()` receives a frozen reference to the queue's internal slice. Mutating it corrupts the queue.

## 6. Middleware must not throw

`MiddlewarePipeline` catches errors and treats them as drops, but throwing is a code smell. Use `return null` to drop; `return next(event)` to continue.

## 7. anonymousId is never derived from PII

Always a freshly generated UUID v4. The only way to associate it with a user is through `identify()`.
