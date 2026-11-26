/* oxlint-disable no-console */

import { EVENT_PAGEVIEW, PROPERTY_URL } from './events';

// Structural copies of the core payload fields the debug output prints. This
// module sits below the core package, so it cannot import core types.
type TrackingConsent = 'granted' | 'denied' | 'pending' | 'dismissed';
type LoggedEvent = {
  event: string;
  timestamp: string;
  properties: Record<string, unknown>;
  distinct_id?: string;
  anonymous_id?: string | null;
  session_id?: string;
};
type LoggedIdentify = {
  distinct_id: string;
  anonymous_id: string | null;
  traits: Record<string, unknown>;
};
type LoggedAlias = { distinct_id: string; new_user_id: string };

export type Logger = ReturnType<typeof createLogger>;

// Some runtimes' console types accept a single label, but the debug output
// passes `%c` styles, which browsers apply.
function logGroup(...data: unknown[]) {
  (console.groupCollapsed as (...data: unknown[]) => void).apply(console, data);
}

/** Messages already printed, shared by every logger so each prints once. */
export const loggerCache = new Set<string>();

/** Creates the logger shared by the SDK packages. */
export function createLogger(prefix: string) {
  /**
   * Prints a warning once. A warning that comes with an error is printed once
   * per distinct error message.
   */
  function warnOnce(message: string, error?: Error) {
    const sanitizedMessage = message.trim();
    const key = error
      ? `${sanitizedMessage}\n${error.message}`
      : sanitizedMessage;

    if (loggerCache.has(key)) {
      return;
    }

    loggerCache.add(key);
    const warning = `[${prefix}] ${sanitizedMessage}`;
    console.warn(warning, ...(error ? [error] : []));

    try {
      // This error is thrown so that you can find the source of the warning
      // by enabling "Pause on exceptions" in your debugger.
      throw new Error(warning);
    } catch {
      // Do nothing.
    }
  }

  return {
    log: (...args: unknown[]) => {
      console.log(`[${prefix}]`, ...args);
    },
    warn: (...args: unknown[]) => {
      console.warn(`[${prefix}]`, ...args);
    },
    warnOnce,
    /** Prints a warning once, in development builds only. */
    warnDev: (message: string, error?: Error) => {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        warnOnce(message, error);
      }
    },
    error: (...args: unknown[]) => {
      console.error(`[${prefix}]`, ...args);
    },
  };
}

/**
 * Extends the shared logger with the debug output that the core package prints
 * for each event when `debug` is enabled.
 */
export function createDebugLogger(prefix: string) {
  return {
    ...createLogger(prefix),
    logHeader: () => {
      const header = `Altertable v${__LIB_VERSION__} %c• Debug mode enabled`;
      if (!loggerCache.has(header)) {
        loggerCache.add(header);
        console.log(header, 'color: #64748b;');
      }
    },
    logEvent: (
      payload: LoggedEvent,
      { trackingConsent }: { trackingConsent: TrackingConsent }
    ) => {
      const [eventBadgeLabel, eventBadgeStyle] = createEventBadgeElement(
        payload.event === EVENT_PAGEVIEW ? 'Page' : 'Track'
      );
      const [eventTitleLabel, eventTitleStyle] = createEventTitleElement(
        payload.event === EVENT_PAGEVIEW
          ? // oxlint-disable-next-line typescript/no-base-to-string -- Debug output intentionally stringifies arbitrary event properties.
            String(payload.properties[PROPERTY_URL])
          : payload.event
      );
      const [timestampLabel, timestampStyle] = createTimestampElement(
        payload.timestamp
      );
      const [consentBadgeLabel, consentBadgeStyle] =
        getConsentBadgeElement(trackingConsent);

      logGroup(
        `[${prefix}] %c${eventBadgeLabel}%c ${eventTitleLabel} %c${timestampLabel} %c${consentBadgeLabel}`,
        eventBadgeStyle,
        eventTitleStyle,
        timestampStyle,
        consentBadgeStyle
      );

      const [userLabel, userLabelStyle] = createEventLabelElement('User ID');
      const [userValueLabel, userValueStyle] = createValueElement(
        payload.distinct_id ?? 'Not set'
      );
      const [anonymousLabel, anonymousLabelStyle] =
        createEventLabelElement('Anonymous ID');
      const [anonymousValueLabel, anonymousValueStyle] = createValueElement(
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
        `%c${anonymousLabel} %c${anonymousValueLabel}`,
        anonymousLabelStyle,
        anonymousValueStyle
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
      payload: LoggedIdentify,
      { trackingConsent }: { trackingConsent: TrackingConsent }
    ) => {
      const [eventBadgeLabel, eventBadgeStyle] =
        createEventBadgeElement('Identify');
      const [consentBadgeLabel, consentBadgeStyle] =
        getConsentBadgeElement(trackingConsent);

      logGroup(
        `[${prefix}] %c${eventBadgeLabel}%c ${payload.distinct_id} %c${consentBadgeLabel}`,
        eventBadgeStyle,
        'font-weight: 600;',
        consentBadgeStyle
      );

      const [distinctIdLabel, distinctIdLabelStyle] =
        createEventLabelElement('Distinct ID');
      const [distinctIdValueLabel, distinctIdValueStyle] = createValueElement(
        payload.distinct_id ?? 'Not set'
      );
      const [anonymousLabel, anonymousLabelStyle] =
        createEventLabelElement('Anonymous ID');
      const [anonymousalueLabel, anonymousValueStyle] = createValueElement(
        payload.anonymous_id ?? 'Not set'
      );

      console.log(
        `%c${distinctIdLabel} %c${distinctIdValueLabel}`,
        distinctIdLabelStyle,
        distinctIdValueStyle
      );
      console.log(
        `%c${anonymousLabel} %c${anonymousalueLabel}`,
        anonymousLabelStyle,
        anonymousValueStyle
      );
      console.table(payload.traits);
      console.groupEnd();
    },
    logAlias: (
      payload: LoggedAlias,
      { trackingConsent }: { trackingConsent: TrackingConsent }
    ) => {
      const [eventBadgeLabel, eventBadgeStyle] =
        createEventBadgeElement('Alias');
      const [consentBadgeLabel, consentBadgeStyle] =
        getConsentBadgeElement(trackingConsent);

      logGroup(
        `[${prefix}] %c${eventBadgeLabel}%c ${payload.distinct_id} %c${consentBadgeLabel}`,
        eventBadgeStyle,
        'font-weight: 600;',
        consentBadgeStyle
      );

      const [distinctIdLabel, distinctIdLabelStyle] =
        createEventLabelElement('Distinct ID');
      const [distinctIdValueLabel, distinctIdValueStyle] = createValueElement(
        payload.distinct_id ?? 'Not set'
      );

      const [newUserIdLabel, newUserIdLabelStyle] =
        createEventLabelElement('New User ID');
      const [newUserIdValueLabel, newUserIdValueStyle] = createValueElement(
        payload.new_user_id ?? 'Not set'
      );

      console.log(
        `%c${distinctIdLabel} %c${distinctIdValueLabel}`,
        distinctIdLabelStyle,
        distinctIdValueStyle
      );
      console.log(
        `%c${newUserIdLabel} %c${newUserIdValueLabel}`,
        newUserIdLabelStyle,
        newUserIdValueStyle
      );
      console.groupEnd();
    },
  };
}

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
  trackingConsent: TrackingConsent
): [string, string] {
  switch (trackingConsent) {
    case 'granted':
      return ['', ''];
    case 'denied':
      return [
        'DENIED',
        'background: #ef4444; color: #ffffff; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600;',
      ];
    case 'pending':
    case 'dismissed':
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
