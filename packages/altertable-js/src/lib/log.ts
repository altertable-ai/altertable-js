/* eslint-disable no-console */

export function log(condition: boolean, ...messages: string[]) {
  if (!__DEV__) {
    return;
  }

  if (condition) {
    return;
  }

  console.log(`[Altertable]`, ...messages);
}
