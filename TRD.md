# Technical Requirements Document (TRD)
## Time-Off Microservice — ExampleHR

**Version:** 1.0  
**Date:** April 2026  
**Stack:** NestJS · SQLite · TypeORM · JWT · @nestjs/schedule

---

## 1. Overview

The Time-Off Microservice is a standalone NestJS backend service responsible for:

- Managing the full lifecycle of employee time-off requests
- Maintaining leave balance integrity between ExampleHR and the HCM system (e.g. Workday, SAP)
- Syncing balance changes initiated externally in the HCM (anniversary bonuses, year-start refreshes)
- Writing back approved deductions to HCM so it remains the source of truth
- Providing a full audit trail of every balance change via sync logs

The HCM system is the **source of truth** for leave balances. ExampleHR maintains a local cache of balances for performance and availability, but must reconcile with HCM on every meaningful event.

---

## 2. System Architecture

┌─────────────────────────────────────────────────────────┐
│                   ExampleHR Frontend                    │
└─────────────────────┬───────────────────────────────────┘
│ REST / JWT
┌─────────────────────▼───────────────────────────────────┐
│            Time-Off Microservice (NestJS)                │
│                                                          │
│  ┌───────────┐  ┌─────────────────┐  ┌───────────────┐  │
│  │   Auth    │  │  Time-Off       │  │   Balances    │  │
│  │  Module   │  │  Requests       │  │   Module      │  │
│  │  JWT+RBAC │  │  Module         │  │               │  │
│  └───────────┘  └────────┬────────┘  └───────────────┘  │
│                          │                               │
│                 ┌────────▼────────┐                      │
│                 │  Sync Module    │                      │
│                 │  + Scheduler   │                      │
│                 └────────┬────────┘                      │
│                          │                               │
│                 ┌────────▼────────┐                      │
│                 │   HCM Mock      │                      │
│                 │   Module        │ ← Simulates Workday  │
│                 └─────────────────┘                      │
│                                                          │
│  ┌──────────────────────────────────────────────────┐    │
│  │                SQLite via TypeORM                │    │
│  │  users · leave_balances · time_off_requests      │    │
│  │  sync_logs                                       │    │
│  └──────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
│
┌───────────▼───────────┐
│   HCM System          │
│   (Workday / SAP)     │
│   Source of Truth     │
└───────────────────────┘

---

## 3. Data Model

### `users`
| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| name | string | Display name |
| email | string | Unique |
| password | string | bcrypt hashed (10 rounds) |
| role | enum | EMPLOYEE / MANAGER / ADMIN |
| managerId | UUID | Nullable — references users.id |
| locationId | string | e.g. LOC001 |
| createdAt | datetime | Auto-generated |

### `leave_balances`
| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| userId | UUID | References users.id |
| locationId | string | Balance is per-employee per-location |
| balance | float | Current available days |
| version | int | Optimistic lock counter |
| lastSyncedAt | datetime | Last time balance was updated |

**Constraint:** `UNIQUE(userId, locationId)` — enforces one balance record per employee per location.

### `time_off_requests`
| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| userId | UUID | Requesting employee |
| locationId | string | Location of the request |
| startDate | string | ISO date string, inclusive |
| endDate | string | ISO date string, inclusive |
| daysRequested | int | Positive integer, validated against dates |
| status | enum | PENDING / COMMITTED / REJECTED / CANCELLED / FAILED |
| createdAt | datetime | Auto-generated |
| updatedAt | datetime | Auto-updated |

**Status definitions:**
- `PENDING` — submitted, awaiting manager decision
- `COMMITTED` — approved by manager and deducted in both ExampleHR and HCM
- `REJECTED` — manager actively denied the request
- `CANCELLED` — employee voluntarily withdrew the request
- `FAILED` — could not be committed (HCM rejection, insufficient balance, optimistic lock conflict, or invalidated by sync)

### `sync_logs`
| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| type | enum | REALTIME / BATCH |
| userId | UUID | Whose balance changed |
| locationId | string | Which location balance changed |
| previousBalance | float | Before the change |
| newBalance | float | After the change |
| triggeredBy | string | Actor description |
| createdAt | datetime | Auto-generated |

---

## 4. Request Lifecycle

Employee submits request
│
▼
PENDING ──────────────────────────────► CANCELLED (employee withdraws)
│
├──► Manager REJECTS ──────────────► REJECTED
│
▼
Manager APPROVES
│
├──► HCM adjust() called
│         │
│         ├──► HCM rejects (negative balance) ──► FAILED
│         │
│         └──► HCM accepts
│                   │
│                   └──► Local optimistic lock update
│                             │
│                             ├──► Lock conflict ──► HCM rollback ──► FAILED
│                             │
│                             └──► Success ──────────────────────► COMMITTED
│
└──► Balance sync reduces balance below daysRequested ──────────► FAILED

---

## 5. API Reference

### Auth
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | /auth/login | None | Returns JWT access token |

### Balances
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | /balances | ADMIN | All balances across all users |
| GET | /balances/:userId | Any | Own balance (EMPLOYEE), team balance (MANAGER), any (ADMIN) |

### Time-Off Requests
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | /time-off-requests | Any | Create a new pending request |
| GET | /time-off-requests | Any | Scoped by role |
| PATCH | /time-off-requests/:id/approve | MANAGER / ADMIN | Approve — deducts locally and in HCM |
| PATCH | /time-off-requests/:id/reject | MANAGER / ADMIN | Reject — no balance change |
| PATCH | /time-off-requests/:id/cancel | EMPLOYEE | Cancel own pending request |

### Sync
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | /sync/realtime/:userId/:locationId | MANAGER / ADMIN | Pull latest balance from HCM for one employee |
| POST | /sync/batch | MANAGER / ADMIN | Ingest full HCM balance corpus |
| GET | /sync/logs | ADMIN | Full audit trail newest first |

### HCM Mock (simulates external Workday/SAP)
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | /hcm/seed | None | Seed a balance record into mock |
| POST | /hcm/reset | None | Clear all mock state |
| GET | /hcm/balances/:employeeId/:locationId | None | Realtime balance lookup |
| POST | /hcm/balances/batch | None | Batch upsert full corpus |
| POST | /hcm/balances/:employeeId/:locationId/adjust | None | Simulate external event (delta + reason) |

---

## 6. Key Challenges & Solutions

### Challenge 1 — The Dual-Write Problem
**Problem:** ExampleHR and HCM both hold balance data. When an employee requests time off on ExampleHR, both systems must agree on the balance. If HCM rejects the deduction, ExampleHR must not commit it. If ExampleHR writes successfully but HCM fails, the systems diverge.

**Solution:** Write to HCM first before touching the local database. The approval flow calls `hcmMockService.adjust()` with a negative delta before any local update. If HCM throws (e.g. insufficient balance, invalid dimensions), the request is marked `FAILED` and the local balance is never touched. If the subsequent local optimistic lock update fails, a compensating `adjust()` call rolls back the HCM deduction. This makes HCM the authoritative gatekeeper for every balance change.

---

### Challenge 2 — HCM Updates Balances Independently
**Problem:** HCM is not the only consumer of its own data. Work anniversaries, year-start refreshes, and manual corrections all originate in HCM and are never pushed through ExampleHR. The local cache can become stale at any time without warning.

**Solution:** Three sync mechanisms operating at different granularities:
1. **Realtime pull** (`POST /sync/realtime/:userId/:locationId`) — triggered manually or by an event, pulls one employee's balance from HCM and reconciles.
2. **Batch ingest** (`POST /sync/batch`) — accepts the full HCM corpus and upserts all records, designed to receive HCM's periodic full-push.
3. **Scheduled job** (`@Cron(EVERY_30_MINUTES)`) — automatically pulls all HCM balances every 30 minutes, ensuring staleness never exceeds half an hour without operator intervention.

All three paths share the same invalidation logic: after updating a balance, any `PENDING` request where `daysRequested > newBalance` is immediately marked `FAILED`.

---

### Challenge 3 — HCM Errors Are Not Guaranteed
**Problem:** The requirements state HCM may return errors for insufficient balance or invalid dimensions, but this cannot be relied upon. The system must be defensive regardless of whether HCM validates correctly.

**Solution:** Double validation at every deduction point:
- At request creation: local balance is checked before creating the `PENDING` record.
- At approval: local balance is re-checked before calling HCM, even though HCM will also validate. If local balance is insufficient, the request fails before HCM is ever contacted.
- The HCM call is wrapped in try/catch. Any error from HCM (whether expected or unexpected) is handled gracefully — the request is marked `FAILED` with the HCM error message surfaced to the caller.

This means the system behaves correctly even if HCM silently accepts an invalid deduction or returns an unexpected error format.

---

### Challenge 4 — Concurrent Approvals (Race Condition)
**Problem:** Two managers could attempt to approve the same request simultaneously. Without coordination, both could read the same balance, both compute the same new balance, and both write — resulting in the balance being deducted only once despite two approvals going through, or in a double-deduction.

**Solution:** Optimistic locking on the `leave_balances` table using a `version` counter. The approval update uses:
```sql
UPDATE leave_balances
SET balance = :newBalance, version = :version + 1
WHERE id = :id AND version = :version
```
If another process updated the balance between the read and the write, `affected = 0` and the approval throws `BadRequestException('Balance was modified concurrently, please try again')`. The same pattern is applied to all sync write paths, ensuring version conflicts are detected regardless of the source of the concurrent modification.

---

### Challenge 5 — Batch Sync Partial Failure
**Problem:** A batch payload from HCM could contain hundreds of employee balances. If processing fails halfway through (e.g. a database error on record 150 of 300), the first 149 balances are updated and the rest are not, leaving the system in a partially-synced state.

**Solution (current):** Each balance is processed individually with a per-record `try/catch`. A failure on one record is logged and skipped — it does not abort the batch. The `SyncLog` table provides a record of exactly which balances were processed. On re-run, already-updated balances that haven't changed are skipped (`unchanged` counter), making the operation idempotent.

**Known limitation:** This is not fully atomic. A production system should wrap the entire batch in a database transaction so it either fully commits or fully rolls back with a clear error.

---

### Challenge 6 — Pending Requests Invalidated by External Balance Changes
**Problem:** An employee could submit a pending 8-day request. Before a manager approves it, HCM reduces their balance to 3 days (e.g. a correction or policy change). If a manager then approves without re-checking, 8 days would be deducted from a balance of 3, going negative.

**Solution:** All three sync paths (realtime, batch, scheduled) call `invalidatePendingRequests()` after every balance update. This scans all `PENDING` requests for that employee+location and marks any request where `daysRequested > newBalance` as `FAILED`. The manager sees the request is already `FAILED` before attempting approval. Additionally, the approval path re-validates the local balance as a final defensive check before contacting HCM.

---

## 7. Alternatives Considered

### Alternative 1 — Event-Driven Sync via Webhooks
Instead of polling or manual sync triggers, HCM could push balance changes to ExampleHR via webhooks whenever a balance changes.

**Pros:** Near-zero latency on HCM-originated changes. No polling overhead.  
**Cons:** Requires HCM to support outbound webhooks and ExampleHR to expose a public ingress endpoint. Adds complexity around webhook authentication, retry logic, and missed event recovery. Not all HCM vendors support this.

**Why not chosen:** Out of scope for the current integration model. However, `POST /sync/batch` is already designed to receive pushed payloads, making a webhook-to-batch-sync bridge a natural future evolution with minimal service changes.

---

### Alternative 2 — HCM as the Only Database (No Local Cache)
Instead of caching balances in SQLite, every balance read and write could go directly to the HCM API.

**Pros:** No sync problem — there is only one system.  
**Cons:** HCM APIs are typically rate-limited, have higher latency than a local database, and are not designed for high-frequency reads. An employee checking their balance on every page load would exhaust HCM API quotas. The service would be entirely unavailable during HCM downtime.

**Why not chosen:** Local caching with periodic reconciliation is the standard enterprise pattern for HCM integrations. The sync complexity is the intended challenge of this system.

---

### Alternative 3 — Pessimistic Locking Instead of Optimistic Locking
Use database-level row locks (`SELECT FOR UPDATE`) to prevent concurrent balance modifications rather than version-based optimistic locking.

**Pros:** Eliminates the retry burden on the caller — the second request simply waits rather than failing.  
**Cons:** SQLite has table-level locking, not row-level, making `SELECT FOR UPDATE` effectively a full table lock under concurrent load. Pessimistic locking significantly reduces throughput when approval volume is high.

**Why not chosen:** Optimistic locking is more appropriate for this workload where balance conflicts are rare. The retry-on-conflict pattern is standard and acceptable. SQLite's locking model makes pessimistic approaches particularly costly.

---

### Alternative 4 — GraphQL Instead of REST
The requirements mention GraphQL as an option for the API layer.

**Pros:** Flexible querying — clients could request nested balance+request data in a single query. Strong typing via schema.

**Cons:** Higher implementation complexity, additional tooling (`@nestjs/graphql`, Apollo), and overkill for a service with straightforward CRUD and workflow operations.

**Why not chosen:** REST is simpler to implement, test with supertest, and consume for the current requirements. GraphQL would add value if clients needed flexible cross-entity queries, which is not a stated requirement.

---

### Alternative 5 — Saga Pattern for Approval Distributed Transaction
The approval flow involves two writes that must be atomic: the HCM deduction and the local balance update. A formal Saga pattern would make this an explicit distributed transaction with defined compensation steps.

**Pros:** Explicit, auditable, and extensible compensation logic.  
**Cons:** Significantly increases implementation complexity. Requires a saga orchestrator or choreography pattern. Overkill for two systems.

**Why not chosen:** The current implementation achieves the same correctness guarantee with a simpler pattern: write HCM first, then local with optimistic lock, with an inline compensating `adjust()` call on lock failure. This is functionally equivalent to a two-step saga for this specific use case.

---

## 8. Security

| Concern | Implementation |
|---|---|
| Authentication | JWT Bearer tokens via `passport-jwt` |
| Password storage | bcrypt with 10 salt rounds |
| JWT secret | `process.env.JWT_SECRET` with fallback |
| RBAC | Enforced in service layer on every operation |
| Input validation | `ValidationPipe` global in `main.ts`, DTOs with `class-validator` |
| Balance double-validation | Local check before every HCM call |
| HCM endpoints | Unauthenticated by design — simulates external system |

---

## 9. Test Strategy

### Unit Tests (`*.spec.ts` alongside source files)
All service-layer business logic is unit tested with mocked repositories.

| File | Tests | Coverage |
|---|---|---|
| `balances.service.spec.ts` | 9 | RBAC rules, 404 handling, getAllBalances |
| `time-off-requests.service.spec.ts` | 13 | Full lifecycle, optimistic lock conflict |
| `sync.service.spec.ts` | 8 | Sync logic, batch summaries, request invalidation, getSyncLogs |

**Total: 31 unit tests**

### E2E Tests (`test/app.e2e-spec.ts`)
Full integration tests against a live NestJS application with real SQLite database. Database is wiped and reseeded before every run.

| Flow | Description |
|---|---|
| Flow 1 | Happy path — submit, approve, balance deducted |
| Flow 2 | Insufficient balance — 400 rejection |
| Flow 3 | Realtime HCM sync — balance updated, SyncLog created |
| Flow 4 | Batch sync invalidation — pending request marked FAILED |
| Flow 5 | Concurrent approval — optimistic lock prevents double deduction |
| Flow 6 | Manager rejects request — balance unchanged |
| Flow 7 | Employee cancels request — CANCELLED distinct from REJECTED |
| Flow 8 | RBAC enforcement — 403/401 on unauthorized operations |

**Total: 27 e2e tests**

### Running Tests
```bash
# Unit tests
npm test

# Unit tests with coverage report
npm run test:cov

# E2E tests (wipes and reseeds DB automatically)
npm run test:e2e
```

---

## 10. Known Limitations & Future Work

| Item | Description | Priority |
|---|---|---|
| Batch atomicity | Batch sync should be wrapped in a DB transaction | High |
| Leave types | Single balance per location — production needs vacation/sick/personal | High |
| HCM webhook receiver | Accept push notifications from HCM instead of polling | Medium |
| Scheduled sync interval | Should be configurable via environment variable | Medium |
| Pagination | `/sync/logs` and `/time-off-requests` have no pagination | Medium |
| Manager team balance endpoint | No single endpoint to get all team balances at once | Low |
| Soft deletes | Rejected/failed/cancelled requests are never archived | Low |
| HCM authentication | Real HCM integration needs API key or OAuth | Low |
| `daysRequested` vs date range | Server should compute days from dates rather than trusting client | Low |

---

## 11. Running the Service

```bash
# Install dependencies
npm install --legacy-peer-deps

# Start the service (port 3000)
npm run start

# Start in watch mode
npm run start:dev
```

### Default Credentials (auto-seeded on startup)
| Role | Email | Password |
|---|---|---|
| Admin | admin@test.com | password123 |
| Manager | manager@test.com | password123 |
| Employee | employee@test.com | password123 |

### Environment Variables
| Variable | Default | Description |
|---|---|---|
| JWT_SECRET | timeoff_secret_key | JWT signing secret |
| PORT | 3000 | HTTP port |
| HCM_BASE_URL | http://localhost:3000 | HCM API base URL |

