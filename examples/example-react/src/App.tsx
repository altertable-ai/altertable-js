import { altertable } from '@altertable/altertable-js';
import {
  AltertableProvider,
  useAltertable,
} from '@altertable/altertable-react';
import { useState } from 'react';

altertable.init(import.meta.env.VITE_ALTERTABLE_API_KEY, {
  baseUrl: import.meta.env.VITE_ALTERTABLE_BASE_URL,
  environment: import.meta.env.MODE,
});

export function App() {
  return (
    <AltertableProvider client={altertable}>
      <ExampleComponent />
    </AltertableProvider>
  );
}

type ExampleFunnelMapping = {
  signup: readonly [
    { name: 'signup_started'; properties: { source?: string } },
    { name: 'signup_completed'; properties: { email: string; plan?: string } },
    { name: 'signup_failed'; properties: { error: string } },
  ];
  purchase: readonly [
    { name: 'purchase_started'; properties: { product_id: string } },
    {
      name: 'purchase_completed';
      properties: { product_id: string; amount: number; currency: string };
    },
    {
      name: 'purchase_cancelled';
      properties: { product_id: string; reason?: string };
    },
  ];
};

function ExampleComponent() {
  const { useFunnel, identify } = useAltertable<ExampleFunnelMapping>();
  const [userEmail, setUserEmail] = useState('');
  const [productId, setProductId] = useState('product-123');
  const [amount, setAmount] = useState(99.99);

  // Create funnel-specific tracking functions
  const signupFunnel = useFunnel('signup');
  const purchaseFunnel = useFunnel('purchase');

  const handleSignupStart = () => {
    signupFunnel.track('signup_started', { source: 'example-app' });
  };

  const handleSignupComplete = () => {
    if (userEmail) {
      signupFunnel.track('signup_completed', {
        email: userEmail,
        plan: 'premium',
      });
      identify(userEmail);
    }
  };

  const handleSignupFail = () => {
    signupFunnel.track('signup_failed', { error: 'Invalid email' });
  };

  const handlePurchaseStart = () => {
    purchaseFunnel.track('purchase_started', { product_id: productId });
  };

  const handlePurchaseComplete = () => {
    purchaseFunnel.track('purchase_completed', {
      product_id: productId,
      amount,
      currency: 'USD',
    });
  };

  const handlePurchaseCancel = () => {
    purchaseFunnel.track('purchase_cancelled', {
      product_id: productId,
      reason: 'User cancelled',
    });
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
      <h1>Altertable React Example</h1>

      <section style={{ marginBottom: '2rem' }}>
        <h2>Signup Funnel</h2>
        <div style={{ marginBottom: '1rem' }}>
          <input
            type="email"
            placeholder="Enter email"
            value={userEmail}
            onChange={event => setUserEmail(event.target.value)}
            style={{
              padding: '0.5rem',
              marginRight: '0.5rem',
              borderRadius: '4px',
              border: '1px solid #ccc',
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button onClick={handleSignupStart}>Start Signup</button>
          <button onClick={handleSignupComplete}>Complete Signup</button>
          <button onClick={handleSignupFail}>Fail Signup</button>
        </div>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2>Purchase Funnel</h2>
        <div style={{ marginBottom: '1rem' }}>
          <input
            type="text"
            placeholder="Product ID"
            value={productId}
            onChange={event => setProductId(event.target.value)}
            style={{
              padding: '0.5rem',
              marginRight: '0.5rem',
              borderRadius: '4px',
              border: '1px solid #ccc',
            }}
          />
          <input
            type="number"
            placeholder="Amount"
            value={amount}
            onChange={event => setAmount(Number(event.target.value))}
            style={{
              padding: '0.5rem',
              borderRadius: '4px',
              border: '1px solid #ccc',
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button onClick={handlePurchaseStart}>Start Purchase</button>
          <button onClick={handlePurchaseComplete}>Complete Purchase</button>
          <button onClick={handlePurchaseCancel}>Cancel Purchase</button>
        </div>
      </section>

      <section>
        <h2>Instructions</h2>
        <p>This example demonstrates how to use altertable-react with:</p>
        <ul>
          <li>Type-safe funnel tracking with predefined step mappings</li>
          <li>User identification</li>
          <li>Funnel-specific tracking functions</li>
        </ul>
        <p>
          <strong>Note:</strong> Make sure to configure your API key and
          endpoint in the altertable client initialization.
        </p>
      </section>
    </div>
  );
}
