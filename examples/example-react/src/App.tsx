import { altertable } from '@altertable/altertable-js';
import { AltertableProvider } from '@altertable/altertable-react';
import {
  ConsentManagerDialog,
  ConsentManagerProvider,
  CookieBanner,
  useConsentManager,
} from '@c15t/react';
import { CreditCard, Mail, Sparkles, User } from 'lucide-react';
import { ComponentProps, useSyncExternalStore } from 'react';

import { SignupFunnel } from './SignupFunnel';

altertable.init(import.meta.env.VITE_ALTERTABLE_API_KEY!, {
  baseUrl: import.meta.env.VITE_ALTERTABLE_BASE_URL!,
  environment: import.meta.env.MODE!,
  debug: true,
});

const STEPS = [
  { id: 1, title: 'Personal Info', icon: User },
  { id: 2, title: 'Account Setup', icon: Mail },
  { id: 3, title: 'Choose Plan', icon: CreditCard },
  { id: 4, title: 'Welcome!', icon: Sparkles },
] as const;

const urlStore = createURLStore();

export function App() {
  const currentStep = useSyncExternalStore(
    urlStore.subscribe,
    urlStore.getSnapshot,
    () => 1
  );

  return (
    <AltertableProvider client={altertable}>
      <ConsentProvider>
        <SignupFunnel
          steps={STEPS}
          currentStep={currentStep}
          onStepChange={urlStore.updateStep}
        />
        <div className="text-sm absolute bottom-8 left-8">
          <CookieSettingsTrigger className="text-slate-500 hover:text-slate-700 underline">
            Cookie Settings
          </CookieSettingsTrigger>
        </div>
      </ConsentProvider>
    </AltertableProvider>
  );
}

type CookieSettingsTriggerProps = ComponentProps<'button'> & {
  children: React.ReactNode;
};

function CookieSettingsTrigger({
  children,
  ...props
}: CookieSettingsTriggerProps) {
  const { setShowPopup } = useConsentManager();

  return (
    <button
      {...props}
      onClick={event => {
        setShowPopup(true, true);
        props.onClick?.(event);
      }}
    >
      {children}
    </button>
  );
}

function ConsentProvider({ children }: { children: React.ReactNode }) {
  return (
    <ConsentManagerProvider
      options={{
        mode: 'offline',
        callbacks: {
          onConsentSet: ({ data }) => {
            if (data?.preferences.measurement) {
              // TODO: Enable tracking
            } else {
              // TODO: Disable tracking
            }
          },
        },
      }}
    >
      {children}
      <CookieBanner />
      <ConsentManagerDialog />
    </ConsentManagerProvider>
  );
}

function createURLStore() {
  let listeners: (() => void)[] = [];

  function subscribe(listener: () => void) {
    listeners.push(listener);
    return () => {
      listeners = listeners.filter(l => l !== listener);
    };
  }

  function getSnapshot() {
    const urlParams = new URLSearchParams(window.location.search);
    const stepParam = urlParams.get('step');
    if (stepParam) {
      const step = parseInt(stepParam, 10);
      if (step >= 1 && step <= STEPS.length) {
        return step;
      }
    }
    return 1;
  }

  function updateStep(step: number) {
    const url = new URL(window.location.href);
    url.searchParams.set('step', step.toString());

    window.history.replaceState({}, '', url.toString());
    listeners.forEach(listener => listener());
  }

  return { subscribe, getSnapshot, updateStep };
}
