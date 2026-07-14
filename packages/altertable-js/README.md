# @altertable/altertable-js

JavaScript SDK for capturing and sending analytics events to Altertable.

## Installation

```bash
npm install @altertable/altertable-js
# or
pnpm add @altertable/altertable-js
# or
yarn add @altertable/altertable-js
# or
bun add @altertable/altertable-js
```

## Quick Start

```javascript
import { altertable } from '@altertable/altertable-js';

// Initialize with your API key
altertable.init('YOUR_API_KEY');

// Track an event
altertable.track('Step Completed', {
  step: 1,
});

// Identify a user
altertable.identify('u_01jza857w4f23s1hf2s61befmw', {
  email: 'john.doe@example.com',
  name: 'John Doe',
  company: 'Acme Corp',
  role: 'Software Engineer',
});

// Update user traits
altertable.updateTraits({
  onboarding_completed: true,
});

// Link a new ID to the current identity
altertable.alias('new_user_id-019aca6a-1e42-71af-81a0-1e14bbe2ccbd');
```

## Features

- **Automatic page view tracking** – Captures page views automatically
- **Session management** – Handles anonymous and session IDs automatically
- **Offline delivery** – Persists unsent events and retries when the browser comes back online
- **Event queuing** – Queues events when consent is pending
- **Privacy compliance** – Built-in tracking consent management
- **Multiple storage options** – localStorage, cookies, or both
- **TypeScript support** – Full TypeScript definitions included
- **Lightweight** – Minimal bundle size with no external dependencies

## API Reference

### Initialization

#### `altertable.init(apiKey, config?)`

Initializes the Altertable SDK with your API key and optional configuration.

**Parameters:**

| Parameter | Type                                    | Required | Description             |
| --------- | --------------------------------------- | -------- | ----------------------- |
| `apiKey`  | `string`                                | Yes      | Your Altertable API key |
| `config`  | [`AltertableConfig`](#altertableconfig) | No       | Configuration options   |

**Example:**

```javascript
altertable.init('YOUR_API_KEY', {
  environment: 'development',
});
```

Calling `init` again replaces configuration and **discards** any events still in the outbound batch buffer. If you need them sent first (for example before switching API keys), `await altertable.flush()` before calling `init` again.

### Event Tracking

#### `altertable.track(event, properties?)`

Tracks a custom event with optional properties.

**Parameters:**

| Parameter    | Type                                  | Required | Default | Description             |
| ------------ | ------------------------------------- | -------- | ------- | ----------------------- |
| `event`      | `string`                              | Yes      | -       | The event name          |
| `properties` | [`EventProperties`](#eventproperties) | No       | `{}`    | Custom event properties |

**Example:**

```javascript
altertable.track('Purchase Completed', {
  product_id: 'p_01jza8fr5efvgbxxdd1bwkd0m5',
  amount: 29.99,
  currency: 'USD',
});
```

#### `altertable.page(url)`

Tracks a page view event.

When [`autoCapture`](#autocapture) is enabled, this method is automatically called when the page URL changes.

**Parameters:**

| Parameter | Type     | Required | Description  |
| --------- | -------- | -------- | ------------ |
| `url`     | `string` | Yes      | The page URL |

**Example:**

```javascript
altertable.page('https://example.com/products');
```

> [!NOTE]
>
> **Page Tracking**: By default, Altertable automatically captures page views. Only use `page()` when you've disabled auto-capture.
>
> **Why use auto-capture (default)?**
>
> - No manual tracking required
> - Handles browser navigation events ([`popstate`](https://developer.mozilla.org/docs/Web/API/Window/popstate_event), [`hashchange`](https://developer.mozilla.org/docs/Web/API/Window/hashchange_event))
> - Consistent tracking across all page changes
>
> **When to use `page()`:**
>
> - Custom routing that doesn't trigger browser events
> - Virtual page views that don't trigger URL changes (modals, step changes)
> - Server-side tracking where auto-capture isn't available

#### Transforming events

Use `transformEvent` to customize a fully constructed track event before the
SDK queues, persists, or sends it. The transformer also runs for automatically
captured page views, so you can enrich them without disabling `autoCapture` or
adding router-specific tracking code.

```typescript
altertable.init('YOUR_API_KEY', {
  transformEvent(event) {
    if (event.event === '$pageview') {
      return {
        ...event,
        properties: {
          ...event.properties,
          title: document.title,
          content_group: 'documentation',
        },
      };
    }

    return event;
  },
});
```

The callback receives the complete [`TrackPayload`](#trackpayload), including
the event name, generated context, timestamp, and default properties. It runs
synchronously for events created by `track()` and `page()`; identity and alias
payloads are not transformed.

Return `null` to discard an event:

```typescript
altertable.init('YOUR_API_KEY', {
  transformEvent(event) {
    if (event.properties.internal_traffic === true) {
      return null;
    }

    return event;
  },
});
```

If the transformer throws, Altertable discards the event instead of sending
the original payload. The error is logged and passed to `onError` when an error
handler is configured. You can replace `transformEvent` at runtime with
`altertable.configure({ transformEvent })`.

### User Identification

#### `altertable.identify(userId, traits?)`

Identifies a user with their ID and optional traits.
It flags the identity as being a identitied user.

**Parameters:**

| Parameter | Type                        | Required | Default | Description                  |
| --------- | --------------------------- | -------- | ------- | ---------------------------- |
| `userId`  | `string`                    | Yes      | -       | The user's unique identifier |
| `traits`  | [`UserTraits`](#usertraits) | No       | `{}`    | User properties              |

**Example:**

```javascript
altertable.identify('u_01jza857w4f23s1hf2s61befmw', {
  email: 'john.doe@example.com',
  name: 'John Doe',
  company: 'Acme Corp',
  role: 'Software Engineer',
});
```

#### `altertable.updateTraits(traits)`

Updates user traits for the current user.

**Parameters:**

| Parameter | Type                        | Required | Description               |
| --------- | --------------------------- | -------- | ------------------------- |
| `traits`  | [`UserTraits`](#usertraits) | Yes      | User properties to update |

**Example:**

```javascript
altertable.updateTraits({
  onboarding_completed: true,
});
```

#### `altertable.alias(newUserId)`

Links a new ID to the current identity.

**Parameters:**

| Parameter   | Type     | Required | Default | Description                            |
| ----------- | -------- | -------- | ------- | -------------------------------------- |
| `newUserId` | `string` | Yes      | ------- | New ID to link to the current identity |

**Example:**

```javascript
altertable.alias('new_user_id-019aca6a-1e42-71af-81a0-1e14bbe2ccbd');
```

### Session Management

#### `altertable.reset(options?)`

Resets the current identity context so future events are not associated with the previous user.

**Parameters:**

| Parameter               | Type      | Required | Default | Description                |
| ----------------------- | --------- | -------- | ------- | -------------------------- |
| `options`               | `object`  | No       | `{}`    | Reset options              |
| `options.resetDeviceId` | `boolean` | No       | `false` | Whether to reset device ID |

**Example:**

```javascript
// Reset everything except device ID
altertable.reset();

// Reset all IDs
altertable.reset({
  resetDeviceId: true,
});
```

### Configuration

#### `altertable.configure(updates)`

Updates the configuration after initialization.

**Parameters:**

| Parameter | Type                                             | Required | Description           |
| --------- | ------------------------------------------------ | -------- | --------------------- |
| `updates` | [`Partial<AltertableConfig>`](#altertableconfig) | Yes      | Configuration updates |

**Example:**

```javascript
altertable.configure({
  trackingConsent: 'granted',
});
```

### Privacy & Consent

#### `altertable.getTrackingConsent()`

Returns the current tracking consent state.

**Returns:** [`TrackingConsentType`](#trackingconsenttype)

**Example:**

```javascript
const consent = altertable.getTrackingConsent();
if (consent === 'granted') {
  // Tracking is allowed
}
```

## Types

### `AltertableConfig`

Configuration options for the Altertable SDK.

| Property              | Type                                          | Default                       | Description                                            |
| --------------------- | --------------------------------------------- | ----------------------------- | ------------------------------------------------------ |
| `baseUrl`             | `string`                                      | `"https://api.altertable.ai"` | The base URL of the Altertable API                     |
| `environment`         | `string`                                      | `"production"`                | The environment of the application                     |
| `autoCapture`         | `boolean`                                     | `true`                        | Whether to automatically capture page views and events |
| `release`             | `string`                                      | -                             | The release ID of the application                      |
| `debug`               | `boolean`                                     | `false`                       | Whether to log events to the console                   |
| `persistence`         | [`StorageType`](#storagetype)                 | `"localStorage+cookie"`       | The persistence strategy for IDs                       |
| `eventPersistence`    | [`StorageType`](#storagetype) or `false`      | Same as `persistence`         | The persistence strategy for unsent event payloads     |
| `trackingConsent`     | [`TrackingConsentType`](#trackingconsenttype) | `"granted"`                   | The tracking consent state                             |
| `onError`             | `(error: Error) => void`                      | -                             | Optional handler for SDK errors                        |
| `transformEvent`      | [`TransformEvent`](#transformevent)           | -                             | Transform or discard track and page-view events        |
| `flushEventThreshold` | `number`                                      | `20`                          | Flush when combined buffered events reach this count   |
| `flushIntervalMs`     | `number`                                      | `150`                         | Periodic batch flush interval (ms)                     |
| `maxBatchSize`        | `number`                                      | `20`                          | Max payloads per HTTP request                          |

#### Offline Delivery

Altertable can persist unsent event payloads so they survive reloads and send when the browser comes back online. By default, event payloads use the same storage strategy as [`persistence`](#altertableconfig), but cookie-backed strategies store event payloads in `localStorage` only.

If you do not want event payloads written to durable browser storage, set `eventPersistence: false`. Events will still batch in memory for the current page session, but they will not survive a reload.

```javascript
altertable.init('YOUR_API_KEY', {
  eventPersistence: false,
});
```

### `EventProperties`

Custom properties for events.

```typescript
type EventProperties = Record<string, unknown>;
```

**Example:**

```javascript
{
  product_id: 'p_01jza8fr5efvgbxxdd1bwkd0m5',
  amount: 29.99,
  currency: 'USD',
  category: 'electronics',
  user_type: 'premium'
}
```

### `TrackPayload`

The complete payload passed to `transformEvent` and sent to the track API.

```typescript
type TrackPayload = {
  event: string;
  properties: EventProperties;
  timestamp: string;
  environment: string;
  device_id: `device-${string}`;
  distinct_id: string;
  anonymous_id: `anonymous-${string}` | null;
  session_id: `session-${string}`;
};
```

### `TransformEvent`

```typescript
type TransformEvent = (event: TrackPayload) => TrackPayload | null;
```

`EventProperties`, `TrackPayload`, and `TransformEvent` are exported from
`@altertable/altertable-js` for use in application code.

### `UserTraits`

User properties for identification.

```typescript
type UserTraits = Record<string, unknown>;
```

**Example:**

```javascript
{
  email: 'john.doe@example.com',
  name: 'John Doe',
  company: 'Acme Corp',
  role: 'Software Engineer',
  plan: 'premium',
  signup_date: '2024-01-15'
}
```

### `StorageType`

Available storage strategies.

| Value                   | Description                           |
| ----------------------- | ------------------------------------- |
| `"localStorage"`        | Use localStorage only                 |
| `"sessionStorage"`      | Use sessionStorage only               |
| `"cookie"`              | Use cookies only                      |
| `"memory"`              | Use in-memory storage (not persisted) |
| `"localStorage+cookie"` | Use localStorage with cookie fallback |

### `TrackingConsentType`

Available tracking consent states.

| Value         | Description                           |
| ------------- | ------------------------------------- |
| `"granted"`   | User has granted consent for tracking |
| `"denied"`    | User has denied consent for tracking  |
| `"pending"`   | User hasn't made a decision yet       |
| `"dismissed"` | User dismissed the consent prompt     |

## License

[MIT](./LICENSE)
