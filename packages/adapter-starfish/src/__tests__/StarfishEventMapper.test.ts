import { describe, it, expect } from 'vitest';
import {
  createEmptyDocument,
  mergeEvents,
  pruneDocument,
  resolveStoragePath,
} from '../StarfishEventMapper.js';
import type { SunglassesEvent } from '@sunglasses/core';

function makeEvent(id: string, timestamp: string): SunglassesEvent {
  return {
    type: 'capture',
    event: 'test',
    distinctId: 'user-1',
    anonymousId: 'anon-1',
    timestamp,
    messageId: id,
    properties: {},
    context: { library: { name: '@sunglasses/core', version: '0.1.0' }, platform: 'web' },
  };
}

describe('StarfishEventMapper', () => {
  describe('createEmptyDocument', () => {
    it('returns a document with empty events array and version 1', () => {
      const doc = createEmptyDocument();
      expect(doc.events).toEqual([]);
      expect(doc.version).toBe('1');
      expect(doc.lastUpdated).toBeTruthy();
    });
  });

  describe('mergeEvents', () => {
    it('appends new events to the document', () => {
      const doc = createEmptyDocument();
      const event = makeEvent('msg-1', '2024-01-01T00:00:00.000Z');
      const merged = mergeEvents(doc, [event]);
      expect(merged.events).toHaveLength(1);
      expect(merged.events[0].messageId).toBe('msg-1');
    });

    it('de-duplicates events by messageId', () => {
      const doc = createEmptyDocument();
      const event = makeEvent('msg-1', '2024-01-01T00:00:00.000Z');
      const merged1 = mergeEvents(doc, [event]);
      const merged2 = mergeEvents(merged1, [event]); // same event again
      expect(merged2.events).toHaveLength(1);
    });

    it('preserves existing events and appends new ones', () => {
      const doc = createEmptyDocument();
      const e1 = makeEvent('msg-1', '2024-01-01T00:00:00.000Z');
      const e2 = makeEvent('msg-2', '2024-01-02T00:00:00.000Z');
      const merged = mergeEvents(mergeEvents(doc, [e1]), [e2]);
      expect(merged.events.map(e => e.messageId)).toEqual(['msg-1', 'msg-2']);
    });

    it('updates lastUpdated timestamp', () => {
      const doc = createEmptyDocument();
      const before = doc.lastUpdated;
      const merged = mergeEvents(doc, [makeEvent('x', '2024-01-01T00:00:00.000Z')]);
      expect(merged.lastUpdated).not.toBe(before);
    });
  });

  describe('pruneDocument', () => {
    it('removes events older than maxAgeMs', () => {
      const now = Date.now();
      const oldTimestamp = new Date(now - 2 * 86_400_000).toISOString(); // 2 days ago
      const newTimestamp = new Date(now - 1_000).toISOString(); // 1 second ago

      const doc = mergeEvents(
        mergeEvents(createEmptyDocument(), [makeEvent('old', oldTimestamp)]),
        [makeEvent('new', newTimestamp)]
      );

      const pruned = pruneDocument(doc, { maxAgeMs: 86_400_000 }); // 1 day
      expect(pruned.events.map(e => e.messageId)).toEqual(['new']);
    });

    it('keeps only the last N events when maxEventsPerIdentity is set', () => {
      let doc = createEmptyDocument();
      for (let i = 0; i < 5; i++) {
        doc = mergeEvents(doc, [makeEvent(`msg-${i}`, `2024-01-0${i + 1}T00:00:00.000Z`)]);
      }
      const pruned = pruneDocument(doc, { maxEventsPerIdentity: 3 });
      expect(pruned.events).toHaveLength(3);
      expect(pruned.events.map(e => e.messageId)).toEqual(['msg-2', 'msg-3', 'msg-4']);
    });

    it('applies both maxAgeMs and maxEventsPerIdentity', () => {
      const now = Date.now();
      const recent = (daysAgo: number) => new Date(now - daysAgo * 86_400_000).toISOString();
      let doc = createEmptyDocument();
      doc = mergeEvents(doc, [makeEvent('very-old', recent(10))]);
      doc = mergeEvents(doc, [makeEvent('old', recent(3))]);
      doc = mergeEvents(doc, [makeEvent('mid', recent(2))]);
      doc = mergeEvents(doc, [makeEvent('new', recent(0))]);

      const pruned = pruneDocument(doc, {
        maxAgeMs: 4 * 86_400_000,     // keep last 4 days → removes 'very-old'
        maxEventsPerIdentity: 2,       // keep last 2 → removes 'old'
      });
      expect(pruned.events.map(e => e.messageId)).toEqual(['mid', 'new']);
    });

    it('returns unchanged doc when no config applies', () => {
      const doc = mergeEvents(createEmptyDocument(), [
        makeEvent('a', '2024-01-01T00:00:00.000Z'),
      ]);
      const pruned = pruneDocument(doc, {});
      expect(pruned.events).toHaveLength(1);
    });
  });

  describe('resolveStoragePath', () => {
    it('replaces {identity} placeholder', () => {
      expect(resolveStoragePath('analytics/{identity}/events', 'user-123'))
        .toBe('analytics/user-123/events');
    });

    it('URL-encodes the identity', () => {
      expect(resolveStoragePath('data/{identity}', 'user@example.com'))
        .toBe('data/user%40example.com');
    });

    it('leaves the template unchanged when no placeholder present', () => {
      expect(resolveStoragePath('data/events', 'user-123')).toBe('data/events');
    });
  });
});
