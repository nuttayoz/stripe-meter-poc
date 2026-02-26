# Stripe Meter POC

## Project Structure

```text
.
├── application/
│   └── web/                 # Next.js app
├── backend/
│   └── api/                 # NestJS app
├── devtool/
│   └── docker-compose.yml   # Local infra (Postgres, Redis)
├── package.json             # Bun workspace + root scripts
├── .env.example             # Shared env contract
├── ENGINEERING_RULES.md
├── TODO.md                  # Progress tracker
└── PLAN.md
```

## Root Scripts

- `bun run infra:up` starts Postgres and Redis.
- `bun run infra:down` stops local infra.
- `bun run infra:logs` tails infra logs.
- `bun run dev` runs both `web` and `api` in parallel.
- `bun run dev:web` runs only Next.js.
- `bun run dev:api` runs only NestJS.
- `bun run build` builds all workspaces.
- `bun run lint` runs lint for all workspaces (no auto-fix).
- `bun run lint:fix` applies lint fixes across workspaces.
- `bun run typecheck` runs TypeScript checks across workspaces.
- `bun run test` runs API tests.
- `bun run check` runs lint + typecheck + test + build.

## Notes

- Architecture and coding constraints live in `ENGINEERING_RULES.md`.
- Daily/phase tracking lives in `TODO.md`.
- Project execution roadmap lives in `PLAN.md`.
- If `bun` command is not found after installation, reload shell (`exec /bin/zsh`).
