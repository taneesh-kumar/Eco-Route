# EcoRoute Production Deployment & Runbook Guide

## 1. Production Architecture Overview

EcoRoute is an asynchronous, carbon-aware workload scheduling system built with a modular architecture:

```
                  ┌─────────────────────────────────────┐
                  │    Next.js 16 Production Frontend   │
                  │   (Vercel / Cloudflare Pages / CDN) │
                  └──────────────────┬──────────────────┘
                                     │ HTTPS / REST (NEXT_PUBLIC_API_URL)
                                     ▼
                  ┌─────────────────────────────────────┐
                  │    FastAPI Application Tier         │
                  │      (Uvicorn ASGI Engine)          │
                  │  - 12-Stage DecisionEngine          │
                  │  - Carbon Observation Service       │
                  │  - ExecutionDispatcher              │
                  │  - Health & Readiness Probes        │
                  └──────────┬─────────────────┬────────┘
                             │                 │
              Job Enqueue    │                 │ Direct CAS / State
              (Attempt IDs)  ▼                 ▼
             ┌─────────────────────────┐  ┌─────────────────────────┐
             │ Upstash / Redis Cluster │  │   Supabase PostgreSQL   │
             │   - ExecutionQueue      │  │  - Durable Schema       │
             │   - Ephemeral Mutex     │  │  - State Machine CAS    │
             │   - Carbon/Forecast TTL │  │  - Audit Events         │
             └───────────────┬─────────┘  └────────────▲────────────┘
                             │                         │
                             ▼                         │ Worker Telemetry &
             ┌─────────────────────────┐               │ Completion Updates
             │ Standalone Execution    ├───────────────┘
             │ Worker Daemon / Tasks   │
             │  - Atomic Idempotent CAS│
             │  - Energy/CO2 Telemetry │
             │  - Auto-Retry Routing   │
             └─────────────────────────┘
```

---

## 2. Required Environment Variables

### Backend Configuration

| Variable | Type | Required | Description / Example |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | String | **Yes** | `postgresql+asyncpg://<user>:<password>@<host>:5432/<dbname>` |
| `REDIS_URL` | String | **Yes** | `rediss://default:<password>@<host>:6379/0` (TLS Upstash compatible) |
| `ELECTRICITY_MAPS_API_KEY` | String | Recommended | Live grid carbon intensity auth token |
| `ELECTRICITY_MAPS_API_URL` | String | Optional | Default: `https://api.electricitymap.org/v4` |
| `ENVIRONMENT` | String | Optional | `production` or `development` (Default: `development`) |
| `LOG_LEVEL` | String | Optional | `INFO`, `WARNING`, `ERROR` (Default: `INFO`) |
| `HOST` | String | Optional | `0.0.0.0` (Default: `0.0.0.0`) |
| `PORT` | Integer | Optional | `$PORT` injected by PaaS or `8000` |
| `CORS_ORIGINS` | JSON Array | **Yes (Prod)** | `["https://ecoroute.vercel.app","http://localhost:3000"]` |
| `CARBON_CACHE_MAX_AGE_SECONDS` | Integer | Optional | `300` (5 minutes) |
| `CARBON_FORECAST_CACHE_MAX_AGE_SECONDS`| Integer | Optional | `1800` (30 minutes) |
| `CARBON_DEFERRAL_MIN_RELATIVE_IMPROVEMENT`| Float | Optional | `0.15` (15% relative improvement for deferral) |

### Frontend Configuration

| Variable | Type | Required | Description / Example |
| :--- | :--- | :--- | :--- |
| `NEXT_PUBLIC_API_URL` | String | **Yes** | Base URL for FastAPI backend (e.g. `https://api.ecoroute.dev`) |

---

## 3. Deployment & Execution Commands

### A. Database Migrations (Alembic)
Run migrations to bring the database schema up to the latest revision:
```bash
# In backend/
uv run alembic upgrade head
```

### B. Seed Canonical Cloud Regions
Populate the 25 global AWS canonical regions with validated Electricity Maps zones and telemetry profiles:
```bash
# In backend/
uv run python -m app.db.seed_cli
```
*(Note: To skip external Electricity Maps zone validation during offline seeding, pass `--no-verify-zones`).*

### C. Backend API Start Command
```bash
# In backend/
uv run uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
```

### D. Standalone Worker Start Command
For high-throughput separated architectures, the worker daemon can run independently:
```bash
# In backend/
uv run python -m app.execution.worker_daemon
```

### E. Frontend Build & Start Commands
```bash
# In frontend/
npm run typecheck
npm run build
npm run start
```

---

## 4. Production Health Checks & Probes

| Endpoint | Method | Purpose | Response Format |
| :--- | :--- | :--- | :--- |
| `/health` or `/api/v1/health` | GET | Comprehensive component status (PostgreSQL, Redis, API) | JSON with `status: healthy\|degraded` |
| `/health/live` | GET | Kubernetes/container liveness probe | `{"status": "alive"}` |
| `/health/ready` | GET | Readiness probe (Returns 503 if configured DB/Redis are down) | `{"ready": true, ...}` |

---

## 5. Smoke Testing & Verification

Run the end-to-end production smoke test to verify all subsystems:
```bash
# In backend/
uv run python scripts/smoke_test.py
```

Check connectivity without mutations:
```bash
# In backend/
uv run python scripts/check_connectivity.py
```

Run test suite:
```bash
# In backend/
uv run pytest
```

---

## 6. Production Hardening Rules

1. **Zero Carbon Fabrication Protection**:
   - `chk_carbon_obs_zero_fabrication` ensures unavailable carbon values are stored strictly as `NULL`. No synthetic values or mock defaults are permitted in production.
2. **Authoritative State Transitions**:
   - Workload and Attempt state machines enforce compare-and-swap (CAS) transitions in PostgreSQL. Redis serves as an ephemeral transport and distributed mutex.
3. **CORS Security**:
   - When `ENVIRONMENT=production`, loopback regex is disabled and requests are restricted to `CORS_ORIGINS`.
4. **Secret Hygiene**:
   - API tokens and database credentials must never be committed to git or exposed in exception payloads.
