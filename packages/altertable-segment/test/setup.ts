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

// Declare global types for TypeScript
declare global {
  // eslint-disable-next-line no-var
  var RetryError: {
    new (message: string): RetryError;
  };
  // eslint-disable-next-line no-var
  var EventNotSupported: {
    new (message: string): EventNotSupported;
  };
}
