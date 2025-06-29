/* eslint-disable no-console */

import { AltertableConfig } from '../core';
import { EventPayload } from '../types';
import { TrackingConsent, type TrackingConsentType } from './constants';

export type Logger = ReturnType<typeof createLogger>;

export function createLogger(prefix: string) {
  return {
    log: (...args: unknown[]) => {
      console.log(`[${prefix}]`, ...args);
    },
    logEvent: (
      payload: EventPayload,
      config: Required<Pick<AltertableConfig, 'trackingConsent'>>
    ) => {
      const timestamp = new Date().toISOString();
      const { style: consentBadgeStyle, text: consentBadgeText } =
        getConsentBadgeElement(config.trackingConsent);

      console.groupCollapsed(
        `[${prefix}] %c${payload.event}%c [${payload.environment}] %c(${formatEventTime(timestamp)}) %c${consentBadgeText}`,
        'background: #1e293b; color: #f1f5f9; padding: 2px 8px; border-radius: 6px; font-weight: 400;',
        `color: ${getEnvironmentColor(payload.environment)}; font-weight: 400;`,
        'color: #64748b; font-weight: 400;',
        consentBadgeStyle
      );
      console.log(
        `%cUser %c${payload.user_id ?? 'Not set'}`,
        'color: #64748b; font-size: 11px;',
        'background: #f8fafc; color: #1e293b; padding: 2px 8px; border: 1px solid #e2e8f0; border-radius: 6px; font-family: "SF Mono", "Monaco", monospace; font-size: 11px;'
      );
      console.table(payload.properties);
      console.groupEnd();
    },
    warn: (...args: unknown[]) => {
      console.warn(`[${prefix}]`, ...args);
    },
    warnDev: (message: string, ...args: unknown[]) => {
      if (!__DEV__) {
        return;
      }

      const sanitizedMessage = message.trim();
      const hasAlreadyPrinted = warnCache.current[sanitizedMessage];

      if (!hasAlreadyPrinted) {
        warnCache.current[sanitizedMessage] = true;
        const warning = `[${prefix}] ${sanitizedMessage}`;

        console.warn(warning, ...args);

        try {
          // Welcome to debugging Altertable.
          //
          // This error was thrown as a convenience so that you can find the source
          // of the warning that appears in the console by enabling "Pause on exceptions"
          // in your debugger.
          throw new Error(warning);
        } catch (error) {
          // Do nothing
        }
      }
    },
    error: (...args: unknown[]) => {
      console.error(`[${prefix}]`, ...args);
    },
  };
}

export const warnCache: { current: Record<string, boolean> } = {
  current: {},
};

function formatEventTime(timestamp: string) {
  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function getEnvironmentColor(environment: string) {
  const formattedEnv = environment.toLocaleLowerCase().startsWith('prod')
    ? 'production'
    : environment;

  switch (formattedEnv) {
    case 'production':
      return '#ef4444';
    default:
      return '#3b82f6';
  }
}

function getConsentBadgeElement(trackingConsent: TrackingConsentType): {
  text: string;
  style: string;
} {
  switch (trackingConsent) {
    case TrackingConsent.GRANTED:
      return {
        text: '',
        style: '',
      };
    case TrackingConsent.DENIED:
      return {
        text: 'DENIED',
        style:
          'background: #ef4444; color: #ffffff; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600;',
      };
    case TrackingConsent.PENDING:
      return {
        text: 'PENDING',
        style:
          'background: #f59e0b; color: #ffffff; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600;',
      };
    default:
      return {
        text: 'UNKNOWN',
        style:
          'background: #6b7280; color: #ffffff; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600;',
      };
  }
}
