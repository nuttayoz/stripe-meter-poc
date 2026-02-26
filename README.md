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
└── PLAN.md
```

## Root Scripts

- `bun run infra:up` starts Postgres and Redis.
- `bun run infra:down` stops local infra.
- `bun run infra:logs` tails infra logs.
- `bun run dev:web` runs Next.js app (after scaffold).
- `bun run dev:api` runs NestJS app (after scaffold).

## Notes

- Architecture and coding constraints live in `ENGINEERING_RULES.md`.
- Project execution roadmap lives in `PLAN.md`.
