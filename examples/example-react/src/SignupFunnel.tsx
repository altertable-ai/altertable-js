import {
  type FunnelMapping,
  useAltertable,
} from '@altertable/altertable-react';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';

import { cx } from './cx';

type Plan = 'starter' | 'pro' | 'enterprise';

type FormData = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
  plan: Plan;
  agreeToTerms: boolean;
};

type FormErrors = Partial<Record<keyof FormData, string>>;

const SIGNUP_FUNNEL_MAPPING = {
  signup: [
    { name: 'step_viewed', properties: { step: 1 } },
    { name: 'step_viewed', properties: { step: 2 } },
    { name: 'step_viewed', properties: { step: 3 } },
    { name: 'step_viewed', properties: { step: 4 } },
    { name: 'step_completed', properties: { step: 1 } },
    { name: 'step_completed', properties: { step: 2 } },
    { name: 'step_completed', properties: { step: 3 } },
    { name: 'form_submitted' },
    { name: 'plan_selected', properties: { plan: 'starter' as const } },
    { name: 'plan_selected', properties: { plan: 'pro' as const } },
    { name: 'plan_selected', properties: { plan: 'enterprise' as const } },
    { name: 'form_restarted' },
    { name: 'get_started_clicked' },
  ],
} as const satisfies FunnelMapping;

const DEFAULT_FORM_DATA: FormData = {
  firstName: 'John',
  lastName: 'Doe',
  email: 'john.doe@example.com',
  password: 'password',
  confirmPassword: 'password',
  plan: 'starter',
  agreeToTerms: false,
};

const MIN_PASSWORD_LENGTH = 8;

const PLAN_PRICES: Record<Plan, { price: number; description: string }> = {
  starter: { price: 9, description: 'Perfect for individuals' },
  pro: { price: 29, description: 'Best for small teams' },
  enterprise: { price: 99, description: 'For large organizations' },
};

type SignupFunnelProps = {
  steps: readonly { id: number; title: string; icon: React.ElementType }[];
  onStepChange: (step: number) => void;
  currentStep: number;
};

export function SignupFunnel({
  steps,
  onStepChange,
  currentStep,
}: SignupFunnelProps) {
  const [formData, setFormData] = useState<FormData>(DEFAULT_FORM_DATA);
  const [errors, setErrors] = useState<FormErrors>({});
  const isLastStep = currentStep === steps.length - 1;
  const isSubmitted = currentStep === steps.length;

  const { useFunnel } = useAltertable<typeof SIGNUP_FUNNEL_MAPPING>();
  const { track } = useFunnel('signup');

  function validateStep(step: number): boolean {
    const newErrors: FormErrors = {};

    switch (step) {
      case 1: {
        if (!formData.firstName.trim()) {
          newErrors.firstName = 'First name is required';
        }
        if (!formData.lastName.trim()) {
          newErrors.lastName = 'Last name is required';
        }
        break;
      }
      case 2: {
        if (!formData.email.trim()) {
          newErrors.email = 'Email is required';
        } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
          newErrors.email = 'Email is invalid';
        }

        if (!formData.password) {
          newErrors.password = 'Password is required';
        } else if (formData.password.length < MIN_PASSWORD_LENGTH) {
          newErrors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
        }

        if (formData.password !== formData.confirmPassword) {
          newErrors.confirmPassword = 'Passwords do not match';
        }
        break;
      }
      case 3: {
        if (!formData.agreeToTerms) {
          newErrors.agreeToTerms = 'You must agree to the terms';
        }
        break;
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function nextStep() {
    if (validateStep(currentStep)) {
      track('step_completed', { step: currentStep });

      onStepChange(Math.min(currentStep + 1, steps.length));
    }
  }

  function prevStep() {
    onStepChange(Math.max(currentStep - 1, 1));
  }

  function updateFormData(field: keyof FormData, value: string | boolean) {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  }

  function handleSubmit() {
    if (validateStep(3)) {
      track('form_submitted');

      onStepChange(4);
    }
  }

  function handleInputChange(field: keyof FormData) {
    return (event: React.ChangeEvent<HTMLInputElement>) => {
      const value =
        event.target.type === 'checkbox'
          ? event.target.checked
          : event.target.value;
      updateFormData(field, value);
    };
  }

  function handlePlanSelect(plan: Plan) {
    return () => {
      track('plan_selected', { plan });

      updateFormData('plan', plan);
    };
  }

  function handleRestart() {
    track('form_restarted');

    onStepChange(1);
    setFormData(DEFAULT_FORM_DATA);
    setErrors({});
  }

  function handleGetStarted() {
    track('get_started_clicked');
  }

  function renderStep() {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-gray-900 mb-2">
                Let's get started
              </h2>
              <p className="text-gray-600">Tell us a bit about yourself</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  First Name
                </label>
                <input
                  type="text"
                  value={formData.firstName}
                  onChange={handleInputChange('firstName')}
                  className={cx(
                    'w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent',
                    errors.firstName ? 'border-red-500' : 'border-gray-300'
                  )}
                  placeholder="Enter your first name"
                />
                {errors.firstName && (
                  <p className="text-red-500 text-sm mt-1">
                    {errors.firstName}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Last Name
                </label>
                <input
                  type="text"
                  value={formData.lastName}
                  onChange={handleInputChange('lastName')}
                  className={cx(
                    'w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent',
                    errors.lastName ? 'border-red-500' : 'border-gray-300'
                  )}
                  placeholder="Enter your last name"
                />
                {errors.lastName && (
                  <p className="text-red-500 text-sm mt-1">{errors.lastName}</p>
                )}
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-gray-900 mb-2">
                Create your account
              </h2>
              <p className="text-gray-600">Set up your login credentials</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={handleInputChange('email')}
                  className={cx(
                    'w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent',
                    errors.email ? 'border-red-500' : 'border-gray-300'
                  )}
                  placeholder="Enter your email"
                />
                {errors.email && (
                  <p className="text-red-500 text-sm mt-1">{errors.email}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={handleInputChange('password')}
                  className={cx(
                    'w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent',
                    errors.password ? 'border-red-500' : 'border-gray-300'
                  )}
                  placeholder="Create a password"
                />
                {errors.password && (
                  <p className="text-red-500 text-sm mt-1">{errors.password}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={formData.confirmPassword}
                  onChange={handleInputChange('confirmPassword')}
                  className={cx(
                    'w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent',
                    errors.confirmPassword
                      ? 'border-red-500'
                      : 'border-gray-300'
                  )}
                  placeholder="Confirm your password"
                />
                {errors.confirmPassword && (
                  <p className="text-red-500 text-sm mt-1">
                    {errors.confirmPassword}
                  </p>
                )}
              </div>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-gray-900 mb-2">
                Choose your plan
              </h2>
              <p className="text-gray-600">
                Select the plan that works best for you
              </p>
            </div>

            <div className="space-y-3">
              {Object.entries(PLAN_PRICES).map(([planKey, planData]) => {
                const plan = planKey as Plan;
                return (
                  <div
                    key={plan}
                    className={cx(
                      'p-4 border-1 rounded-lg cursor-pointer',
                      formData.plan === plan
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    )}
                    onClick={handlePlanSelect(plan)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-semibold">
                          {plan.charAt(0).toUpperCase() + plan.slice(1)} Plan
                        </h3>
                        <p className="text-gray-600">{planData.description}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold">${planData.price}</p>
                        <p className="text-gray-500">/month</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="terms"
                checked={formData.agreeToTerms}
                onChange={handleInputChange('agreeToTerms')}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <label htmlFor="terms" className="text-sm text-gray-700">
                I agree to the{' '}
                <a href="#" className="text-blue-600 hover:underline">
                  Terms of Service
                </a>{' '}
                and{' '}
                <a href="#" className="text-blue-600 hover:underline">
                  Privacy Policy
                </a>
              </label>
            </div>
            {errors.agreeToTerms && (
              <p className="text-red-500 text-sm">{errors.agreeToTerms}</p>
            )}
          </div>
        );

      case 4:
        return (
          <div className="text-center space-y-6">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Check className="w-10 h-10 text-green-600" />
            </div>

            <div>
              <h2 className="text-3xl font-bold text-gray-900 mb-2">
                Welcome aboard!
              </h2>
              <p className="text-gray-600 mb-6">
                Thanks {formData.firstName}, your account has been created
                successfully.
              </p>
            </div>

            <div className="bg-gray-50 rounded-lg p-6 text-left">
              <h3 className="font-semibold text-gray-900 mb-2">
                Account Summary:
              </h3>
              <p className="text-gray-600">
                Name: {formData.firstName} {formData.lastName}
              </p>
              <p className="text-gray-600">Email: {formData.email}</p>
              <p className="text-gray-600">
                Plan:{' '}
                {formData.plan.charAt(0).toUpperCase() + formData.plan.slice(1)}
              </p>
            </div>

            <button
              onClick={handleGetStarted}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700"
            >
              Get Started
            </button>
          </div>
        );

      default:
        return null;
    }
  }

  return (
    <div className="min-h-screen flex justify-center px-4 py-8 md:px-8">
      <div className="w-full max-w-md">
        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex items-center justify-center mb-4">
            {steps.map((step, index) => {
              const Icon = step.icon;
              const isCompleted = currentStep > step.id;
              const isCurrent = currentStep === step.id;

              return (
                <div key={step.id} className="flex items-center">
                  <div
                    className={cx(
                      'w-10 h-10 relative rounded-full flex items-center justify-center',
                      isCurrent
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-400'
                    )}
                  >
                    <Icon className="w-5 h-5" />
                    {isCompleted && (
                      <Check className="absolute rounded-full -top-1 -right-1 size-4 bg-green-500 ring-2 ring-gray-50 white text-white border-2 border-green-500" />
                    )}
                  </div>
                  {index < steps.length - 1 && (
                    <div className="w-12 h-1 mx-2 bg-gray-200" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Form Container */}
        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-gray-200 p-8">
          {renderStep()}

          {/* Navigation Buttons */}
          {!isSubmitted && (
            <div
              className={cx(
                'flex mt-8',
                currentStep === 1 ? 'justify-end' : 'justify-between'
              )}
            >
              {currentStep > 1 && (
                <button
                  onClick={prevStep}
                  className={cx(
                    'flex items-center px-4 py-2 rounded-lg font-medium',
                    currentStep === 1
                      ? 'text-gray-400 cursor-not-allowed'
                      : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                  )}
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Back
                </button>
              )}

              <button
                onClick={isLastStep ? handleSubmit : nextStep}
                className="flex items-center bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700"
              >
                {isLastStep ? 'Complete Signup' : 'Continue'}
                <ChevronRight className="w-4 h-4 ml-1" />
              </button>
            </div>
          )}
        </div>
        {isSubmitted && (
          <div className="w-full max-w-md text-center text-sm text-gray-500 mt-4">
            <button
              onClick={handleRestart}
              className="text-blue-600 hover:text-blue-700 underline"
            >
              Restart
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
