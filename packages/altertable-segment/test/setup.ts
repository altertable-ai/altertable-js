// redefine global classes available in the global Segment scope
class RetryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RetryError';
  }
}

class EventNotSupported extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EventNotSupported';
  }
}

(global as any).RetryError = RetryError;
(global as any).EventNotSupported = EventNotSupported;
