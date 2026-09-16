# Data Architecture

This document defines the relational data model, state machines, and persistence boundaries for EcoRoute.

---

## 1. Storage Tier Separation

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        PostgreSQL Database                            │
│  - Durable Source of Truth (ACID Transactions & Foreign Keys)          │
│  - Stores: Jobs, Job Attempts, Decisions, Regions, Audits, Experiments │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
┌──────────────────────────────────┴─────────────────────────────────────┐
│                           Redis Cache & Broker                         │
│  - Short-Lived Carbon Observations (TTL Caching)                       │
│  - Distributed Mutex Locks for Atomic Attempt Claims (SET NX PX)       │
│  - Transient Deferral Signals & Dispatch Queues                        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Core Relational Schema (PostgreSQL)

```mermaid
erDiagram
    JOBS ||--o{ JOB_ATTEMPTS : "has many"
    JOBS ||--o{ SCHEDULING_DECISIONS : "evaluated by"
    REGIONS ||--o{ JOB_ATTEMPTS : "executes on"
    REGIONS ||--o{ CARBON_OBSERVATIONS : "records"
    EXPERIMENTS ||--o{ EXPERIMENT_RESULTS : "produces"
    SCHEDULING_DECISIONS ||--o{ AUDIT_RECORDS : "traces"

    JOBS {
        uuid id PK
        string workload_name
        string workload_type
        float cpu_demand
        float memory_demand
        float base_execution_duration
        int priority
        timestamp deadline
        string status
        int current_attempt_count
        int max_retries
        timestamp created_at
    }

    JOB_ATTEMPTS {
        uuid id PK
        uuid job_id FK
        int attempt_number
        uuid region_id FK
        string status
        string claimed_by_worker
        timestamp started_at
        timestamp completed_at
        float actual_duration
        float actual_energy_kwh
        float actual_co2eq_grams
        string error_message
    }

    REGIONS {
        uuid id PK
        string code UK
        string name
        string provider
        float max_cpu_capacity
        float max_memory_capacity
        float current_utilization
        float idle_power_watts
        float peak_power_watts
        float network_latency_ms
        boolean is_available
    }

    CARBON_OBSERVATIONS {
        uuid id PK
        uuid region_id FK
        float carbon_intensity
        string source
        string data_quality
        timestamp observation_timestamp
        timestamp valid_until
    }

    SCHEDULING_DECISIONS {
        uuid id PK
        uuid job_id FK
        int attempt_number
        uuid selected_region_id FK
        string decision_action
        float cost_score_jr
        jsonb ranked_candidates
        jsonb weights_applied
        timestamp created_at
    }

    EXPERIMENTS {
        uuid id PK
        string name
        string scenario_type
        int random_seed
        string status
    }

    EXPERIMENT_RESULTS {
        uuid id PK
        uuid experiment_id FK
        string scheduler_algorithm
        float total_energy_kwh
        float total_co2eq_grams
        float avg_latency_ms
        float deadline_miss_rate
    }

    AUDIT_RECORDS {
        uuid id PK
        string event_type
        uuid entity_id
        string entity_type
        jsonb event_payload
        timestamp created_at
    }
```

---

## 3. State Machines

### 3.1 Logical Job State Machine

```mermaid
stateDiagram-v2
    [*] --> PENDING : Workload Ingested
    PENDING --> EVALUATING : Intake Pickup
    
    EVALUATING --> WAITING : Decision = DEFER (Slack Available)
    EVALUATING --> DISPATCHED : Decision = DISPATCH (Region Selected)
    EVALUATING --> FAILED : Infeasible / Deadline Breached
    
    WAITING --> EVALUATING : Condition Trigger / Timer Wakeup
    WAITING --> FAILED : Deadline Breached
    
    DISPATCHED --> RUNNING : Worker Claims Attempt
    
    RUNNING --> COMPLETED : Attempt Succeeded
    RUNNING --> EVALUATING : Attempt Failed (Retries Left)
    RUNNING --> FAILED : Attempt Failed (Retries Exhausted)
    
    COMPLETED --> [*]
    FAILED --> [*]
```

### 3.2 Physical / Simulated Attempt State Machine

```mermaid
stateDiagram-v2
    [*] --> PENDING : Dispatcher Enqueues
    PENDING --> CLAIMED : Worker Atomic Claim Acquired
    CLAIMED --> RUNNING : Execution Starts (Region Locked)
    RUNNING --> COMPLETED : Simulation Succeeded
    RUNNING --> FAILED : Simulated Node/Timeout Failure
    COMPLETED --> [*]
    FAILED --> [*]
```

---

## 4. State Rules

1. **Job vs. Attempt Isolation**: A `Job` tracks the full lifecycle across retries. A `JobAttempt` tracks an immutable single run in a locked region. Failed attempts are marked `FAILED` and never modified.
2. **Atomic Transitions**: `JobAttempt(PENDING)` $\to$ `JobAttempt(CLAIMED)` requires an atomic database CAS update (`WHERE status = 'PENDING'`) backed by a Redis mutex lock (`SET NX PX`).
3. **Region Locking**: Once an attempt enters `CLAIMED`/`RUNNING`, its target region is locked for the life of that attempt.
