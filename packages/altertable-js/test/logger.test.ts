import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createLogger, loggerCache } from '../src/lib/logger';

describe('Logger', () => {
  const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
  };

  beforeEach(() => {
    console.log = vi.fn();
    console.warn = vi.fn();
    console.error = vi.fn();

    loggerCache.current = {};
  });

  afterEach(() => {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;

    vi.clearAllMocks();
  });

  describe('log', () => {
    it('logs with prefix', () => {
      const logger = createLogger('TestLogger');
      const message = 'Hello world';

      logger.log(message);

      expect(console.log).toHaveBeenCalledWith('[TestLogger]', message);
    });

    it('logs multiple arguments', () => {
      const logger = createLogger('TestLogger');
      const arg1 = 'Hello';
      const arg2 = { key: 'value' };
      const arg3 = 42;

      logger.log(arg1, arg2, arg3);

      expect(console.log).toHaveBeenCalledWith(
        '[TestLogger]',
        arg1,
        arg2,
        arg3
      );
    });
  });

  describe('warn', () => {
    it('warns with prefix', () => {
      const logger = createLogger('TestLogger');
      const message = 'Warning message';

      logger.warn(message);

      expect(console.warn).toHaveBeenCalledWith('[TestLogger]', message);
    });

    it('warns multiple arguments', () => {
      const logger = createLogger('TestLogger');
      const arg1 = 'Warning';
      const arg2 = { error: 'details' };

      logger.warn(arg1, arg2);

      expect(console.warn).toHaveBeenCalledWith('[TestLogger]', arg1, arg2);
    });
  });

  describe('error', () => {
    it('errors with prefix', () => {
      const logger = createLogger('TestLogger');
      const message = 'Error message';

      logger.error(message);

      expect(console.error).toHaveBeenCalledWith('[TestLogger]', message);
    });

    it('errors multiple arguments', () => {
      const logger = createLogger('TestLogger');
      const arg1 = 'Error';
      const arg2 = new Error('Something went wrong');

      logger.error(arg1, arg2);

      expect(console.error).toHaveBeenCalledWith('[TestLogger]', arg1, arg2);
    });
  });

  describe('warnDev', () => {
    it('warns in development mode', () => {
      const logger = createLogger('TestLogger');
      const message = 'Development warning';

      expect(() => {
        logger.warnDev(message);
      }).toWarnDev('[TestLogger] Development warning');
    });

    it('trims whitespace from message', () => {
      const logger = createLogger('TestLogger');
      const message = '  Development warning  ';

      expect(() => {
        logger.warnDev(message);
      }).toWarnDev('[TestLogger] Development warning');
    });

    it('passes additional arguments', () => {
      const logger = createLogger('TestLogger');
      const message = 'Development warning';
      const additionalArg = { debug: 'info' };

      logger.warnDev(message, additionalArg);

      expect(console.warn).toHaveBeenCalledWith(
        '[TestLogger] Development warning',
        additionalArg
      );
    });

    it('does not warn the same message twice', () => {
      const logger = createLogger('TestLogger');
      const message = 'Development warning';

      expect(() => {
        logger.warnDev(message);
      }).toWarnDev('[TestLogger] Development warning');

      expect(() => {
        logger.warnDev(message);
      }).not.toWarnDev('[TestLogger] Development warning');
    });

    it('warns different messages separately', () => {
      const logger = createLogger('TestLogger');
      const message1 = 'First warning';
      const message2 = 'Second warning';

      expect(() => {
        logger.warnDev(message1);
      }).toWarnDev('[TestLogger] First warning');
      expect(() => {
        logger.warnDev(message2);
      }).toWarnDev('[TestLogger] Second warning');
    });

    it('caches messages with trimmed content', () => {
      const logger = createLogger('TestLogger');
      const message1 = 'Development warning';
      const message2 = '  Development warning  ';

      expect(() => {
        logger.warnDev(message1);
      }).toWarnDev('[TestLogger] Development warning');
      expect(() => {
        logger.warnDev(message2);
      }).not.toWarnDev('[TestLogger] Development warning');
    });
  });

  describe('loggerCache', () => {
    it('is shared across logger instances', () => {
      const logger1 = createLogger('Logger1');
      const logger2 = createLogger('Logger2');
      const message = 'Shared warning';

      expect(() => {
        logger1.warnDev(message);
      }).toWarnDev('[Logger1] Shared warning');
      expect(() => {
        logger2.warnDev(message);
      }).not.toWarnDev('[Logger2] Shared warning');
    });
  });
});
