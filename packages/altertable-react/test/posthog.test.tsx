import { PostHogProvider, usePostHog } from 'posthog-js/react';

import { testPostHogProvider } from './posthog-provider-suite';

testPostHogProvider(PostHogProvider, usePostHog);
