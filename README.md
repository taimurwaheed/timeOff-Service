# TimeOff Service (https://github.com/taimurwaheed/timeOff-Service)

A NestJS + SQLite microservice for managing employee time-off requests 
and syncing leave balances with an HCM system (e.g. Workday, SAP).

## Tech Stack
- NestJS + TypeScript
- SQLite via TypeORM
- JWT Authentication
- @nestjs/schedule for cron jobs

## Quick Start
```bash
npm install --legacy-peer-deps
npm run start
```

Default port: `3000`

## Default Credentials
| Role | Email | Password |
|---|---|---|
| Admin | admin@test.com | password123 |
| Manager | manager@test.com | password123 |
| Employee | employee@test.com | password123 |

## API Endpoints

### Auth
- `POST /auth/login`

### Time-Off Requests
- `POST /time-off-requests`
- `GET /time-off-requests`
- `PATCH /time-off-requests/:id/approve`
- `PATCH /time-off-requests/:id/reject`
- `PATCH /time-off-requests/:id/cancel`

### Balances
- `GET /balances`
- `GET /balances/:userId`

### Sync
- `POST /sync/realtime/:userId/:locationId`
- `POST /sync/batch`
- `GET /sync/logs`

### HCM Mock
- `POST /hcm/seed`
- `POST /hcm/reset`
- `GET /hcm/balances/:employeeId/:locationId`
- `POST /hcm/balances/batch`
- `POST /hcm/balances/:employeeId/:locationId/adjust`

## Running Tests
```bash
# Unit tests
npm test

# Unit tests with coverage
npm run test:cov

# E2E tests
npm run test:e2e
```

## Architecture
See `TRD.md` for full technical design, challenges, and alternatives.