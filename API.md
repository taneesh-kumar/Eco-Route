# EcoRoute — REST API Documentation

**API Base URL:** `http://localhost:8000/api/v1`  
**Specification Standard:** OpenAPI 3.1 & RFC 7807 (Problem Details for HTTP APIs)  

---

## 1. Health & Readiness Endpoints

### `GET /api/v1/health`
Detailed component health check for API, PostgreSQL database, and Redis.

**Response `200 OK`:**
```json
{
  "status": "healthy",
  "environment": "development",
  "components": {
    "api": { "status": "operational", "message": "EcoRoute API running" },
    "database": { "status": "connected", "message": "PostgreSQL operational" },
    "redis": { "status": "connected", "message": "Redis operational" }
  }
}
```

### `GET /health/live`
Fast Kubernetes-style liveness probe.

**Response `200 OK`:**
```json
{ "status": "alive" }
```

---

## 2. Workload & Job Management

### `POST /api/v1/jobs`
Submits a new computational workload demand profile.

**Request Body:**
```json
{
  "workload_name": "batch-etl-01",
  "workload_type": "BATCH",
  "cpu_cores": 8,
  "memory_gb": 32,
  "estimated_duration_seconds": 600,
  "priority": 5,
  "deadline_offset_seconds": 1800,
  "max_retries": 3,
  "carbon_weight": 0.6,
  "cost_weight": 0.3,
  "latency_weight": 0.1
}
```

**Response `201 Created`:**
```json
{
  "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "workload_name": "batch-etl-01",
  "workload_type": "BATCH",
  "cpu_demand": 8.0,
  "memory_demand": 32.0,
  "estimated_duration_seconds": 600.0,
  "priority": 5,
  "deadline": "2026-09-17T17:00:00Z",
  "status": "PENDING",
  "current_attempt_count": 0,
  "max_retries": 3,
  "assigned_region_id": null,
  "created_at": "2026-09-17T16:30:00Z",
  "updated_at": "2026-09-17T16:30:00Z"
}
```

### `GET /api/v1/jobs`
List workloads with optional status filtering and pagination.

**Query Parameters:**
- `status` (optional): `PENDING`, `WAITING`, `SCHEDULED`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED`
- `limit` (optional, default 50): 1 to 100
- `offset` (optional, default 0): integer

**Response `200 OK`:**
```json
{
  "items": [...],
  "total": 12,
  "limit": 50,
  "offset": 0
}
```

### `GET /api/v1/jobs/{job_id}`
Retrieves a specific workload by its UUID.

### `POST /api/v1/jobs/{job_id}/cancel`
Cancels a pending, waiting, or scheduled job.

---

## 3. Scheduling & Explainability

### `POST /api/v1/scheduling/evaluate/{job_id}`
Triggers a live multi-objective scheduling evaluation for a workload.

**Response `200 OK`:**
```json
{
  "id": "e3844ff7-3b92-4bef-b014-f45e7b37a04c",
  "job_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "action": "SCHEDULE",
  "selected_region_id": "11111111-2222-3333-4444-555555555555",
  "selected_region_code": "se-sto",
  "rationale": "Region 'se-sto' ranked #1 with lowest composite score C = 0.1420 (Carbon: 45.0 gCO2/kWh, live).",
  "candidate_rankings": [
    {
      "region_id": "11111111-2222-3333-4444-555555555555",
      "region_code": "se-sto",
      "rank": 1,
      "composite_score": 0.142,
      "carbon_intensity_gco2": 45.0,
      "raw_carbon_gco2": 45.0,
      "raw_cost_usd": 0.08,
      "raw_latency_ms": 25.0,
      "norm_carbon": 0.0,
      "norm_cost": 0.2,
      "norm_latency": 0.15,
      "subscore_carbon": 0.0,
      "subscore_cost": 0.06,
      "subscore_latency": 0.015,
      "is_feasible": true,
      "rejection_reason": null
    }
  ],
  "carbon_intensity_gco2": 45.0,
  "carbon_quality": "LIVE",
  "carbon_source": "ELECTRICITY_MAPS",
  "weights": {
    "carbon_weight": 0.6,
    "cost_weight": 0.3,
    "latency_weight": 0.1
  },
  "created_at": "2026-09-17T16:30:05Z"
}
```

### `GET /api/v1/scheduling/job/{job_id}`
Retrieves all historical scheduling decisions and explainability rationale for a workload.

### `GET /api/v1/scheduling/decisions/recent`
Retrieves the most recent scheduling decisions across all workloads.

---

## 4. Execution Attempts

### `GET /api/v1/attempts/job/{job_id}`
Retrieves all execution attempts recorded for a workload.

**Response `200 OK`:**
```json
[
  {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "job_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "attempt_number": 1,
    "region_id": "11111111-2222-3333-4444-555555555555",
    "region_code": "se-sto",
    "status": "COMPLETED",
    "started_at": "2026-09-17T16:30:10Z",
    "completed_at": "2026-09-17T16:40:10Z",
    "energy_kwh": 0.452,
    "carbon_intensity_gco2": 45.0,
    "co2eq_grams": 20.34,
    "error_message": null,
    "created_at": "2026-09-17T16:30:05Z"
  }
]
```

---

## 5. Regional Infrastructure & Carbon Telemetry

### `GET /api/v1/regions`
Retrieves all cloud target regions, capacity limits, power curves, and utilization.

### `GET /api/v1/regions/{code}`
Retrieves details for a specific region code (e.g. `se-sto`, `us-east`).

### `GET /api/v1/carbon/latest`
Retrieves latest verified grid carbon observations with quality tags (`LIVE`, `VALID_CACHE`, `FALLBACK_CACHE`, `UNAVAILABLE`).

---

## 6. Simulation & Benchmarking

### `POST /api/v1/experiments`
Executes a controlled deterministic benchmark across 5 scheduler variants:
`ECOROUTE`, `CONVENTIONAL`, `CARBON_ONLY`, `PERFORMANCE_ONLY`, `RANDOM`.

**Request Body:**
```json
{
  "name": "Validation Benchmark Run",
  "scenario_type": "DEFAULT_GLOBAL_TOPOLOGY",
  "workload_count": 30,
  "random_seed": 42
}
```

### `GET /api/v1/experiments`
Lists historical simulation experiments.

### `GET /api/v1/experiments/{id}/results`
Retrieves quantitative performance metrics and counterfactual carbon savings for all 5 scheduler variants.

---

## 7. Platform Analytics

### `GET /api/v1/analytics/summary`
Retrieves aggregate KPIs, total energy consumed, observed emissions, and carbon savings percentage vs Conventional baseline.
