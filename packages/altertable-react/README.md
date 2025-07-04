# @altertable/altertable-react

React SDK for capturing and sending analytics events to Altertable with type-safe funnel tracking.

## Installation

```bash
npm install @altertable/altertable-js @altertable/altertable-react
# or
pnpm add @altertable/altertable-js @altertable/altertable-react
# or
yarn add @altertable/altertable-js @altertable/altertable-react
# or
bun add @altertable/altertable-js @altertable/altertable-react
```

## Quick Start

```tsx
import {
  AltertableProvider,
  useAltertable,
} from '@altertable/altertable-react';
import { altertable } from '@altertable/altertable-js';

// Initialize the core SDK
altertable.init('YOUR_API_KEY');

function App() {
  return (
    <AltertableProvider client={altertable}>
      <SignupPage />
    </AltertableProvider>
  );
}

function SignupPage() {
  const { track } = useAltertable();

  function handleStart() {
    track('signup_started', { source: 'homepage' });
  }

  function handleSubmit(email: string) {
    track('signup_submitted', { email });
  }

  return (
    <div>
      <button onClick={() => handleStart()}>Start Signup</button>
      <button onClick={() => handleSubmit('john.doe@example.com')}>
        Submit
      </button>
    </div>
  );
}
```

> [!NOTE]
>
> For **server-side rendering** (SSR), initialize in a [`useEffect()`](https://react.dev/reference/react/useEffect):
>
> ```tsx
> import { useEffect } from 'react';
> import { altertable } from '@altertable/altertable-js';
> import { AltertableProvider } from '@altertable/altertable-react';
>
> function App() {
>   useEffect(() => {
>     altertable.init('YOUR_API_KEY');
>   }, []);
>
>   return (
>     <AltertableProvider client={altertable}>
>       <SignupPage />
>     </AltertableProvider>
>   );
> }
> ```

## Features

- **Automatic page view tracking** – Captures page views automatically
- **Session management** – Handles visitor and session IDs automatically
- **Event queuing** – Queues events when offline or consent is pending
- **Privacy compliance** – Built-in tracking consent management
- **Multiple storage options** – localStorage, cookies, or both
- **Type-safe funnel tracking** – Define funnel steps with TypeScript for compile-time safety
- **React Hooks** – Easy-to-use Hooks for tracking events and managing funnels
- **Context provider** – Share Altertable instance across your React component tree
- **Zero dependencies** – Only depends on React and the core Altertable SDK

## API Reference

### Components

#### `<AltertableProvider>`

Provides the Altertable client to the React component tree.

**Props:**

| Parameter  | Type                                                                                                                    | Required | Description                                                                                                                                                            |
| ---------- | ----------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `client`   | [`Altertable`](https://github.com/altertable-ai/altertable-js/blob/main/packages/altertable-js/README.md#api-reference) | Yes      | The Altertable client instance (see core SDK [API Reference](https://github.com/altertable-ai/altertable-js/blob/main/packages/altertable-js/README.md#api-reference)) |
| `children` | `ReactNode`                                                                                                             | Yes      | React children                                                                                                                                                         |

**Example:**

```tsx
import { AltertableProvider } from '@altertable/altertable-react';
import { altertable } from '@altertable/altertable-js';

altertable.init('YOUR_API_KEY');

function App() {
  return (
    <AltertableProvider client={altertable}>
      <YourApp />
    </AltertableProvider>
  );
}
```

### Hooks

#### `useAltertable<TFunnelMapping>()`

Returns an object with tracking methods and funnel utilities.

**Type Parameters:**

| Parameter        | Type                              | Required | Description                                            |
| ---------------- | --------------------------------- | -------- | ------------------------------------------------------ |
| `TFunnelMapping` | [`FunnelMapping`](#funnelmapping) | No       | Type mapping of funnel names to their step definitions |

**Returns:**

| Property             | Type                                                             | Description                 |
| -------------------- | ---------------------------------------------------------------- | --------------------------- |
| `track`              | `(event: string, properties?: EventProperties) => void`          | Track a custom event        |
| `identify`           | `(userId: string, traits?: UserTraits) => void`                  | Identify a user             |
| `updateTraits`       | `(traits: UserTraits) => void`                                   | Update user traits          |
| `configure`          | `(updates: Partial<AltertableConfig>) => void`                   | Update configuration        |
| `getTrackingConsent` | `() => TrackingConsentType`                                      | Get current consent state   |
| `useFunnel`          | `(funnelName: keyof TFunnelMapping) => { track: FunnelTracker }` | Get funnel-specific tracker |

**Example:**

```tsx
function MyComponent() {
  const { track, identify, useFunnel } = useAltertable<MyFunnelMapping>();

  function handleClick() {
    track('button_clicked', { button: 'signup' });
  }

  function handleLogin(userId: string) {
    identify(userId, { email: 'user@example.com' });
  }

  return <button onClick={handleClick}>Click me</button>;
}
```

#### `useFunnel(funnelName)`

Returns a type-safe tracker for a specific funnel.

**Parameters:**

| Parameter    | Type                   | Required | Description                     |
| ------------ | ---------------------- | -------- | ------------------------------- |
| `funnelName` | `keyof TFunnelMapping` | Yes      | The name of the funnel to track |

**Returns:**

| Property | Type                                                                    | Description                   |
| -------- | ----------------------------------------------------------------------- | ----------------------------- |
| `track`  | `(stepName: FunnelStepName, properties?: FunnelStepProperties) => void` | Type-safe funnel step tracker |

**Example:**

```tsx
type SignupFunnelMapping = {
  signup: [
    { name: 'signup_started'; properties: { source: string } },
    { name: 'signup_completed'; properties: { userId: string } },
  ];
};

function SignupPage() {
  const { useFunnel } = useAltertable<SignupFunnelMapping>();
  const { track } = useFunnel('signup');

  function handleStart() {
    track('signup_started', { source: 'homepage' });
  }

  function handleComplete(userId: string) {
    track('signup_completed', { userId });
  }

  return (
    <div>
      <button onClick={() => handleStart()}>Start</button>
      <button onClick={() => handleComplete('user123')}>Complete</button>
    </div>
  );
}
```

## Types

### `AltertableConfig`

Configuration options for the Altertable SDK. See the [core SDK documentation](https://github.com/altertable-ai/altertable-js/blob/main/packages/altertable-js/README.md#altertableconfig) for full details.

### `FunnelMapping`

Type mapping of funnel names to their step definitions.

```typescript
type FunnelMapping = Record<FunnelName, readonly FunnelStep[]>;
```

**Example:**

```typescript
import { type FunnelMapping } from '@altertable/altertable-react';

type MyFunnelMapping = {
  signup: [
    { name: 'signup_started'; properties: { source: string } },
    { name: 'signup_completed'; properties: { userId: string } },
  ];
  checkout: [
    { name: 'cart_viewed'; properties: { itemCount: number } },
    {
      name: 'purchase_completed';
      properties: { orderId: string; amount: number };
    },
  ];
} as const satisfies FunnelMapping;
```

### `FunnelStep`

Definition of a single funnel step.

```typescript
type FunnelStep = {
  name: string;
  properties?: FunnelStepProperties;
};
```

| Property     | Type                   | Required | Description                       |
| ------------ | ---------------------- | -------- | --------------------------------- |
| `name`       | `string`               | Yes      | The name of the funnel step       |
| `properties` | `FunnelStepProperties` | No       | Expected properties for this step |

### `FunnelTracker`

Type-safe tracker for a specific funnel.

```typescript
type FunnelTracker = {
  track: (stepName: FunnelStepName, properties?: FunnelStepProperties) => void;
};
```

## License

[MIT](./LICENSE)
