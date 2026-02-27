const DEMO_SUBSCRIPTION_KEY = 'stripe_meter_demo_subscription_active';

export function setDemoSubscriptionActive(isActive: boolean) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(DEMO_SUBSCRIPTION_KEY, isActive ? '1' : '0');
}

export function getDemoSubscriptionActive() {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.localStorage.getItem(DEMO_SUBSCRIPTION_KEY) === '1';
}

export function clearDemoSubscription() {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(DEMO_SUBSCRIPTION_KEY);
}
