const DEMO_SUBSCRIPTION_KEY = 'stripe_meter_demo_subscription_active';
const DEMO_SELECTED_PRICE_KEY = 'stripe_meter_demo_selected_price_id';

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
  window.localStorage.removeItem(DEMO_SELECTED_PRICE_KEY);
}

export function setDemoSelectedPriceId(priceId: string) {
  if (typeof window === 'undefined') {
    return;
  }

  const normalized = priceId.trim();
  if (!normalized) {
    return;
  }

  window.localStorage.setItem(DEMO_SELECTED_PRICE_KEY, normalized);
}

export function getDemoSelectedPriceId() {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage.getItem(DEMO_SELECTED_PRICE_KEY);
}
