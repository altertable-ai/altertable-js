/* eslint-disable no-console */

import {
  PROPERTY_URL,
  TrackingConsent,
  TrackingConsentType,
} from '../constants';
import { IdentifyPayload, TrackPayload } from '../types';

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
      payload: TrackPayload,
      { trackingConsent }: { trackingConsent: TrackingConsentType }
    ) => {
      const [eventBadgeLabel, eventBadgeStyle] = createEventBadgeElement(
        payload.event === '$pageview' ? 'Page' : 'Track'
      );
      const [eventTitleLabel, eventTitleStyle] = createEventTitleElement(
        payload.event === '$pageview'
          ? String(payload.properties[PROPERTY_URL])
          : payload.event
      );
      const [environmentBadgeLabel, environmentBadgeStyle] =
        createEnvironmentBadgeElement(payload.environment);
      const [timestampLabel, timestampStyle] = createTimestampElement(
        payload.timestamp
      );
      const [consentBadgeLabel, consentBadgeStyle] =
        getConsentBadgeElement(trackingConsent);

      console.groupCollapsed(
        `[${prefix}] %c${eventBadgeLabel}%c ${eventTitleLabel} %c[${environmentBadgeLabel}] %c${timestampLabel} %c${consentBadgeLabel}`,
        eventBadgeStyle,
        eventTitleStyle,
        environmentBadgeStyle,
        timestampStyle,
        consentBadgeStyle
      );

      const [userLabel, userLabelStyle] = createEventLabelElement('User ID');
      const [userValueLabel, userValueStyle] = createValueElement(
        payload.distinct_id ?? 'Not set'
      );
      const [visitorLabel, visitorLabelStyle] =
        createEventLabelElement('Visitor ID');
      const [visitorValueLabel, visitorValueStyle] = createValueElement(
        payload.anonymous_id ?? 'Not set'
      );
      const [sessionLabel, sessionLabelStyle] =
        createEventLabelElement('Session ID');
      const [sessionValueLabel, sessionValueStyle] = createValueElement(
        payload.session_id ?? 'Not set'
      );

      console.log(
        `%c${userLabel} %c${userValueLabel}`,
        userLabelStyle,
        userValueStyle
      );
      console.log(
        `%c${visitorLabel} %c${visitorValueLabel}`,
        visitorLabelStyle,
        visitorValueStyle
      );
      console.log(
        `%c${sessionLabel} %c${sessionValueLabel}`,
        sessionLabelStyle,
        sessionValueStyle
      );
      console.table(payload.properties);
      console.groupEnd();
    },
    logIdentify: (
      payload: IdentifyPayload,
      { trackingConsent }: { trackingConsent: TrackingConsentType }
    ) => {
      const [eventBadgeLabel, eventBadgeStyle] =
        createEventBadgeElement('Identify');
      const [environmentBadgeLabel, environmentBadgeStyle] =
        createEnvironmentBadgeElement(payload.environment);
      const [consentBadgeLabel, consentBadgeStyle] =
        getConsentBadgeElement(trackingConsent);

      console.groupCollapsed(
        `[${prefix}] %c${eventBadgeLabel}%c ${payload.distinct_id} %c[${environmentBadgeLabel}] %c${consentBadgeLabel}`,
        eventBadgeStyle,
        'font-weight: 600;',
        environmentBadgeStyle,
        consentBadgeStyle
      );

      const [userLabel, userLabelStyle] = createEventLabelElement('User ID');
      const [userValueLabel, userValueStyle] = createValueElement(
        payload.distinct_id ?? 'Not set'
      );
      const [visitorLabel, visitorLabelStyle] =
        createEventLabelElement('Visitor ID');
      const [visitorValueLabel, visitorValueStyle] = createValueElement(
        payload.anonymous_id ?? 'Not set'
      );

      console.log(
        `%c${userLabel} %c${userValueLabel}`,
        userLabelStyle,
        userValueStyle
      );
      console.log(
        `%c${visitorLabel} %c${visitorValueLabel}`,
        visitorLabelStyle,
        visitorValueStyle
      );
      console.table(payload.traits);
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

function getEventBadgeColor(event: string) {
  switch (event) {
    case 'Page':
      return '#64748b';
    case 'Identify':
      return '#a855f7';
    case 'Track':
      return '#10b981';
    default:
      return '#1e293b';
  }
}

function createEventBadgeElement(event: string): [string, string] {
  return [
    event,
    `background: ${getEventBadgeColor(event)}; color: #ffffff; padding: 2px 8px; border-radius: 6px; font-weight: 400;`,
  ];
}

function createEventTitleElement(event: string): [string, string] {
  const label = event === '$pageview' ? 'Page Viewed' : event;
  return [label, 'font-weight: 600;'];
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

function createEventLabelElement(value: string): [string, string] {
  return [value, 'color: #64748b; font-size: 11px;'];
}

function createValueElement(value: string): [string, string] {
  return [
    value,
    'background: #f8fafc; color: #1e293b; padding: 2px 8px; border: 1px solid #e2e8f0; border-radius: 6px; font-family: "SF Mono", "Monaco", monospace; font-size: 11px;',
  ];
}

function getConsentBadgeElement(
  trackingConsent: TrackingConsentType
): [string, string] {
  switch (trackingConsent) {
    case TrackingConsent.GRANTED:
      return ['', ''];
    case TrackingConsent.DENIED:
      return [
        'DENIED',
        'background: #ef4444; color: #ffffff; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600;',
      ];
    case TrackingConsent.PENDING:
    case TrackingConsent.DISMISSED:
      return [
        'PENDING',
        'background: #f59e0b; color: #ffffff; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600;',
      ];
    default:
      return [
        'UNKNOWN',
        'background: #6b7280; color: #ffffff; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600;',
      ];
  }
}
