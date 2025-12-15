declare global {
  class RetryError extends Error {
    constructor(message: string);
  }

  class EventNotSupported extends Error {
    constructor(message: string);
  }
}

export {};
