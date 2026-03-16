export type BurnEvent = {
  id: string;
  units: number;
  createdAt: string;
};

const BURN_HISTORY_KEY = 'stripe_meter_demo_burn_history';
const BURN_HISTORY_LIMIT = 25;

export function getBurnHistory(): BurnEvent[] {
  if (typeof window === 'undefined') {
    return [];
  }

  const raw = window.localStorage.getItem(BURN_HISTORY_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as BurnEvent[];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed;
  } catch {
    return [];
  }
}

export function appendBurnEvent(units: number): BurnEvent[] {
  if (typeof window === 'undefined') {
    return [];
  }

  const event: BurnEvent = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    units,
    createdAt: new Date().toISOString(),
  };

  const next = [event, ...getBurnHistory()].slice(0, BURN_HISTORY_LIMIT);
  window.localStorage.setItem(BURN_HISTORY_KEY, JSON.stringify(next));
  return next;
}

export function clearBurnHistory() {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(BURN_HISTORY_KEY);
}
