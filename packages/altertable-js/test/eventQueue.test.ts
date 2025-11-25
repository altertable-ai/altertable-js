import { beforeEach, describe, expect, it } from 'vitest';

import { MAX_EVENT_QUEUE_SIZE } from '../src/constants';
import { EventQueue } from '../src/lib/eventQueue';
import type {
  AltertableContext,
  EventPayload,
  TrackPayload,
} from '../src/types';

describe('EventQueue', () => {
  let eventQueue: EventQueue<EventPayload>;
  const mockContext: AltertableContext = {
    environment: 'production',
    user_id: null,
    visitor_id: 'visitor-test-1',
    session_id: 'session-test-1',
    device_id: 'device-test-1',
    distinct_id: 'visitor-test-1',
  };
  const mockEvent: EventPayload = {
    timestamp: '2023-01-01T00:00:00.000Z',
    event: 'test-event',
    user_id: null,
    device_id: 'device-test-1',
    distinct_id: 'visitor-test-1',
    session_id: 'session-test-1',
    visitor_id: 'visitor-test-1',
    environment: 'production',
    properties: { foo: 'bar' },
  };

  beforeEach(() => {
    eventQueue = new EventQueue(MAX_EVENT_QUEUE_SIZE);
  });

  describe('enqueue', () => {
    it('should add events to the queue', () => {
      eventQueue.enqueue('track', mockEvent, mockContext);

      expect(eventQueue.getSize()).toBe(1);
    });

    it('should add multiple events to the queue', () => {
      const event1 = { ...mockEvent, event: 'event-1' };
      const event2 = { ...mockEvent, event: 'event-2' };
      const event3 = { ...mockEvent, event: 'event-3' };

      eventQueue.enqueue('track', event1, mockContext);
      eventQueue.enqueue('track', event2, mockContext);
      eventQueue.enqueue('track', event3, mockContext);

      expect(eventQueue.getSize()).toBe(3);
    });

    it('should remove oldest event when queue is full', () => {
      // Fill the queue to capacity
      for (let i = 0; i < MAX_EVENT_QUEUE_SIZE; i++) {
        eventQueue.enqueue(
          'track',
          { ...mockEvent, event: `event-${i}` },
          mockContext
        );
      }

      expect(eventQueue.getSize()).toBe(MAX_EVENT_QUEUE_SIZE);

      // Add one more event
      eventQueue.enqueue(
        'track',
        { ...mockEvent, event: 'new-event' },
        mockContext
      );

      // Queue should still be at max size
      expect(eventQueue.getSize()).toBe(MAX_EVENT_QUEUE_SIZE);

      // The oldest event should be removed
      const flushedEvents = eventQueue.flush();
      expect((flushedEvents[0].payload as TrackPayload).event).toBe('event-1'); // event-0 should be removed
      expect(
        (flushedEvents[flushedEvents.length - 1].payload as TrackPayload).event
      ).toBe('new-event');
    });
  });

  describe('flush', () => {
    it('should return all events and clear the queue', () => {
      const event1 = { ...mockEvent, event: 'event-1' };
      const event2 = { ...mockEvent, event: 'event-2' };
      const event3 = { ...mockEvent, event: 'event-3' };

      eventQueue.enqueue('track', event1, mockContext);
      eventQueue.enqueue('track', event2, mockContext);
      eventQueue.enqueue('track', event3, mockContext);

      const flushedEvents = eventQueue.flush();

      expect(flushedEvents).toHaveLength(3);
      expect(flushedEvents[0].payload).toEqual(event1);
      expect(flushedEvents[0].eventType).toBe('track');
      expect(flushedEvents[1].payload).toEqual(event2);
      expect(flushedEvents[1].eventType).toBe('track');
      expect(flushedEvents[2].payload).toEqual(event3);
      expect(flushedEvents[2].eventType).toBe('track');

      expect(eventQueue.getSize()).toBe(0);
    });

    it('should return empty array when queue is empty', () => {
      const flushedEvents = eventQueue.flush();

      expect(flushedEvents).toHaveLength(0);
      expect(eventQueue.getSize()).toBe(0);
    });
  });

  describe('clear', () => {
    it('should remove all events from the queue', () => {
      eventQueue.enqueue('track', mockEvent, mockContext);
      eventQueue.enqueue(
        'track',
        { ...mockEvent, event: 'event-2' },
        mockContext
      );

      expect(eventQueue.getSize()).toBe(2);

      eventQueue.clear();

      expect(eventQueue.getSize()).toBe(0);
    });

    it('should work when queue is already empty', () => {
      expect(eventQueue.getSize()).toBe(0);

      eventQueue.clear();

      expect(eventQueue.getSize()).toBe(0);
    });
  });

  describe('getSize', () => {
    it('should return correct queue size', () => {
      expect(eventQueue.getSize()).toBe(0);

      eventQueue.enqueue('track', mockEvent, mockContext);
      expect(eventQueue.getSize()).toBe(1);

      eventQueue.enqueue(
        'track',
        { ...mockEvent, event: 'event-2' },
        mockContext
      );
      expect(eventQueue.getSize()).toBe(2);

      eventQueue.flush();
      expect(eventQueue.getSize()).toBe(0);
    });
  });
});
