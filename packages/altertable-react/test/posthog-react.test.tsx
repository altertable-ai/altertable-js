import { PostHogProvider, usePostHog } from '@posthog/react';

import { testPostHogProvider } from './posthog-provider-suite';

testPostHogProvider(PostHogProvider, usePostHog);
