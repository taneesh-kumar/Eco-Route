# Database Design

This document defines the logical schema, constraints, state persistence, atomic claiming mechanisms, and transactional boundaries for EcoRoute in Supabase PostgreSQL (SQLAlchemy 2.0).

---

## 1. Persistence Architecture

* **Database Engine**: PostgreSQL 16+ (Supabase)
* **ORM**: SQLAlchemy 2.0 (AsyncIO)
* **Authority**: PostgreSQL is the single durable source of truth. Redis serves as transient operational support (carbon observation cache, speed locks, and dispatch queues). Redis failures never destroy system state.

---

## 2. Entity-Relationship Diagram

```mermaid
erDiagram
    jobs ||--o{ job_attempts : "has many"
    jobs ||--o{ scheduling_decisions : "evaluated by"
    jobs ||--o{ audit_events : "traces"
    regions ||--o{ job_attempts : "executes on"
    regions ||--o{ carbon_observations : "records"
    regions ||--o{ scheduling_decisions : "selected in"
    experiments ||--o{ experiment_results : "produces"

    jobs {
        uuid id PK
        varchar workload_name
        varchar workload_type
        numeric cpu_demand
        numeric memory_demand
        numeric base_execution_duration
        integer priority
        timestamp deadline
        varchar status
        integer current_attempt_count
        integer max_retries
        timestamp created_at
        timestamp updated_at
    }

    job_attempts {
        uuid id PK
        uuid job_id FK
        integer attempt_number
        uuid region_id FK
        varchar status
        varchar claimed_by_worker
        timestamp claimed_at
        timestamp started_at
        timestamp completed_at
        numeric actual_duration
        numeric actual_energy_kwh
        numeric actual_co2eq_grams
        text error_message
        timestamp created_at
        timestamp updated_at
    }

    regions {
        uuid id PK
        varchar code UK
        varchar name
        varchar provider
        varchar country
        numeric latitude
        numeric longitude
        numeric max_cpu_capacity
        numeric max_memory_capacity
        numeric current_utilization
        numeric performance_factor
        numeric idle_power_watts
        numeric peak_power_watts
        numeric network_latency_ms
        boolean is_available
        boolean is_active
        timestamp created_at
        timestamp updated_at
    }

    carbon_observations {
        uuid id PK
        uuid region_id FK
        numeric carbon_intensity
        varchar source
        varchar data_quality
        timestamp observation_timestamp
        timestamp received_timestamp
        timestamp valid_until
        timestamp recorded_at
    }

    scheduling_decisions {
        uuid id PK
        uuid job_id FK
        uuid attempt_id FK
        uuid selected_region_id FK
        varchar decision_action
        numeric cost_score_jr
        numeric estimated_energy_kwh
        numeric estimated_co2eq_grams
        varchar carbon_source_used
        varchar carbon_quality_used
        text decision_reason
        jsonb score_breakdown
        jsonb candidate_rankings
        jsonb applied_weights
        jsonb normalization_factors
        timestamp created_at
    }

    experiments {
        uuid id PK
        varchar name
        varchar scheduler_variant
        integer random_seed
        varchar scenario_type
        jsonb workload_configuration
        jsonb region_configuration
        varchar status
        timestamp started_at
        timestamp completed_at
        timestamp created_at
    }

    experiment_results {
        uuid id PK
        uuid experiment_id FK
        varchar scheduler_algorithm
        numeric total_energy_kwh
        numeric total_co2eq_grams
        numeric avg_execution_time_seconds
        numeric avg_latency_ms
        numeric deadline_compliance_rate
        numeric failure_rate
        numeric retry_rate
        integer duplicate_execution_count
        numeric deferral_rate
        numeric avg_region_utilization
        jsonb detailed_metrics
        timestamp created_at
    }

    audit_events {
        uuid id PK
        uuid job_id FK
        uuid attempt_id FK
        varchar event_type
        varchar actor
        jsonb event_metadata
        timestamp event_timestamp
        timestamp created_at
    }
```

---

## 3. Logical Table Specifications

### 3.1 `jobs` (Logical Workload Lifecycle)
| Column | Type | Nullable | Default / Constraints |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | Primary Key (`gen_random_uuid()`) |
| `workload_name` | `VARCHAR(255)` | No | Workload identifier |
| `workload_type` | `VARCHAR(100)` | No | `BATCH`, `INFERENCE`, `TRAINING` |
| `cpu_demand` | `NUMERIC(8,2)` | No | Cores required ($> 0$) |
| `memory_demand` | `NUMERIC(10,2)` | No | RAM in GB required ($> 0$) |
| `base_execution_duration` | `NUMERIC(10,2)` | No | Base duration in seconds ($T_{\text{base}} > 0$) |
| `priority` | `INTEGER` | No | Priority level ($1 \le P \le 10$) |
| `deadline` | `TIMESTAMPTZ` | No | SLA deadline timestamp |
| `status` | `VARCHAR(50)` | No | `'PENDING'`, `'EVALUATING'`, `'WAITING'`, `'DISPATCHED'`, `'RUNNING'`, `'COMPLETED'`, `'FAILED'` |
| `current_attempt_count` | `INTEGER` | No | `0` ($\ge 0$) |
| `max_retries` | `INTEGER` | No | `3` ($\ge 0$) |
| `created_at` / `updated_at` | `TIMESTAMPTZ` | No | `CURRENT_TIMESTAMP` |

---

### 3.2 `job_attempts` (Region-Locked Execution Runs)
| Column | Type | Nullable | Default / Constraints |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | Primary Key (`gen_random_uuid()`) |
| `job_id` | `UUID` | No | FK $\to$ `jobs(id)` ON DELETE CASCADE |
| `attempt_number` | `INTEGER` | No | `1` ($\ge 1$) |
| `region_id` | `UUID` | No | FK $\to$ `regions(id)` (Locked for attempt run) |
| `status` | `VARCHAR(50)` | No | `'PENDING'`, `'CLAIMED'`, `'RUNNING'`, `'COMPLETED'`, `'FAILED'` |
| `claimed_by_worker` | `VARCHAR(255)` | Yes | Identifier of claiming worker |
| `claimed_at` / `started_at` / `completed_at` | `TIMESTAMPTZ` | Yes | Timestamps of execution lifecycle |
| `actual_duration` | `NUMERIC(10,2)` | Yes | Simulated runtime in seconds |
| `actual_energy_kwh` | `NUMERIC(12,6)` | Yes | Simulated energy consumption |
| `actual_co2eq_grams` | `NUMERIC(12,4)` | Yes | Simulated carbon emissions |
| `error_message` | `TEXT` | Yes | Failure forensics snippet |
| `created_at` / `updated_at` | `TIMESTAMPTZ` | No | `CURRENT_TIMESTAMP` |

* **Constraint**: `UNIQUE(job_id, attempt_number)`

---

### 3.3 `regions` (Simulated Regional Hardware Models)
| Column | Type | Nullable | Default / Constraints |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | Primary Key (`gen_random_uuid()`) |
| `code` | `VARCHAR(50)` | No | `UNIQUE` region code (e.g., `aws-us-east-1`) |
| `name` / `provider` / `country` | `VARCHAR` | No | Region metadata (`AWS`, `AZURE`, `GCP`) |
| `latitude` / `longitude` | `NUMERIC(9,6)` | No | Geographic coordinates |
| `max_cpu_capacity` / `max_memory_capacity` | `NUMERIC` | No | Total simulated resource capacity ($> 0$) |
| `current_utilization` | `NUMERIC(5,4)` | No | Simulated utilization ($0.0 \le U \le 1.0$) |
| `performance_factor` | `NUMERIC(6,4)` | No | Multiplier relative to base ($> 0$) |
| `idle_power_watts` / `peak_power_watts` | `NUMERIC(8,2)` | No | Baseline & peak power draw ($P_{\text{peak}} \ge P_{\text{idle}} \ge 0$) |
| `network_latency_ms` | `NUMERIC(8,2)` | No | Baseline latency ($L_r \ge 0$) |
| `is_available` / `is_active` | `BOOLEAN` | No | `TRUE` |
| `created_at` / `updated_at` | `TIMESTAMPTZ` | No | `CURRENT_TIMESTAMP` |

---

### 3.4 `carbon_observations` (Historical Grid Carbon Records)
| Column | Type | Nullable | Default / Constraints |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | Primary Key (`gen_random_uuid()`) |
| `region_id` | `UUID` | No | FK $\to$ `regions(id)` ON DELETE CASCADE |
| `carbon_intensity` | `NUMERIC(8,2)` | Yes | Intensity in $g\text{CO}_2\text{eq}/\text{kWh}$ (NULL if UNAVAILABLE) |
| `source` | `VARCHAR(100)` | No | `ELECTRICITY_MAPS`, `REGIONAL_PROFILE` |
| `data_quality` | `VARCHAR(50)` | No | `'LIVE'`, `'CACHED'`, `'UNAVAILABLE'` |
| `observation_timestamp` / `valid_until` | `TIMESTAMPTZ` | No | Observation measurement and TTL boundaries |
| `received_timestamp` / `recorded_at` | `TIMESTAMPTZ` | No | `CURRENT_TIMESTAMP` |

> **Zero Fabrication Rule**: Missing carbon data is stored as `NULL` with `data_quality = 'UNAVAILABLE'`. Numerical values are never synthesized.

---

### 3.5 `scheduling_decisions` (Explainable Placement Records)
| Column | Type | Nullable | Default / Constraints |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | Primary Key (`gen_random_uuid()`) |
| `job_id` | `UUID` | No | FK $\to$ `jobs(id)` ON DELETE CASCADE |
| `attempt_id` | `UUID` | Yes | FK $\to$ `job_attempts(id)` (NULL if deferred/rejected) |
| `selected_region_id` | `UUID` | Yes | FK $\to$ `regions(id)` (Winning region) |
| `decision_action` | `VARCHAR(50)` | No | `'EXECUTE'`, `'DEFER'`, `'REJECT'` |
| `cost_score_jr` | `NUMERIC(8,6)` | Yes | Winning composite score $J_r$ |
| `estimated_energy_kwh` / `estimated_co2eq_grams` | `NUMERIC` | Yes | Modeled energy ($E_r$) and emissions ($C_r$) |
| `carbon_source_used` / `carbon_quality_used` | `VARCHAR` | No | Carbon provenance metadata |
| `decision_reason` | `TEXT` | No | Explanation of placement or deferral |
| `score_breakdown` | `JSONB` | No | `{"carbon_subscore": float, "time_subscore": float, "utilization_subscore": float, "latency_subscore": float, "total_jr": float}` |
| `candidate_rankings` | `JSONB` | No | Ranked candidate array `[{"rank": 1, "region_id": uuid, "jr_score": float}]` |
| `applied_weights` | `JSONB` | No | Configured weights `{"w_C": 0.4, "w_T": 0.3, "w_U": 0.2, "w_L": 0.1}` ($\sum w = 1.0$) |
| `normalization_factors` | `JSONB` | No | Min/Max bounds used for feature scaling |
| `created_at` | `TIMESTAMPTZ` | No | `CURRENT_TIMESTAMP` |

---

### 3.6 `experiments` & `experiment_results` (Benchmark Evaluation)
* **`experiments`**: Defines configuration harnesses (`name`, `scheduler_variant` $\in \{$`CONVENTIONAL`, `RANDOM`, `CARBON_ONLY`, `PERFORMANCE_ONLY`, `ECOROUTE`$\}$, `random_seed`, `scenario_type`, `workload_configuration`, `region_configuration`, `status`).
* **`experiment_results`**: Persists aggregate evaluation metrics (`total_energy_kwh`, `total_co2eq_grams`, `avg_execution_time_seconds`, `avg_latency_ms`, `deadline_compliance_rate`, `failure_rate`, `retry_rate`, `duplicate_execution_count`, `deferral_rate`, `detailed_metrics`).

---

### 3.7 `audit_events` (Immutable Event Ledger)
* Records system events (`JOB_CREATED`, `DECISION_MADE`, `REGION_REJECTED`, `JOB_DEFERRED`, `ATTEMPT_CREATED`, `ATTEMPT_CLAIMED`, `EXECUTION_STARTED`, `EXECUTION_COMPLETED`, `EXECUTION_FAILED`, `RETRY_CREATED`).
* Schema: `id` (PK), `job_id` (FK), `attempt_id` (FK), `event_type`, `actor`, `event_metadata` (`JSONB`), `event_timestamp`, `created_at`.

---

## 4. State Persistence & Atomic Claim Mechanics

### 4.1 State Machine Persistence
* **Job Lifecycle (`jobs.status`)**: `PENDING` $\to$ `EVALUATING` $\to$ `WAITING` / `DISPATCHED` $\to$ `RUNNING` $\to$ `COMPLETED` / `FAILED`.
* **Attempt Lifecycle (`job_attempts.status`)**: `PENDING` $\to$ `CLAIMED` $\to$ `RUNNING` $\to$ `COMPLETED` / `FAILED`.

### 4.2 PostgreSQL-Enforced Atomic Claim
To guarantee exactly-once execution per attempt across concurrent workers:
```sql
UPDATE job_attempts 
SET status = 'CLAIMED', 
    claimed_by_worker = :worker_id, 
    claimed_at = CURRENT_TIMESTAMP 
WHERE id = :attempt_id AND status = 'PENDING';
```
* **Rows Affected = 1**: Worker secured claim; transitions job to `RUNNING` and executes.
* **Rows Affected = 0**: Duplicate task; worker safely drops message as a no-op.

---

## 5. Index Strategy & Transactional Boundaries

| Table | Index Columns | Supported Access Pattern |
| :--- | :--- | :--- |
| `jobs` | `(status, deadline)` | Polling evaluating jobs ordered by urgency |
| `job_attempts` | `(job_id, attempt_number)` | Unique constraint; fast per-job attempt lookups |
| `regions` | `(code)` / `(is_available, is_active)` | Unique lookup / candidate discovery filtering |
| `carbon_observations` | `(region_id, observation_timestamp DESC)` | Latest carbon observation retrieval |
| `scheduling_decisions`| `(job_id, created_at DESC)` | Job decision history & UI explanations |
| `audit_events` | `(job_id, event_timestamp DESC)` | Historical workload auditing |

### Transaction Invariants
* **Intake**: `INSERT jobs` + `INSERT audit_events` atomically.
* **Decision & Dispatch**: `INSERT scheduling_decisions` + `UPDATE jobs (DISPATCHED)` + `INSERT job_attempts (PENDING)` + `INSERT audit_events` atomically.
* **Atomic Claim**: Conditional `UPDATE job_attempts (CLAIMED)` + `UPDATE jobs (RUNNING)` atomically.
* **Completion**: `UPDATE job_attempts (COMPLETED)` + `UPDATE jobs (COMPLETED)` + `INSERT audit_events` atomically.
