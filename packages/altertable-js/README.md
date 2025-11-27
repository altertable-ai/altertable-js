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

// Attach a new alias id to current identity
altertable.alias('alias_id');
```

## Features

- **Automatic page view tracking** – Captures page views automatically
- **Session management** – Handles visitor and session IDs automatically
- **Event queuing** – Queues events when offline or consent is pending
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

#### `alterable.alias(aliasId)`

Attach a new alias id to current identity.

**Parameters:**

| Parameter | Type | Required | Default | Description |
| ----------| --- | -- | --- |  --- |
| `aliasId` | `string` | Yes | - | Alias id to be linked to current identity |

**Example:**

```javascript
altertable.alias("backend_id");
```

### Session Management

#### `altertable.reset(options?)`

Resets identity context. You should call this at user logout. It will ensure multiple users are not linked together by error.

**Parameters:**

| Parameter                | Type      | Required | Default | Description                 |
| ------------------------ | --------- | -------- | ------- | --------------------------- |
| `options`                | `object`  | No       | `{}`    | Reset options               |
| `options.resetDeviceId`  | `boolean` | No       | `false` | Whether to reset device ID  |

**Example:**

```javascript
// Reset everything except device_id
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

| Property          | Type                                          | Default                       | Description                                            |
| ----------------- | --------------------------------------------- | ----------------------------- | ------------------------------------------------------ |
| `baseUrl`         | `string`                                      | `"https://api.altertable.ai"` | The base URL of the Altertable API                     |
| `environment`     | `string`                                      | `"production"`                | The environment of the application                     |
| `autoCapture`     | `boolean`                                     | `true`                        | Whether to automatically capture page views and events |
| `release`         | `string`                                      | -                             | The release ID of the application                      |
| `debug`           | `boolean`                                     | `false`                       | Whether to log events to the console                   |
| `persistence`     | [`StorageType`](#storagetype)                 | `"localStorage+cookie"`       | The persistence strategy for storing IDs               |
| `trackingConsent` | [`TrackingConsentType`](#trackingconsenttype) | `"granted"`                   | The tracking consent state                             |

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
