import { describe, expect, it } from 'vitest';

describe('toWarnDev', () => {
  describe('usage', () => {
    it('fails with incorrect type of message', () => {
      expect(() => {
        // @ts-ignore:next-line
        expect(() => {}).toWarnDev(false);
      }).toThrowError(
        'toWarnDev() requires a parameter of type string but was given boolean.'
      );
    });
  });

  describe('without message', () => {
    it('does not fail if called', () => {
      expect(() => {
        expect(() => {
          console.warn('warning');
        }).toWarnDev();
      }).not.toThrow();
    });

    it('fails if not called', () => {
      expect(() => {
        expect(() => {}).toWarnDev();
      }).toThrowError('No warning recorded.');
    });
  });

  describe('with message', () => {
    it('does not fail with correct message', () => {
      expect(() => {
        expect(() => {
          console.warn('warning');
        }).toWarnDev('warning');
      }).not.toThrow();
    });

    it('fails if a warning is not correct', () => {
      expect(() => {
        expect(() => {
          console.warn('warning');
        }).toWarnDev('another warning');
      }).toThrow('Unexpected warning recorded.');
    });
  });
});
