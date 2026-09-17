# 🌱 EcoRoute

**Carbon-Aware Cloud Workload Scheduler Platform**

EcoRoute is an academic and production-grade cloud workload scheduling system that optimizes workload placement across globally distributed cloud regions. It dynamically balances grid carbon intensity ($g\text{CO}_2\text{eq}/\text{kWh}$), operational deadlines, capacity utilization, compute costs, and network latency.

[![Tests](https://img.shields.io/badge/tests-210%20passed-brightgreen.svg)](#testing--verification)
[![Frontend](https://img.shields.io/badge/next.js-16.1.6-black.svg)](frontend/)
[![Backend](https://img.shields.io/badge/fastapi-0.115+-blue.svg)](backend/)
[![Zero-Carbon-Fabrication](https://img.shields.io/badge/policy-zero--carbon--fabrication-emerald.svg)](#zero-carbon-fabrication-policy)

---

## 1. System Architecture

```
                          ┌────────────────────────────────────────┐
                          │   Next.js 16.1.6 Dashboard Frontend     │
                          │   (Decision Explainer, Metrics, Admin) │
                          └───────────────────┬────────────────────┘
                                              │ HTTP / REST
                                              ▼
                          ┌────────────────────────────────────────┐
                          │         FastAPI REST API Layer         │
                          │ (/jobs, /scheduling, /attempts, etc.)  │
                          └───────────────────┬────────────────────┘
                                              │
                    ┌─────────────────────────┴─────────────────────────┐
                    ▼                                                   ▼
┌────────────────────────────────────────┐             ┌────────────────────────────────────────┐
│         Decision & Scoring Engine      │             │        Execution Dispatcher & Queue    │
│  - Feasibility Filter (CPU, RAM, Slack)│             │  - Parent Row Lock (FOR UPDATE)        │
│  - Min-Max Normalizer                  │             │  - Redis Attempt Queue (LPUSH/BRPOP)   │
│  - Multi-Objective Composite Scorer    │             │  - Distributed Mutex (SET NX PX)       │
│  - Zero-Carbon Fallback Renormalizer   │             │  - PostgreSQL CAS (UPDATE ... CLAIMED) │
└───────────────────┬────────────────────┘             └───────────────────┬────────────────────┘
                    │                                                   │
                    ▼                                                   ▼
┌────────────────────────────────────────┐             ┌────────────────────────────────────────┐
│      Carbon Telemetry Service          │             │     Execution Workers & Telemetry      │
│  - Electricity Maps Live API Client    │             │  - Simulated Dynamic Hardware Runner   │
│  - In-Memory TTL Cache (60 min)        │             │  - Real Zero-Fabrication Telemetry     │
│  - Strict Zero-Fabrication Fallback    │             │  - Fresh-Route Retry Manager           │
└───────────────────┬────────────────────┘             └───────────────────┬────────────────────┘
                    │                                                   │
                    └─────────────────────────┬─────────────────────────┘
                                              ▼
                          ┌────────────────────────────────────────┐
                          │         PostgreSQL 15 (Supabase)       │
                          │  - Authoritative System State          │
                          │  - Hard Constraints & Partial Indexes  │
                          │  - Immutable Audit Events Trail        │
                          └────────────────────────────────────────┘
```

---

## 2. Key Capabilities & Invariants

1. **Multi-Objective Composite Optimization:**
   $$C = w_{\text{carbon}} \cdot S_{\text{carbon}} + w_{\text{cost}} \cdot S_{\text{cost}} + w_{\text{latency}} \cdot S_{\text{latency}}$$
   Evaluates all feasible candidate data centers and ranks them with mathematical explainability.
2. **Zero-Carbon Fabrication Policy:**
   When live grid telemetry is untrusted or unavailable, carbon intensity is set to `NULL` and emissions are recorded as `NULL`. The system never fabricates or hallucinates carbon data.
3. **PostgreSQL-Authoritative CAS Claiming:**
   Two-tier locking (short-lived Redis mutex + atomic PostgreSQL CAS) guarantees strictly idempotent task execution ($\text{claim\_count} \le 1, \text{start\_count} \le 1$).
4. **Row-Locked Monotonic Attempt Numbering:**
   Parent job rows are locked via `SELECT ... FOR UPDATE` during dispatch, guaranteeing monotonic sequential attempt numbers ($1, 2, 3...$) without collisions or gaps under high concurrency.
5. **Fresh Dynamic Re-Routing on Retry:**
   Failed attempts trigger a dynamic re-evaluation against the live grid, allowing workloads to shift to cleaner or faster regions. Total attempt budget is strictly bounded by `Job.max_retries`.
6. **5-Strategy Simulation Benchmark:**
   Empirical benchmarking evaluates 5 scheduler variants (`ECOROUTE`, `CONVENTIONAL`, `CARBON_ONLY`, `PERFORMANCE_ONLY`, `RANDOM`) on deep-cloned scenarios with zero duplicate executions ($dup = 0$).
7. **Next.js 16.1.6 Decision Explainability Center:**
   Visualizes the complete ranking matrix, raw metrics, normalized factors, stacked subscores, and carbon provenance for every scheduling decision.

---

## 3. Quick Start & Local Setup

### Prerequisites
- Python 3.11+
- Node.js 20+ & npm
- PostgreSQL (or Supabase instance)
- Redis (or Upstash instance)

### Backend Setup
```bash
cd backend

# Install dependencies (using uv or pip)
uv sync

# Configure environment variables
cp .env.example .env
# Edit .env with your DATABASE_URL, REDIS_URL, and ELECTRICITY_MAPS_API_KEY

# Run database migrations
uv run alembic upgrade head

# Run backend API server
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Frontend Setup
```bash
cd frontend

# Install dependencies
npm install

# Run development server
npm run dev
# Open http://localhost:3000 in your browser
```

---

## 4. Testing & Verification

EcoRoute contains an extensive test suite verifying domain rules, state machines, constraints, concurrency, and simulation:

```bash
cd backend
uv run pytest -v
```

**Test Results:**
- **210 tests passed**, 0 failed, 0 skipped in 54.49s.
- TypeScript typecheck: `npm run typecheck` &rarr; 0 errors.
- Production build: `npm run build` &rarr; successful prerendering of all routes.

See [FINAL_TEST_REPORT.md](FINAL_TEST_REPORT.md) for the complete breakdown.

---

## 5. Documentation & Technical Reports

- **[FINAL_PROJECT_REPORT.md](FINAL_PROJECT_REPORT.md)**: Comprehensive architectural specification, mathematical formulas, fallback protocols, concurrency guarantees, and known limitations.
- **[FINAL_TEST_REPORT.md](FINAL_TEST_REPORT.md)**: Authoritative test execution results across all 26 test files.
- **[API.md](API.md)**: Complete REST API documentation for all endpoints, request schemas, and responses.
