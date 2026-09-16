# Data Architecture

This document defines the persistent data model, state machines, and caching architecture for EcoRoute.

---

## 1. Storage Tier Separation

EcoRoute strictly separates persistent storage from operational caching and transient synchronization:

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        PostgreSQL Database                            │
│  - Durable Source of Truth                                             │
│  - ACID Transactions & Foreign Key Integrity                           │
│  - Stores Jobs, Attempts, Decisions, Regions, Audits, Experiments       │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ (Sync / State Updates)
┌──────────────────────────────────┴─────────────────────────────────────┐
│                           Redis Cache & Broker                         │
│  - Short-Lived Carbon Intensity Observations (TTL Caching)             │
│  - Distributed Locks for Atomic Attempt Claims (SET NX PX)             │
│  - Transient Deferral Timers & Worker Coordination Queues              │
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
        timestamp updated_at
    }

    JOB_ATTEMPTS {
        uuid id PK
        uuid job_id FK
        int attempt_number
        uuid region_id FK
        string status
        string claimed_by_worker
        timestamp dispatched_at
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
        string country
        float latitude
        float longitude
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
        timestamp recorded_at
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
        jsonb normalization_factors
        string carbon_source_used
        timestamp created_at
    }

    EXPERIMENTS {
        uuid id PK
        string name
        string scenario_type
        int random_seed
        jsonb configuration
        string status
        timestamp started_at
        timestamp completed_at
    }

    EXPERIMENT_RESULTS {
        uuid id PK
        uuid experiment_id FK
        string scheduler_algorithm
        float total_energy_kwh
        float total_co2eq_grams
        float avg_latency_ms
        float deadline_miss_rate
        jsonb summary_metrics
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

The `Job` state machine tracks the lifecycle of the computational workload across one or more execution attempts.

```mermaid
stateDiagram-v2
    [*] --> PENDING : Submit Workload
    PENDING --> EVALUATING : Intake Pickup
    
    EVALUATING --> WAITING : Decision = DEFER\n(Slack / Carbon opportunity)
    EVALUATING --> DISPATCHED : Decision = DISPATCH\n(Best Region Selected)
    EVALUATING --> FAILED : No feasible region &\nDeadline exhausted
    
    WAITING --> EVALUATING : Condition Trigger / Timer Wakeup
    WAITING --> FAILED : Hard Deadline Exceeded
    
    DISPATCHED --> RUNNING : Worker Claims Attempt
    DISPATCHED --> FAILED : Dispatch Timeout / Cancel
    
    RUNNING --> COMPLETED : Attempt Succeeded
    RUNNING --> EVALUATING : Attempt Failed &\nRetries Left (New Attempt)
    RUNNING --> FAILED : Attempt Failed &\nRetries / Deadline Exhausted
    
    COMPLETED --> [*]
    FAILED --> [*]
```

### 3.2 Physical / Simulated Job Attempt State Machine

The `JobAttempt` state machine tracks an isolated execution run within a locked target region.

```mermaid
stateDiagram-v2
    [*] --> PENDING : Dispatcher Creates Attempt
    
    PENDING --> CLAIMED : Worker Atomic Claim Acquired
    PENDING --> FAILED : Claim Timeout / Expired
    
    CLAIMED --> RUNNING : Execution Starts (Region Locked)
    
    RUNNING --> COMPLETED : Simulation Finishes Successfully
    RUNNING --> FAILED : Error / Timeout / Region Simulated Failure
    
    COMPLETED --> [*]
    FAILED --> [*]
```

---

## 4. State Ownership and Transition Rules

1. **Job vs. Attempt Isolation**:
   * A `Job` represents the logical task and durable lifecycle.
   * A `JobAttempt` represents a single, region-locked execution attempt.
   * If an attempt fails, the attempt is marked `FAILED` and is never re-opened. The parent `Job` returns to `EVALUATING` so that the Decision Engine can make a brand-new routing determination.
2. **Atomic State Mutations**:
   * Transition from `JobAttempt(PENDING)` to `JobAttempt(CLAIMED)` must be strictly guarded by an atomic database CAS update (`WHERE status = 'PENDING'`) backed by a distributed mutex lock in Redis.
3. **Region Locking**:
   * Once a `JobAttempt` enters `CLAIMED` / `RUNNING`, the assigned region is locked for that specific attempt. Mid-execution live migrations across simulated regions are explicitly disallowed.
4. **Terminal States**:
   * `COMPLETED` and `FAILED` are terminal states for both `Job` and `JobAttempt`.
