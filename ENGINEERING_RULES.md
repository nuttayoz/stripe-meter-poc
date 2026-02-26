# Engineering Rules

## 1) Architecture Rules

- System shape: **Modular Monolith** (single NestJS deployable).
- Internal style: **hexagonal-lite** for critical modules (`auth`, `billing`, `usage`, `webhook`).
- Required backend layering:
  - `Controller` (transport only)
  - `Service/UseCase` (business logic)
  - `Repository/Port` (data and external integrations)
- Stripe integration must be behind a port/adapter boundary (`BillingGateway`).

## 2) Frontend Rules (Next.js + React Query)

- Frontend server state uses **React Query** as default.
- Next.js app calls NestJS API directly in v1 (no Next.js API routes by default).
- Next.js API routes are allowed only for explicit BFF cases:
  - same-domain cookie/session proxy,
  - edge-side composition, or
  - backend endpoint shielding requirements.
- UI-only state (modal open, tab selection, local form steps) stays in component/local state.

## 3) Security Rules (Mandatory)

- Never expose secrets or private values in frontend code, public env, logs, or responses.
- Only truly public values may use `NEXT_PUBLIC_*`.
- Stripe secret keys and webhook secrets stay backend-only.
- Refresh tokens must use `HttpOnly + Secure + SameSite` cookies.
- Add secret scanning in CI and block commits on leaks.
- Do not trust client-calculated amounts, tax, status, or entitlements.

## 4) Billing Rules

- One Stripe customer per organization (`stripe_customer_id` unique).
- `PLAN_A` (base + overage): Stripe-native aggregation/invoicing.
- `PLAN_B` (max member usage): app computes monthly peak, Stripe invoices on emitted peak snapshots.
- All billing operations must be idempotent (checkout, usage emit, webhook consume).
- Stripe webhooks are source of truth for payment/subscription lifecycle.

## 5) Data and Reliability Rules

- Store money as integer minor units (for example cents), never float.
- Use UTC timestamps only.
- Do not hard-delete financial history.
- Every schema change must be migration-driven.
- Every webhook event must be persisted before processing.

## 6) Things We Should Not Do

- No billing/pricing logic in frontend.
- No Stripe secret key in browser bundles.
- No webhook processing without signature verification and raw body handling.
- No direct subscription state trust from redirect pages without webhook confirmation.

## 7) Learning-First Collaboration Rule

- Primary responsibility is not only to make the app work, but to make the student understand each change.
- Work must be delivered in small steps with clear reasoning for each step.
- Before major commands/edits, explain:
  - what will be done,
  - why it is done,
  - what result to expect.
- After each step, summarize what changed and how to verify it.
