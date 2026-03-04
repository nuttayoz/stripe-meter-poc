# TODO / Progress Tracker

Last updated: 2026-03-02

## How To Use

- Mark completed items with `[x]`.
- Keep only one active item marked as `(In Progress)`.
- Add short notes under each phase when blockers happen.

## Phase A: Project Foundation

- [x] Create root project structure (`application/`, `backend/`, `devtool/`)
- [x] Add planning and rules docs (`PLAN.md`, `ENGINEERING_RULES.md`)
- [x] Initialize git at repository root
- [x] Configure Bun workspace at root (`package.json`, `.env.example`, `.gitignore`)
- [x] Add local infra compose file (`devtool/docker-compose.yml`)
- [x] Scaffold Next.js app in `application/web`
- [x] Scaffold NestJS app in `backend/api`
- [x] Install and verify Bun runtime
- [x] Fix root run scripts (`dev`, `build`, `lint`, `test`)
- [x] Resolve port conflict (`web:3000`, `api:3001`)

## Phase B: Baseline Integration

- [x] Add backend baseline endpoints (`GET /api/health`, `GET /api/version`)
- [x] Add backend CORS + global `/api` prefix
- [x] Add React Query provider in Next.js
- [x] Add frontend API helper for health/version
- [x] Add homepage integration with live backend health status
- [x] Update backend unit tests for new endpoints

## Phase C: Quality Workflow

- [x] Standardize lint behavior (`lint` check-only, `lint:fix` explicit)
- [x] Add workspace `typecheck` scripts
- [x] Add root `check` pipeline (lint + typecheck + test + build)
- [x] Add `.editorconfig`

## Phase D: Next Implementation Targets

- [x] Build Auth module in NestJS (login, refresh, logout)
- [x] Add password hashing + refresh token persistence model
- [x] Build login page in Next.js
- [x] Add route guards (`/login` -> `/plans` -> `/burn`)
- [x] Add Stripe SDK module and secure env validation
- [x] Implement Stripe catalog sync (`products`, `prices`)
- [x] Implement checkout session endpoint (Stripe-hosted)
- [x] Implement webhook endpoint with signature verification
- [x] Implement usage burn endpoint with idempotency
- [ ] Add transaction history API + UI

## Current Focus

- [ ] Add transaction history API + UI (In Progress)

## Notes

- React Query is the server-state pattern.
- No Next.js API routes in v1 baseline.
- `PLAN_A` uses Stripe-native aggregation.
- `PLAN_B` requires app-side peak aggregation before sending meter snapshots.
- Webhook v1 handles 12 required Stripe events only (optional events deferred).
- Burn usage API now supports idempotent `POST /api/usage/burn` for both plan strategies.
- Burn API requires `priceId` to resolve the exact subscription in multi-sub organizations.
- Burn page now executes real API mutation end-to-end (no local burn simulator writes).
- Checkout now allows multi-plan subscriptions per org, while preventing duplicate active subscriptions for the same plan.
- Burn page now loads `GET /api/billing/subscriptions/active` and allows burning only against active subscriptions.
