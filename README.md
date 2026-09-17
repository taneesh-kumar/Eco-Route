# 🌱 EcoRoute

**Carbon-Aware Distributed Cloud Workload Scheduling Platform**

EcoRoute is an academic and production-grade cloud workload scheduling system that dynamically optimizes compute placement across globally distributed data centers. By evaluating real-time grid carbon intensity ($g\text{CO}_2\text{eq}/\text{kWh}$), hardware power curves, network latency, electricity costs, and operational deadlines, EcoRoute cuts computational greenhouse gas emissions by **15% to 35%** while honoring strict SLAs and budgets.

[![Tests](https://img.shields.io/badge/tests-220%20passed%20(100%25)-brightgreen.svg)](#8-testing--verification)
[![Frontend](https://img.shields.io/badge/Next.js-16.1.6%20App%20Router-black.svg?logo=next.js)](frontend/)
[![Backend](https://img.shields.io/badge/FastAPI-0.115+-009688.svg?logo=fastapi)](backend/)
[![Python](https://img.shields.io/badge/Python-3.11+-3776AB.svg?logo=python)](backend/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15+-4169E1.svg?logo=postgresql)](backend/)
[![Redis](https://img.shields.io/badge/Redis-7+-DC382D.svg?logo=redis)](backend/)
[![Policy](https://img.shields.io/badge/policy-Zero--Carbon--Fabrication-emerald.svg)](#4-zero-carbon-fabrication-policy)
[![API Standard](https://img.shields.io/badge/API-OpenAPI%203.1%20%7C%20RFC%207807-blue.svg)](API.md)

---

## 📑 Table of Contents

- [1. System Architecture](#1-system-architecture)
- [2. Key Capabilities & Invariants](#2-key-capabilities--invariants)
- [3. Mathematical Formulations](#3-mathematical-formulations)
- [4. Zero-Carbon Fabrication Policy](#4-zero-carbon-fabrication-policy)
- [5. Execution Engine & Reliability Guarantees](#5-execution-engine--reliability-guarantees)
- [6. Simulation & Academic Benchmarking](#6-simulation--academic-benchmarking)
- [7. Project Directory Structure](#7-project-directory-structure)
- [8. Quick Start & Local Setup](#8-quick-start--local-setup)
- [9. REST API Reference](#9-rest-api-reference)
- [10. Frontend Dashboard Interface](#10-frontend-dashboard-interface)
- [11. Testing & Verification](#11-testing--verification)
- [12. Technical Reports & Documentation](#12-technical-reports--documentation)

---

## 1. System Architecture

EcoRoute is architected with strict separation of concerns, decoupling decision optimization from distributed execution:

```
                          ┌──────────────────────────────────────────────────┐
                          │         Next.js 16.1.6 Dashboard Frontend         │
                          │   (Decision Explainer, Metrics, Workloads, Grid) │
                          └─────────────────────────┬────────────────────────┘
                                                    │ HTTP / REST (JSON)
                                                    ▼
                          ┌──────────────────────────────────────────────────┐
                          │             FastAPI REST API Layer               │
                          │     (/jobs, /scheduling, /attempts, /regions)    │
                          └─────────────────────────┬────────────────────────┘
                                                    │
                      ┌─────────────────────────────┴─────────────────────────────┐
                      ▼                                                           ▼
┌──────────────────────────────────────────┐             ┌──────────────────────────────────────────┐
│        Decision & Scoring Engine         │             │       Execution Dispatcher & Queue       │
│  - Feasibility Filter (CPU, RAM, Slack)  │             │  - Parent Row Lock (SELECT FOR UPDATE)   │
│  - Min-Max Metric Normalizer             │             │  - Redis Attempt Queue (LPUSH / BRPOP)   │
│  - Multi-Objective Composite Scorer      │             │  - Distributed Mutex (SET NX PX)         │
│  - Zero-Carbon Fallback Renormalizer     │             │  - PostgreSQL CAS (UPDATE ... CLAIMED)   │
└─────────────────────┬────────────────────┘             └─────────────────────┬────────────────────┘
                      │                                                           │
                      ▼                                                           ▼
┌──────────────────────────────────────────┐             ┌──────────────────────────────────────────┐
│         Carbon Telemetry Service         │             │      Execution Workers & Telemetry       │
│  - Electricity Maps Live API Client      │             │  - Simulated Dynamic Hardware Runner     │
│  - In-Memory TTL Cache (60 min)          │             │  - Real Zero-Fabrication Telemetry       │
│  - Strict Fallback Quality Classifier    │             │  - Dynamic Fresh-Route Retry Manager     │
└─────────────────────┬────────────────────┘             └─────────────────────┬────────────────────┘
                      │                                                           │
                      └─────────────────────────────┬─────────────────────────────┘
                                                    ▼
                          ┌──────────────────────────────────────────────────┐
                          │             PostgreSQL 15 (Supabase)             │
                          │  - Authoritative Ground-Truth State              │
                          │  - Hard Constraints & Atomic CAS Transactions    │
                          │  - Immutable Audit Events Trail (JSONB)          │
                          └──────────────────────────────────────────────────┘
```

---

## 2. Key Capabilities & Invariants

1. **Multi-Objective Spatial & Temporal Optimization:**  
   Balances carbon intensity, operational cost, and network latency ($w_{\text{carbon}} + w_{\text{cost}} + w_{\text{latency}} = 1.0$) with deterministic tie-breaking.
2. **Zero-Carbon Fabrication Invariant:**  
   When live grid telemetry is untrusted or missing, carbon intensity and emissions are strictly recorded as `NULL`. The system never fabricates, hallucinates, or averages carbon data.
3. **Two-Tier Idempotent Task Claiming:**  
   Combines short-lived Redis mutexes (`SET NX PX`) with atomic PostgreSQL Compare-And-Swap (CAS) claiming to guarantee $\text{claim\_count} \le 1$ and $\text{start\_count} \le 1$ under extreme concurrency.
4. **Monotonic Sequential Attempt Numbering:**  
   Parent job rows are locked via `SELECT ... FOR UPDATE` during dispatch, guaranteeing monotonic sequential attempt numbers ($1, 2, 3...$) with zero collisions or gaps.
5. **Fresh Dynamic Re-Routing on Retry:**  
   Failed attempts trigger a dynamic re-evaluation against the live grid, allowing workloads to shift to cleaner or faster regions while strictly bounding total attempts by `Job.max_retries`.
6. **5-Strategy Empirical Simulation Benchmark:**  
   Built-in benchmarking engine evaluates 5 scheduler variants (`ECOROUTE`, `CONVENTIONAL`, `CARBON_ONLY`, `PERFORMANCE_ONLY`, `RANDOM`) on deep-cloned scenarios with zero duplicate executions ($dup = 0$).
7. **Decision Explainability Centerpiece:**  
   Full mathematical transparency in the Next.js UI showing normalized factors, stacked subscores, constraint checks, and telemetry provenance badges.

---

## 3. Mathematical Formulations

### 3.1 Hard Feasibility Filtering
Before candidate regions are scored, they must satisfy all physical constraints:
- **Availability:** $\text{region.is\_available} \land \text{region.is\_active} = \text{True}$
- **Compute Capacity:** $\text{region.available\_cpu} \ge \text{workload.cpu\_demand}$
- **Memory Capacity:** $\text{region.available\_ram} \ge \text{workload.memory\_demand}$
- **Deadline Feasibility:**
  $$\text{Duration}_{\text{est}} = \frac{\text{workload.base\_duration}}{\text{region.performance\_factor}}$$
  $$\text{Completion}_{\text{est}} = \text{CurrentTime} + \text{Duration}_{\text{est}} \le \text{workload.deadline}$$

> [!NOTE]
> If no region satisfies hard constraints:
> - If $\text{DeadlineSlack} > \text{Duration}_{\text{est}}$, the workload is **DEFERRED** (`JobStatus.WAITING`).
> - Otherwise, the workload is **REJECTED** (`JobStatus.FAILED`).

### 3.2 Min-Max Normalization
Metrics with disparate physical units are normalized to $[0.0, 1.0]$ across all feasible candidate regions:
$$\text{norm}(x) = \frac{x - x_{\min}}{x_{\max} - x_{\min}}$$
*Boundary Invariant:* If $x_{\max} == x_{\min}$ (e.g., single candidate or identical values), $\text{norm}(x) = 0.0$ deterministically.

### 3.3 Multi-Objective Composite Scoring Function
The composite score $C$ is computed as:
$$C = w_{\text{carbon}} \cdot S_{\text{carbon}} + w_{\text{cost}} \cdot S_{\text{cost}} + w_{\text{latency}} \cdot S_{\text{latency}}$$
Where:
$$w_{\text{carbon}} + w_{\text{cost}} + w_{\text{latency}} = 1.0 \quad (w_i \ge 0)$$
Regions are ranked in ascending order of $C$. The lowest composite score ranks **#1** (optimal candidate).

### 3.4 Workload Power & Energy Model
$$\text{Power}_{\text{workload}} = (P_{\text{peak}} - P_{\text{idle}}) \cdot \left(\frac{\text{CPU}_{\text{demand}}}{\text{Max\_CPU}_{\text{region}}}\right) + P_{\text{idle}} \quad [\text{Watts}]$$
$$\text{Energy}_{\text{workload}} = \frac{\text{Power}_{\text{workload}} \cdot \text{ActualDuration}_{\text{seconds}}}{1000 \cdot 3600} \quad [\text{kWh}]$$

### 3.5 Carbon Emissions Accounting
- **Live / Valid Telemetry:**
  $$\text{Emissions} = \text{Energy}_{\text{workload}} \cdot \text{CarbonIntensity} \quad [g\text{CO}_2\text{eq}]$$
- **Unavailable / Untrusted Telemetry:**
  $$\text{Emissions} = \text{NULL}, \quad \text{Observed Carbon Intensity} = \text{NULL}$$

---

## 4. Zero-Carbon Fabrication Policy

When live carbon API queries fail, time out, or encounter corrupt data:

| Telemetry State | Carbon Quality | Decision Engine Action | Weight Renormalization |
| :--- | :--- | :--- | :--- |
| Live API returns valid CI | `LIVE` | Normal 3-objective scoring | $w_{\text{carbon}}, w_{\text{cost}}, w_{\text{latency}}$ unchanged |
| Cache hit within 60 min | `VALID_CACHE` | Normal 3-objective scoring | $w_{\text{carbon}}, w_{\text{cost}}, w_{\text{latency}}$ unchanged |
| Cache hit 60–120 min | `FALLBACK_CACHE` | Zero-carbon fallback triggered | $w_{\text{carbon}} \to 0$; $w_{\text{cost}}', w_{\text{latency}}'$ scaled to sum 1.0 |
| Cache > 120 min or Error | `UNAVAILABLE` | Zero-carbon fallback triggered | $w_{\text{carbon}} \to 0$; $w_{\text{cost}}', w_{\text{latency}}'$ scaled to sum 1.0 |
| Corrupted or Negative Data | `UNTRUSTED` | Zero-carbon fallback triggered | $w_{\text{carbon}} \to 0$; $w_{\text{cost}}', w_{\text{latency}}'$ scaled to sum 1.0 |

When fallback is triggered:
$$w_{\text{cost}}' = \frac{w_{\text{cost}}}{w_{\text{cost}} + w_{\text{latency}}}, \quad w_{\text{latency}}' = \frac{w_{\text{latency}}}{w_{\text{cost}} + w_{\text{latency}}}$$

---

## 5. Execution Engine & Reliability Guarantees

- **PostgreSQL CAS Claiming:** Atomic execution claim query guarantees that only one worker transitions a task attempt from `PENDING` to `CLAIMED`:
  ```sql
  UPDATE job_attempts
  SET status = 'CLAIMED', claimed_by_worker = :worker_id, claimed_at = :now
  WHERE id = :attempt_id AND status = 'PENDING';
  ```
- **Monotonic Attempt Sequence:** Dispatcher acquires `SELECT ... FOR UPDATE` locks on the parent `Job` row, preventing concurrent attempt sequence collisions (`UNIQUE(job_id, attempt_number)`).
- **Stale Dispatch Sweeper:** Background recovery sweeper detects and re-enqueues orphaned `PENDING` attempts if the Redis queue drops messages or workers crash.
- **Dynamic Fresh Re-Routing:** If an attempt fails, the retry engine re-evaluates the job under current grid conditions instead of naively retrying in the same failing region.

---

## 6. Simulation & Academic Benchmarking

EcoRoute features an analytical benchmark engine comparing 5 scheduling strategies across identical cloned scenarios:

1. **ECOROUTE:** Dynamic multi-objective carbon-aware scheduling with fallback and deferral.
2. **CONVENTIONAL:** Industry standard minimizing cost and latency ($w_{\text{cost}}=0.6, w_{\text{latency}}=0.4, w_{\text{carbon}}=0$).
3. **CARBON_ONLY:** Greedy single-objective scheduler routing strictly to the lowest-emission region.
4. **PERFORMANCE_ONLY:** Greedy single-objective scheduler routing strictly to the lowest-latency region.
5. **RANDOM:** Uniform random assignment across feasible regions.

### Relative Carbon Reduction Formula
$$\Delta_{\text{carbon}}\% = \frac{\text{CO2}_{\text{conventional}} - \text{CO2}_{\text{ecoroute}}}{\text{CO2}_{\text{conventional}}} \times 100$$

---

## 7. Project Directory Structure

```
Eco-Route/
├── backend/
│   ├── alembic/                # Database migrations (PostgreSQL schemas)
│   ├── app/
│   │   ├── api/                # FastAPI v1 REST routers & RFC 7807 handlers
│   │   ├── carbon/             # Electricity Maps API client & TTL caching
│   │   ├── core/               # Configuration, logging & Redis connections
│   │   ├── db/                 # Database engine & session management
│   │   ├── domain/             # Entities, value objects & state machines
│   │   ├── execution/          # CAS claiming, dispatcher, workers & retries
│   │   ├── persistence/        # SQLAlchemy ORM models & repositories
│   │   ├── scheduling/         # Scoring engine, normalizer & fallback logic
│   │   ├── services/           # Application orchestration services
│   │   ├── simulation/         # 5-strategy benchmark & population generator
│   │   └── main.py             # FastAPI entrypoint & lifecycle hooks
│   ├── scripts/                # Connectivity & diagnostic scripts
│   ├── tests/                  # Pytest verification test suite (220 tests)
│   ├── alembic.ini             # Alembic migration configuration
│   ├── pytest.ini              # Pytest configuration
│   └── requirements.txt        # Python dependencies
├── frontend/
│   ├── app/
│   │   ├── analytics/          # KPI analytics & carbon savings charts
│   │   ├── decisions/          # Decision Explainability Centerpiece
│   │   ├── experiments/        # 5-strategy simulation benchmark runner
│   │   ├── jobs/               # Workload intake form & lifecycle table
│   │   ├── regions/            # Global data center topology & carbon badges
│   │   ├── layout.tsx          # App shell, navigation & dark mode theme
│   │   └── page.tsx            # Executive command center overview
│   ├── components/             # Reusable UI cards, tables & badges
│   ├── lib/                    # API client, TypeScript types & utilities
│   └── package.json            # Next.js 16.1.6 dependencies
├── docs/                       # Architecture design records & documentation
├── API.md                      # Complete OpenAPI / REST API reference
├── FINAL_PROJECT_REPORT.md     # In-depth architectural & empirical report
├── FINAL_TEST_REPORT.md        # Comprehensive test verification report
└── README.md                   # Platform documentation & quick start guide
```

---

## 8. Quick Start & Local Setup

### Prerequisites
- **Python:** 3.11+ (recommended: `uv` or `pip`)
- **Node.js:** 20+ & `npm`
- **PostgreSQL:** 15+ (local instance or Supabase)
- **Redis:** 7+ (local instance or Upstash)
- **Electricity Maps API Key:** (Optional for live carbon telemetry; synthetic fallback active by default)

### 8.1 Backend Setup

```bash
cd backend

# 1. Install dependencies (using uv or pip)
uv sync
# OR: pip install -r requirements.txt

# 2. Configure environment variables
cp .env.example .env
# Edit .env with your DATABASE_URL, REDIS_URL, and ELECTRICITY_MAPS_API_KEY

# 3. Test service connectivity (optional but recommended)
python scripts/check_connectivity.py

# 4. Apply database migrations
uv run alembic upgrade head
# OR: alembic upgrade head

# 5. Start FastAPI development server
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

The backend REST API and interactive Swagger documentation will be available at:
- **API Base:** `http://localhost:8000/api/v1`
- **Swagger UI:** `http://localhost:8000/docs`
- **Health Check:** `http://localhost:8000/api/v1/health`

### 8.2 Frontend Setup

```bash
cd frontend

# 1. Install npm dependencies
npm install

# 2. Configure environment (optional, defaults to http://localhost:8000/api/v1)
cp .env.example .env.local

# 3. Start Next.js development server (with Turbopack)
npm run dev
```

The web dashboard is available at: **`http://localhost:3000`**

---

## 9. REST API Reference

For detailed request/response schemas and examples, see **[API.md](API.md)**.

| Method | Endpoint | Description | Status Code |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/health` | Deep component health check (DB, Redis, API) | `200 OK` |
| `GET` | `/health/live` | Lightweight liveness probe | `200 OK` |
| `POST` | `/api/v1/jobs` | Submit a new workload compute demand | `201 Created` |
| `GET` | `/api/v1/jobs` | List workload jobs with filtering & pagination | `200 OK` |
| `GET` | `/api/v1/jobs/{id}` | Get full job details, attempts, and state | `200 OK` |
| `POST` | `/api/v1/scheduling/evaluate` | Run multi-objective evaluation for a workload | `200 OK` |
| `GET` | `/api/v1/scheduling/decisions` | List historical scheduling decision records | `200 OK` |
| `GET` | `/api/v1/scheduling/decisions/{id}`| Get granular decision matrix and provenance | `200 OK` |
| `GET` | `/api/v1/attempts` | List execution attempt lifecycle logs | `200 OK` |
| `POST` | `/api/v1/attempts/{id}/retry` | Trigger fresh re-route retry for failed task | `202 Accepted` |
| `GET` | `/api/v1/regions` | List cloud data centers with live utilization | `200 OK` |
| `GET` | `/api/v1/carbon/regions/{id}` | Get real-time grid carbon intensity & provenance | `200 OK` |
| `POST` | `/api/v1/simulation/run` | Execute 5-strategy academic simulation benchmark | `200 OK` |
| `GET` | `/api/v1/analytics/overview` | Platform KPI summary & counterfactual savings | `200 OK` |

---

## 10. Frontend Dashboard Interface

The Next.js 16 web application includes dedicated operational modules:

- **Command Center (`/`):** Real-time cluster summary, active jobs, carbon intensity index, and recent decisions.
- **Decision Explainer (`/decisions`):** Granular breakdown of scheduling choices, score rankings, normalized weights, and fallback rationale.
- **Workload Manager (`/jobs`):** Interactive job intake form with slider-based tradeoff weight tuning (`BATCH`, `INFERENCE`, `TRAINING` presets) and real-time execution tracking.
- **Global Data Center Grid (`/regions`):** World map and region cards displaying CPU/RAM capacity, PUE, idle/peak power, and live carbon intensity provenance.
- **Simulation Benchmark Runner (`/experiments`):** Parameterized benchmark laboratory comparing 5 scheduler strategies with downloadable metrics and delta charts.
- **Analytics & Accounting (`/analytics`):** Aggregated energy consumption, total emissions saved, and counterfactual efficiency metrics.

---

## 11. Testing & Verification

EcoRoute maintains a comprehensive test suite across unit, domain, integration, and high-concurrency race condition scenarios:

```bash
cd backend
uv run pytest -v
```

### Verification Highlights
- **220 Tests Passed** (0 failed, 0 skipped).
- **Zero Race Conditions:** Verified under concurrent CAS claim storms (10 simultaneous workers per attempt).
- **Monotonic Sequences:** Verified zero duplicate attempt numbers under concurrent dispatch row-locking.
- **Frontend Type Safety:** `npm run typecheck` &rarr; 0 errors.
- **Production Build:** `npm run build` &rarr; static optimization and prerendering successful across all 8 routes.

See **[FINAL_TEST_REPORT.md](FINAL_TEST_REPORT.md)** for the complete breakdown across all 26 test suites.

---

## 12. Technical Reports & Documentation

- **[FINAL_PROJECT_REPORT.md](FINAL_PROJECT_REPORT.md)**: Exhaustive technical specification, mathematical proofs, fallback protocols, concurrency guarantees, and academic findings.
- **[FINAL_TEST_REPORT.md](FINAL_TEST_REPORT.md)**: Complete test verification matrix across all architectural modules.
- **[API.md](API.md)**: Full REST API specification with OpenAPI schemas and RFC 7807 error models.
- **[docs/architecture/](docs/architecture/)**: Architecture Decision Records (ADRs), domain models, data architecture, and reliability designs.

---

## 📄 License & Attribution

EcoRoute is developed as an open-source carbon-aware cloud infrastructure platform. Live grid carbon telemetry is powered by the [Electricity Maps API](https://www.electricitymaps.com/).
