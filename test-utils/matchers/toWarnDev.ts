export function toWarnDev(
  callback: () => void,
  expectedMessage?: string
): { pass: boolean; message: () => string } {
  if (expectedMessage !== undefined && typeof expectedMessage !== 'string') {
    return {
      pass: false,
      message: () =>
        `toWarnDev() requires a parameter of type string but was given ${typeof expectedMessage}.`,
    };
  }

  if (!__DEV__) {
    callback();
    return {
      pass: true,
      message: () => 'Warning check skipped in production',
    };
  }

  const originalWarnMethod = console.warn;
  let calledTimes = 0;
  let actualWarning = '';

  console.warn = (message: string) => {
    calledTimes++;
    actualWarning = message;
  };

  callback();

  console.warn = originalWarnMethod;

  // Expectation without any message.
  // We only check that `console.warn` was called.
  if (expectedMessage === undefined && calledTimes === 0) {
    return {
      pass: false,
      message: () => 'No warning recorded.',
    };
  }

  // Expectation with a message.
  if (expectedMessage !== undefined && actualWarning !== expectedMessage) {
    return {
      pass: false,
      message: () => `Unexpected warning recorded.

Expected: ${expectedMessage}
Received: ${actualWarning}`,
    };
  }

  return {
    pass: true,
    message: () => 'Expected warning was recorded',
  };
}
