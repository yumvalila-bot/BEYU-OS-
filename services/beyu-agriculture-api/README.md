# @beyu/agriculture-api

BEYU AGRICULTURE OS — sector OS under AGRICULTURE LLC. See
[`docs/AGRICULTURE_OS.md`](../../docs/AGRICULTURE_OS.md) for architecture,
security model and federation stance.

## Run (embedded PGLite, zero infra)

```bash
pnpm --filter @beyu/agriculture-api dev        # API on :4002
pnpm --filter @beyu/agriculture-api db:migrate # .data/agriculture_pglite
pnpm --filter @beyu/agriculture-api db:seed    # demo tenants/users
```

Seed credentials: `admin@beyu.agriculture` / `BeyuAgriculture2026!`
(also `manager@beyu.agriculture`, same password).

## Run (Postgres)

```bash
docker compose -f docker-compose.yml -f docker-compose.agriculture.yml up -d
DATABASE_DRIVER=postgres DATABASE_URL=postgresql://beyu_agriculture:beyu_agriculture_dev@localhost:5434/beyu_agriculture_os \
  pnpm --filter @beyu/agriculture-api dev
```

## Test

```bash
pnpm --filter @beyu/agriculture-api test    # 182 e2e tests, disposable PGLite
```

## API

Versioned REST under `/api/v1`:

- Auth & platform: `/auth/login|refresh|logout|me`, `/users`, `/tenants/:id`,
  `/audit`, `/reports/tenant-stats`, `/health/live`, `/health/ready`
- Farms & land: `/farms` (CRUD), `/fields` (CRUD), `/soil-records`
- Crops & harvest: `/crops`, `/crop-cycles` (create/list/get/update),
  `/harvests`, `/storage-lots` (+ `:id/release`), `/weather`, `/activities`
  (+ `:id/complete`)
- Livestock: `/herds`, `/animals`, `/animal-health-events`, `/production-records`
- Inventory: `/warehouses`, `/input-items`, `/stock-movements`, `/stock-summary`
- Procurement: `/suppliers`, `/buyers`, `/purchase-orders` (+ `:id/transition`),
  `/sales-orders` (+ `:id/transition`), `/contracts` (+ `:id/transition`)
- Operations: `/equipment`, `/maintenance-logs`, `/fuel-logs`, `/workers`,
  `/work-orders` (+ `:id/transition`)
- Compliance & traceability: `/certifications`, `/inspections`,
  `/traceability/lots/:id`

Swagger UI is served at `/api/docs`.
