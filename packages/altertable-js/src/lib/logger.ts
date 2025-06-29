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
    logHeader: () => {
      const header = `Altertable v${__LIB_VERSION__} %c• Debug mode enabled`;
      const hasAlreadyPrinted = loggerCache.current[header];

      if (!hasAlreadyPrinted) {
        loggerCache.current[header] = true;
        console.log(header, 'color: #64748b;');
      }
    },
    logEvent: (
      payload: EventPayload,
      config: Required<Pick<AltertableConfig, 'trackingConsent'>>
    ) => {
      const timestamp = new Date().toISOString();
      const [consentBadgeText, consentBadgeStyle] = createConsentBadgeElement(
        config.trackingConsent
      );
      const [eventBadgeText, eventBadgeStyle] = createEventBadgeElement(
        payload.event
      );
      const [environmentBadgeText, environmentBadgeStyle] =
        createEnvironmentBadgeElement(payload.environment);
      const [timestampText, timestampStyle] = createTimestampElement(timestamp);

      console.groupCollapsed(
        `[${prefix}] %c${eventBadgeText}%c [${environmentBadgeText}] %c(${timestampText}) %c${consentBadgeText}`,
        eventBadgeStyle,
        environmentBadgeStyle,
        timestampStyle,
        consentBadgeStyle
      );

      const [userLabelText, userLabelStyle] = createLabelElement('User');
      const [userValueText, userValueStyle] = createValueElement(
        payload.user_id ?? 'Not set'
      );

      console.log(
        `%c${userLabelText} %c${userValueText}`,
        userLabelStyle,
        userValueStyle
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
      const hasAlreadyPrinted = loggerCache.current[sanitizedMessage];

      if (!hasAlreadyPrinted) {
        loggerCache.current[sanitizedMessage] = true;
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

export const loggerCache: { current: Record<string, boolean> } = {
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

function createConsentBadgeElement(
  value: TrackingConsentType
): [string, string] {
  switch (value) {
    case TrackingConsent.GRANTED:
      return ['', ''];
    case TrackingConsent.DENIED:
      return [
        'DENIED',
        'background: #ef4444; color: #ffffff; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600;',
      ];
    case TrackingConsent.DISMISSED:
    case TrackingConsent.PENDING:
      return [
        'PENDING',
        'background: #f59e0b; color: #ffffff; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600;',
      ];
    default:
      return ['', ''];
  }
}

function createEventBadgeElement(value: string): [string, string] {
  return [
    value,
    'background: #1e293b; color: #f1f5f9; padding: 2px 8px; border-radius: 6px; font-weight: 400;',
  ];
}

function createEnvironmentBadgeElement(value: string): [string, string] {
  return [value, `color: ${getEnvironmentColor(value)}; font-weight: 400;`];
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

function createTimestampElement(value: string): [string, string] {
  return [formatEventTime(value), 'color: #64748b; font-weight: 400;'];
}

function createLabelElement(value: string): [string, string] {
  return [value, 'color: #64748b; font-size: 11px;'];
}

function createValueElement(value: string): [string, string] {
  return [
    value,
    'background: #f8fafc; color: #1e293b; padding: 2px 8px; border: 1px solid #e2e8f0; border-radius: 6px; font-family: "SF Mono", "Monaco", monospace; font-size: 11px;',
  ];
}
