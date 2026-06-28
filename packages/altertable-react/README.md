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
    track('Signup Started', { source: 'homepage' });
  }

  function handleSubmit(email: string) {
    track('Signup Submitted', { email });
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
- **Session management** – Handles anonymous and session IDs automatically
- **Event queuing** – Queues events when offline or consent is pending
- **Privacy compliance** – Built-in tracking consent management
- **Multiple storage options** – localStorage, cookies, or both
- **Type-safe funnel tracking** – Define funnel steps with TypeScript for compile-time safety
- **React view tracking** – Track screen and component views without Strict Mode duplicates
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

| Property             | Type                                                             | Description                                                                                    |
| -------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `identify`           | `(userId: string, traits?: UserTraits) => void`                  | Identify a user                                                                                |
| `page`               | `(url: string) => void`                                          | Manually track a page view (use only when `autoCapture` is false)                              |
| `reset`              | `(options?: { resetDeviceId?: boolean }) => void`                | Resets the current identity context so future events are not associated with the previous user |
| `alias`              | `(newUserId: string) => void`                                    | Link a new ID to the current identity                                                          |
| `updateTraits`       | `(traits: UserTraits) => void`                                   | Update user traits                                                                             |
| `configure`          | `(updates: Partial<AltertableConfig>) => void`                   | Update configuration                                                                           |
| `getTrackingConsent` | `() => TrackingConsentType`                                      | Get current consent state                                                                      |
| `selectFunnel`       | `(funnelName: keyof TFunnelMapping) => { track: FunnelTracker }` | Get funnel-specific tracker                                                                    |

**Example:**

```tsx
function MyComponent() {
  const { track, identify, selectFunnel } = useAltertable<MyFunnelMapping>();

  function handleClick() {
    track('Button Clicked', { button: 'signup' });
  }

  function handleLogin(userId: string) {
    identify(userId, { email: 'user@example.com' });
  }

  return <button onClick={handleClick}>Click me</button>;
}
```

> [!NOTE]
>
> **Page Tracking**: By default, Altertable automatically captures page views. Only use `page()` when you've disabled auto-capture:
>
> ```tsx
> // Initialize with auto-capture disabled
> altertable.init('YOUR_API_KEY', { autoCapture: false });
>
> function MyComponent() {
>   const { page } = useAltertable();
>
>   // Now you must manually track page views
>   function handleNavigation(nextUrl: string) {
>     page(nextUrl);
>   }
> }
> ```
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

#### `selectFunnel(funnelName)`

Returns a type-safe tracker for a specific funnel.

**Parameters:**

| Parameter    | Type                   | Required | Description                     |
| ------------ | ---------------------- | -------- | ------------------------------- |
| `funnelName` | `keyof TFunnelMapping` | Yes      | The name of the funnel to track |

**Returns:**

| Property    | Type                                                                    | Description                   |
| ----------- | ----------------------------------------------------------------------- | ----------------------------- |
| `trackStep` | `(stepName: FunnelStepName, properties?: FunnelStepProperties) => void` | Type-safe funnel step tracker |

**Example:**

```tsx
import {
  type FunnelMapping,
  useAltertable,
} from '@altertable/altertable-react';

interface SignupFunnelMapping extends FunnelMapping {
  signup: [
    { name: 'Signup Started'; properties: { source: string } },
    { name: 'Signup Completed'; properties: { userId: string } },
  ];
}

function SignupPage() {
  const { selectFunnel } = useAltertable<SignupFunnelMapping>();
  const { trackStep } = selectFunnel('signup');

  function handleStart() {
    trackStep('Signup Started', { source: 'homepage' });
  }

  function handleComplete(userId: string) {
    trackStep('Signup Completed', { userId });
  }

  return (
    <div>
      <button
        onClick={() => {
          handleStart();
        }}
      >
        Start
      </button>
      <button
        onClick={() => {
          handleComplete('u_01jza857w4f23s1hf2s61befmw');
        }}
      >
        Complete
      </button>
    </div>
  );
}
```

#### `useScreenView(name, options?)`

Tracks a screen view when the component mounts.

Sends a `$screen` event with `$view_name`, `$view_type`, and `$view_id` when an `id` is provided.

Use this hook for virtual screens that are not already represented by a page URL, such as app tabs, modal routes, embedded flows, or entity-specific screens. For full-page navigation, prefer Altertable's automatic pageview capture, which is enabled by default in the core SDK.

**Example:**

```tsx
import { useScreenView } from '@altertable/altertable-react';

function DashboardScreen({ dashboard }: { dashboard: Dashboard }) {
  useScreenView('Dashboard', {
    id: dashboard.id,
    properties: { dashboardId: dashboard.id },
  });

  return <DashboardBody />;
}
```

The hook sends once per screen identity. Properties are captured from the first render where tracking is eligible; later property changes for the same `name` and `id` do not send another event. The hook also prevents React Strict Mode effect replay from sending duplicate screen events in development.

**Options:**

| Property     | Type                      | Description                                                                 |
| ------------ | ------------------------- | --------------------------------------------------------------------------- |
| `id`         | `string`                  | Stable identifier for this screen instance within `name`. Use when multiple screens share the same name — typically the entity id, e.g. `id: dashboard.id` for each dashboard using the screen name `Dashboard`. |
| `properties` | `Record<string, unknown>` | Additional properties to include with the screen event.                     |
| `disabled`   | `boolean`                 | Prevents the screen event from being sent.                                  |

#### `useView(name, options?)`

Tracks a view when the referenced element becomes visible.

Returns `{ viewRef }`, a callback ref to attach to the root element of the view to track.

Sends a `$view` event with `$view_name`, `$view_type`, and `$view_id` when an `id` is provided.

Use this hook for meaningful parts of a screen, such as cards, sections, dashboard insights, or embedded panels. It is not a replacement for full-page pageview capture.

**Example:**

```tsx
import { useView } from '@altertable/altertable-react';

function InsightCard({ insight }: { insight: Insight }) {
  const { viewRef } = useView<HTMLDivElement>('Insight', {
    id: insight.id,
    properties: { insightId: insight.id, kind: insight.kind },
  });

  return <div ref={viewRef}>{insight.title}</div>;
}
```

The hook sends once per view identity when the element becomes visible. Properties are captured from the latest render before the first visible event; later property changes for the same `name` and `id` do not send another event. The hook also prevents React Strict Mode effect replay from sending duplicate view events in development.

**Options:**

| Property                | Type                        | Description                                                                                                                                                                                                                                                                 |
| ----------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                    | `string`                    | Stable identifier for this view instance within `name`. Use when multiple views share the same name — typically the entity id, e.g. `id: insight.id` for each insight card using the view name `Insight`.                                                                                                                                  |
| `properties`            | `Record<string, unknown>`   | Additional properties to include with the view event.                                                                                                                                                                                                                       |
| `disabled`              | `boolean`                   | Prevents the view event from being sent.                                                                                                                                                                                                                                    |
| `visibility`            | `ViewVisibilityOptions`     | Visibility settings for the underlying [`IntersectionObserver`](https://developer.mozilla.org/docs/Web/API/IntersectionObserver).                                                                                                                                           |
| `visibility.root`       | `Element \| Document \| null` | The element used as the viewport for checking visibility of the target. Defaults to `null`. See [`IntersectionObserver`: `root`](https://developer.mozilla.org/docs/Web/API/IntersectionObserver/IntersectionObserver#root).                                              |
| `visibility.rootMargin` | `string`                    | Offsets applied to the root's bounding box before intersection tests, using the same syntax as the CSS `margin` property. See [`IntersectionObserver`: `rootMargin`](https://developer.mozilla.org/docs/Web/API/IntersectionObserver/IntersectionObserver#rootmargin).   |
| `visibility.threshold`  | `number \| number[]`        | One or more visibility ratios at which the observer callback runs. A value of `0` fires when any pixel becomes visible; `1.0` fires when the target is fully visible. Defaults to `0`. See [`IntersectionObserver`: `threshold`](https://developer.mozilla.org/docs/Web/API/IntersectionObserver/IntersectionObserver#threshold). |

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

interface MyFunnelMapping extends FunnelMapping {
  signup: [
    {
      name: 'Signup Started';
      properties: { source: string };
    },
    {
      name: 'Signup Completed';
      properties: { userId: string };
    },
  ];
  checkout: [
    {
      name: 'Cart Viewed';
      properties: { itemCount: number };
    },
    {
      name: 'Purchase Completed';
      properties: { orderId: string; amount: number };
    },
  ];
}
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
  trackStep: (
    stepName: FunnelStepName,
    properties?: FunnelStepProperties
  ) => void;
};
```

## License

[MIT](./LICENSE)
