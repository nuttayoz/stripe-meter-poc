# Stripe Meter Billing Demo Plan

## 1) Locked Decisions

- Organization model: **one organization per user** (for demo scope).
- Billing checkout UX: **Stripe-hosted Checkout** first.
- Auth: **JWT access + refresh token**.
- Transaction history: **store all outcomes** (success, failed, refunded, voided).
- Tax: **Stripe Tax enabled**.
- Plan types:
  - `PLAN_A`: base monthly + metered overage
  - `PLAN_B`: maximum monthly usage per organization member (org billed by monthly peak member usage)
- Calculation ownership:
  - `PLAN_A`: Stripe-managed calculation (subscription + metered aggregation + invoice + tax).
  - `PLAN_B`: app-managed monthly peak aggregation, Stripe-managed invoice + tax from emitted peak usage.
- Frontend data/state policy:
  - Use React Query for server state.
  - No Next.js API routes in v1 by default; frontend calls NestJS directly.
  - Allow Next.js API only for explicit BFF needs.
- Architecture policy:
  - Deploy as Modular Monolith.
  - Implement hexagonal-lite boundaries in core backend modules.
- Runtime: **Bun**.
- Stack:
  - Frontend: Next.js + Tailwind + React Query
  - Backend: NestJS
  - DB: Postgres
  - Cache/queue helper: Redis
  - Billing: Stripe (Catalog + Subscriptions + Meters + Webhooks)

## 2) Billing Model Specification (v1)

### Stripe Capability Boundary (as of 2026-02-26)
- Stripe can natively aggregate common meter formulas (for example sum/count/last).
- Stripe does **not** provide native `max` aggregation for usage meters.
- Result:
  - `PLAN_A` can be fully calculation-managed by Stripe.
  - `PLAN_B` requires backend peak calculation before sending meter events.

### PLAN_A. Base Monthly + Metered Overage
- Customer pays fixed monthly base fee.
- Usage over included quota is billed by meter.
- Meter event value: raw burned units (`sum` behavior).

### PLAN_B. Maximum Monthly Usage Per Member
- Organization has multiple members (users).
- Track each member's cumulative usage during a billing period.
- Monthly bill is based on the **highest member cumulative usage** in that period.
- Example:
  - Member A = 200 units
  - Member B = 400 units
  - Billable usage = **400** (not 600)
- Stripe meter integration pattern:
  - Keep one Stripe customer per organization.
  - Emit **peak snapshot** values (not raw event sums).
  - Use meter formula compatible with end-of-period snapshot billing (`last`).

### Implementation Assumption
- `PLAN_B` is usage-based monthly billing (no included quota).
- Backend computes the organization monthly peak and emits peak snapshot meter events.
- Stripe remains the billing engine for invoice generation, tax, and payment collection.
- If you want a base fee on top of PLAN_B later, we can add a fixed recurring price item.

## 3) High-Level Architecture

- Monorepo (Bun workspaces):
  - `apps/web` (Next.js app)
  - `apps/api` (NestJS app)
  - `packages/shared` (types/constants/api contracts)
- Architecture style:
  - Runtime/deploy shape: modular monolith (`apps/api`).
  - Code boundaries: hexagonal-lite in billing/auth/usage/webhook modules.
- Infra (local dev):
  - Postgres
  - Redis
  - Stripe CLI webhook forwarder
- Source of truth:
  - Stripe for subscription/payment lifecycle
  - Local DB mirrors Stripe entities for fast UI/API reads
- Frontend/API interaction:
  - React Query talks directly to NestJS API.
  - No Next.js API layer in baseline scope.
- Governance:
  - Engineering standards live in `ENGINEERING_RULES.md`.

## 4) Domain Data Model (Initial)

### Core Tables
- `organizations`
  - `id`, `name`, `stripe_customer_id` (unique), timestamps
- `users`
  - `id`, `organization_id` (FK), `email` (unique), `password_hash`, `role`, timestamps
- `refresh_tokens`
  - `id`, `user_id`, `token_hash`, `expires_at`, `revoked_at`, timestamps

### Billing Catalog
- `billing_products`
  - `id`, `stripe_product_id` (unique), `name`, `active`, `metadata`, timestamps
- `billing_prices`
  - `id`, `stripe_price_id` (unique), `stripe_product_id`, `type` (`recurring`/`one_time`), `unit_amount`, `currency`, `interval`, `tax_behavior`, `active`, `billing_strategy` (`base_plus_overage`/`max_member_usage`), `included_units` (nullable), `meter_name` (nullable), timestamps

### Subscription + Usage + Transactions
- `subscriptions`
  - `id`, `organization_id`, `stripe_subscription_id` (unique), `stripe_price_id`, `status`, `current_period_start`, `current_period_end`, timestamps
- `usage_events`
  - `id`, `organization_id`, `user_id`, `stripe_meter_event_id` (unique nullable), `meter_name`, `quantity`, `idempotency_key` (unique), `event_time`, `status`, `raw_payload`, timestamps
- `member_period_usage`
  - `id`, `organization_id`, `user_id`, `period_start`, `period_end`, `total_units`, `updated_at`, unique(`organization_id`,`user_id`,`period_start`,`period_end`)
- `org_peak_usage_snapshots`
  - `id`, `organization_id`, `period_start`, `period_end`, `peak_units`, `source_user_id`, `stripe_meter_event_id` (nullable), `idempotency_key` (unique), `created_at`
- `transactions`
  - `id`, `organization_id`, `type`, `status`, `amount`, `currency`, `stripe_invoice_id`, `stripe_payment_intent_id`, `stripe_charge_id`, `raw_payload`, `occurred_at`, timestamps
- `stripe_webhook_events`
  - `id`, `stripe_event_id` (unique), `type`, `processed`, `received_at`, `processed_at`, `raw_payload`, `error_message`

## 5) End-to-End Product Flow

1. User logs in with email/password.
2. API returns access token + refresh token.
3. Frontend checks active subscription for user organization.
4. If no active subscription, redirect to plan page.
5. Plan page loads catalog synced from Stripe.
6. User clicks subscribe -> API creates Stripe Checkout Session.
7. Stripe-hosted Checkout handles payment + tax.
8. Stripe webhook confirms subscription/invoice events -> DB updated.
9. User enters burning unit page.
10. Burn action sends usage event (idempotent) -> strategy-aware meter pipeline:
    - PLAN_A: emit burned units directly.
    - PLAN_B: update member monthly total and emit new org peak snapshot only when peak changes.
11. Transaction history page/API always reflects Stripe event outcomes.

## 6) Small Task Breakdown (Tracking + Troubleshooting)

## P0. Workspace + Infra Bootstrap

### T0.1 Initialize Monorepo
- Create Bun workspace structure (`apps/web`, `apps/api`, `packages/shared`).
- Add root scripts for `dev`, `build`, `lint`, `test`.
- Done when: both apps run from one root command.
- Troubleshoot:
  - Bun workspace resolution issues -> verify `workspaces` in root `package.json`.

### T0.2 Local Infra Compose
- Add `docker-compose.yml` for Postgres + Redis.
- Add `.env.example` for both apps.
- Done when: `docker compose up` provides reachable Postgres/Redis.
- Troubleshoot:
  - Port conflicts -> remap default ports.
  - DB auth errors -> verify env parity across API and compose.

### T0.3 Developer Tooling
- Add ESLint/Prettier, basic scripts, health checks.
- Done when: `bun run lint` and basic tests pass.

## P1. Backend Foundation (NestJS)

### T1.1 API Bootstrap
- Create Nest app modules: `Auth`, `Org`, `Billing`, `Usage`, `Webhook`, `Transaction`.
- Add global validation pipe + exception filter.
- Done when: `/health` and `/api/version` return expected payload.

### T1.2 Database Integration
- Set up ORM (Prisma recommended) with Postgres.
- Create initial schema and migrations for all tables above.
- Done when: migrations run clean on empty DB.
- Troubleshoot:
  - Migration drift -> reset local DB and reapply.

### T1.3 Redis Integration
- Add Redis client abstraction (cache + lightweight lock/idempotency support).
- Done when: API can set/get a test key.

## P2. Auth + Org Model

### T2.1 User Registration Seed (internal/admin script)
- Add script to create first user + organization.
- Done when: seeded user can log in.

### T2.2 Login + JWT Access/Refresh
- `POST /auth/login` issues access + refresh tokens.
- `POST /auth/refresh` rotates refresh tokens.
- `POST /auth/logout` revokes current refresh token.
- Done when: access expiry and refresh cycle work reliably.
- Troubleshoot:
  - Clock drift token errors -> use server-side UTC and leeway.

### T2.3 One-Org-Per-User Guardrails
- Enforce non-null `organization_id` on users.
- Done when: all protected endpoints derive org from JWT user context.

## P3. Stripe Catalog Sync

### T3.1 Stripe SDK Setup
- Add Stripe client with API version pin + retry config.
- Done when: API can fetch a test product list.

### T3.2 Product/Price Sync Job
- Create job: sync Stripe products/prices into local catalog tables.
- Add manual endpoint: `POST /billing/catalog/sync` (admin only).
- Done when: local catalog mirrors active Stripe products/prices.
- Troubleshoot:
  - Missing prices -> verify Stripe object expansion and active filter.

### T3.3 Plan Read API
- `GET /billing/plans` returns active plan list from local DB.
- Done when: frontend can render plan cards without direct Stripe calls.

## P4. Subscription Checkout

### T4.1 Checkout Session Creation
- `POST /billing/checkout-session`
  - Validate no active subscription (subscribe-once rule).
  - Create Stripe Checkout Session with:
    - customer = organization stripe customer
    - selected recurring price
    - automatic tax enabled
    - success/cancel URLs
- Done when: user lands on Stripe-hosted Checkout successfully.

### T4.2 Subscription Status API
- `GET /billing/subscription/current`
- Done when: frontend can gate access to burn page.

### T4.3 Customer Bootstrap
- If org has no `stripe_customer_id`, create and persist one.
- Done when: exactly one Stripe customer exists per org.
- Troubleshoot:
  - Duplicate customer race -> lock by org ID (Redis lock + DB unique constraint).

## P5. Metering + Burn Unit Service

### T5.0 Strategy Router + Calculation Ownership
- Route each burn request by subscribed `billing_strategy`.
- Enforce ownership:
  - `PLAN_A`: no internal pricing math beyond logging and idempotency.
  - `PLAN_B`: internal peak aggregation service (required).
- Done when: API path clearly delegates strategy and logs the chosen path.

### T5.1 Burn Units API
- `POST /usage/burn`
  - Input: quantity + burn reason
  - Generate idempotency key
  - Persist usage event pending
  - Route to billing strategy handler
  - Emit Stripe meter event (or peak snapshot event)
  - Update usage event status atomically
- Done when: repeated same request does not double-charge.
- Troubleshoot:
  - Duplicate events -> enforce unique `idempotency_key`.

### T5.2 PLAN_A Handler (Base + Overage)
- Emit meter event quantity = burned units.
- Maintain included quota and overage estimate.
- Done when: summed usage reflects raw consumption.

### T5.3 PLAN_B Handler (Monthly Max Per Member)
- In transaction:
  - Increment `member_period_usage.total_units` for current user.
  - Compute current org peak across members for same period.
  - If peak increased, persist snapshot and emit Stripe peak snapshot event.
- Done when: org billable usage equals highest member total at period end.
- Troubleshoot:
  - Concurrent burns causing wrong peak -> lock by org+period and recompute max in DB.
  - Event spam -> emit only when peak value changes.

### T5.4 Burn Simulation Rules
- Demo service model:
  - `small` burn = 1 unit
  - `medium` burn = 5 units
  - `large` burn = 20 units
- Done when: UI has simple action buttons tied to predictable unit costs.

### T5.5 Usage Summary API
- `GET /usage/summary`
  - PLAN_A: current used units, included units, projected overage
  - PLAN_B: per-member monthly totals + current org peak billable units
- Done when: burn page shows clear usage status.

## P6. Webhooks + Transaction Ledger

### T6.1 Webhook Endpoint
- `POST /stripe/webhook` with raw body signature verification.
- Persist every webhook event before processing.
- Done when: endpoint verifies signature and stores incoming events.
- Troubleshoot:
  - Signature fail -> ensure raw body middleware is configured before JSON parser.

### T6.2 Event Handlers
- Handle at minimum:
  - `checkout.session.completed`
  - `customer.subscription.created|updated|deleted`
  - `invoice.paid`
  - `invoice.payment_failed`
  - `charge.refunded`
- Update `subscriptions` + `transactions` consistently.
- Done when: DB state follows Stripe event stream.

### T6.3 Idempotent Webhook Processing
- Reject duplicate `stripe_event_id`.
- Track `processed` and failure reason.
- Done when: replayed events are safe.

## P7. Frontend UX (Next.js)

### T7.1 App Shell + Route Guards
- Pages:
  - `/login`
  - `/plans`
  - `/burn`
- Add auth-aware redirects and protected route handling.
- Done when: flow is strictly login -> plans -> burn.

### T7.2 Login Page
- Email/password form with token storage and refresh flow.
- Done when: user lands on correct next page based on subscription status.

### T7.3 Plan Selection Page
- Fetch plans via React Query.
- CTA starts checkout and redirects to Stripe.
- Done when: checkout opens with chosen plan.

### T7.4 Burn Unit Page
- Action cards/buttons for burn sizes.
- Live usage summary and recent events.
- Done when: user can burn units and see updates immediately.

## P8. History, Monitoring, and Hardening

### T8.1 Transaction History API + Page
- `GET /transactions?status=&type=&page=`
- Show all states including failed/refunded.
- Done when: auditable timeline is visible per org.

### T8.2 Observability
- Structured logs with request ID + org ID.
- Metrics for webhook failures and burn event retries.
- Done when: critical billing actions are traceable.

### T8.3 Test Coverage
- Unit: auth, usage idempotency, webhook handlers.
- Integration: login -> checkout session -> webhook update flow.
- Done when: core path tests pass in CI.

## 7) API Surface (Initial Draft)

### Auth
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`

### Billing
- `GET /billing/plans`
- `POST /billing/catalog/sync` (admin)
- `POST /billing/checkout-session`
- `GET /billing/subscription/current`

### Usage
- `POST /usage/burn`
- `GET /usage/summary`
- `GET /usage/events`

### Transactions
- `GET /transactions`
- `GET /transactions/:id`

### Stripe
- `POST /stripe/webhook`

### Next.js API
- None in baseline architecture (add only for approved BFF cases).

## 8) Acceptance Criteria for Demo

- User can log in and receive access + refresh token.
- User can subscribe once through Stripe-hosted Checkout.
- Stripe Tax is applied in checkout/invoice.
- Burn actions create usage events and meter events idempotently.
- PLAN_A billing uses summed overage events.
- PLAN_B billing uses monthly peak member usage snapshots.
- Only PLAN_B contains app-side billing aggregation logic; PLAN_A uses Stripe-native aggregation.
- Local DB stores full transaction history (success/failure/refund).
- Webhooks keep subscription and transaction state in sync.
- UI flow remains simple and linear: login -> plan -> burn.
- Implementation follows `ENGINEERING_RULES.md` guardrails.

## 9) Known Risks and Early Mitigation

- Webhook/body parser misconfiguration: implement raw body route first and test with Stripe CLI.
- Duplicate Stripe events: use event ID unique constraint + idempotent handlers.
- Race condition on customer creation: DB unique + Redis lock.
- Peak strategy race conditions: transactional recompute + org-period lock.
- If strict "log-only, no app-side calculation" is required, PLAN_B must be redesigned to Stripe-native aggregation strategy.
- Local/Stripe drift: periodic catalog sync and reconciliation endpoint.

## 10) Build Order Recommendation

1. P0 -> P1 -> P2 (foundation first)
2. P3 -> P4 (catalog + checkout)
3. P6 (webhooks) before full frontend polish
4. P5 (burn/meter)
5. P7 + P8 (UX and hardening)
