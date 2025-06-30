import { describe, expect, it, vi } from 'vitest';

import { invariant } from '../src/lib/invariant';

describe('invariant', () => {
  it('throws when the condition is unmet', () => {
    expect(() => {
      invariant(false, 'invariant');
    }).toThrow('[Altertable] invariant');
  });

  it('does not throw when the condition is met', () => {
    expect(() => {
      invariant(true, 'invariant');
    }).not.toThrow();
  });

  it('lazily instantiates message', () => {
    const spy1 = vi.fn(() => 'invariant');
    const spy2 = vi.fn(() => 'invariant');

    expect(() => {
      invariant(false, spy1);
    }).toThrow('[Altertable] invariant');

    expect(spy1).toHaveBeenCalledTimes(1);

    expect(() => {
      invariant(true, spy2);
    }).not.toThrow('[Altertable] invariant');

    expect(spy2).not.toHaveBeenCalled();
  });
});
