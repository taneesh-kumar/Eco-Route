# API Contract Design

This document defines the HTTP REST boundary and communication protocols between the Next.js frontend and the FastAPI modular monolith backend.

---

## 1. Boundary Architecture & Principles

```text
Next.js 16 Presentation Tier (Browser / Server Components)
               │
               │ HTTPS / JSON REST
               ▼
FastAPI Application Tier (Pydantic Validation Boundary)
   ├── /api/v1/jobs
   ├── /api/v1/scheduling
   ├── /api/v1/attempts
   ├── /api/v1/regions
   ├── /api/v1/carbon
   ├── /api/v1/analytics
   └── /api/v1/experiments
```

### Core API Design Principles
1. **Frontend Isolation**: The Next.js client connects strictly via authenticated FastAPI REST endpoints; direct database (PostgreSQL) or cache (Redis) connections from the frontend are prohibited.
2. **Layered Validation**: API schema validation (via Pydantic) handles data types, bounds, and payload formatting. Business and scheduling validation (capacity, deadlines, feasibility) is executed solely inside the Scheduling Domain.
3. **Stateless Operations**: All requests pass complete context or resource identifiers; execution state is durably persisted in PostgreSQL.
4. **Error Format**: Standardized RFC 7807 problem details JSON format (`{"type": string, "title": string, "status": int, "detail": string, "errors": list}`).

---

## 2. Resource Groups & Contracts

### 2.1 Jobs Resource Group
* **Responsibilities**: Workload submission, job lifecycle inspection, and job cancellation.
* **Operations**:
  * `POST /jobs`: Ingests workload parameters (CPU, RAM, base duration, priority, deadline); validates and creates `Job` in `PENDING` state.
  * `GET /jobs`: Lists workloads with pagination and status filters (`PENDING`, `EVALUATING`, `WAITING`, `DISPATCHED`, `RUNNING`, `COMPLETED`, `FAILED`).
  * `GET /jobs/{job_id}`: Returns complete job metadata, current attempt count, and status.
  * `POST /jobs/{job_id}/cancel`: Safely cancels an active or waiting job.

### 2.2 Scheduling Resource Group
* **Responsibilities**: Exposing scheduling evaluations, explainable $J_r$ score breakdowns, and regional candidate rankings.
* **Operations**:
  * `GET /scheduling/decisions/{decision_id}`: Retrieves full decision record including winning region, action (`EXECUTE` / `DEFER`), sub-scores ($N(E_r \times CI_r)$, $N(T_r)$, $N(U_r)$, $N(L_r)$), weights, and full candidate rankings.
  * `GET /jobs/{job_id}/decision`: Retrieves the latest scheduling decision for a given workload.

### 2.3 Attempts Resource Group
* **Responsibilities**: Inspecting region-locked execution runs, forensic failure data, and execution telemetry.
* **Operations**:
  * `GET /jobs/{job_id}/attempts`: Lists all attempts associated with a logical workload.
  * `GET /attempts/{attempt_id}`: Retrieves single attempt execution telemetry (actual duration, actual energy kWh, emissions, locked region ID, worker ID, failure error message).

### 2.4 Regions Resource Group
* **Responsibilities**: Exposing simulated regional topology, active capacity, and live utilization for UI map visualization.
* **Operations**:
  * `GET /regions`: Returns list of all logical regions (provider, coordinates, capacity, baseline power draw specs, latency).
  * `GET /regions/{region_id}/state`: Returns real-time simulated capacity utilization ($U_r$) and operational health flags.

### 2.5 Carbon Resource Group
* **Responsibilities**: Exposing real-time and cached grid carbon observations, data quality flags, and forecast trends.
* **Operations**:
  * `GET /carbon/regions/{region_id}/current`: Returns current observation ($g\text{CO}_2\text{eq}/\text{kWh}$), observation timestamp, validity window, and quality status (`LIVE`, `CACHED`, `UNAVAILABLE`).

### 2.6 Analytics Resource Group
* **Responsibilities**: Serving historical carbon reduction KPIs, counterfactual comparison summaries, and audit logs.
* **Operations**:
  * `GET /analytics/summary`: Returns aggregate carbon savings percentage, total kWh consumed, mean latency, and deadline compliance rate.
  * `GET /analytics/audit-events`: Returns paginated, immutable audit trail records with entity and timestamp filters.

### 2.7 Experiments Resource Group
* **Responsibilities**: Creating, initiating, and inspecting controlled academic scheduling benchmark runs.
* **Operations**:
  * `POST /experiments`: Ingests experiment harness configuration (seed, scenario, workload batch, scheduler variant).
  * `GET /experiments/{experiment_id}`: Returns experiment execution status.
  * `GET /experiments/{experiment_id}/results`: Returns comparative benchmark metrics across baseline schedulers (`CONVENTIONAL`, `RANDOM`, `CARBON_ONLY`, `PERFORMANCE_ONLY`, `ECOROUTE`).
