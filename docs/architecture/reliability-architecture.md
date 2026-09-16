# Reliability, Retries & Data Flow Architecture

This document specifies the reliability model, retry mechanics, idempotency controls, and end-to-end data flows within EcoRoute.

---

## 1. Reliability & Attempt Isolation Model

In EcoRoute, a logical workload is decoupled from its individual execution runs.

```text
Job ID: job-9a7f-41bc
   │
   ├── Attempt 01 (Region: us-east-1)  ──► Status: FAILED (Simulated Timeout)
   ├── Attempt 02 (Region: eu-west-1)  ──► Status: FAILED (Regional Node Degradation)
   └── Attempt 03 (Region: us-west-2)  ──► Status: RUNNING (Currently Executing)
```

### Key Reliability Rules:

1. **New Attempt per Retry**: Every retry generates a new, unique `attempt_id` and increments `attempt_number`.
2. **Fresh Routing on Failure**: When an attempt fails, the worker does **not** pick the next region. The failed attempt emits a failure signal back to the Decision Engine, which conducts a fresh multi-objective evaluation across current real-time environmental conditions.
3. **Deadline & Policy Verification**: Before initiating a retry, the Retry Manager checks both the remaining retry quota ($N_{\text{attempts}} \le N_{\text{max}}$) and remaining deadline slack ($\text{slack} \ge T_r$). If exceeded, the Job transitions to `FAILED`.
4. **Region Locking**: Once an attempt transitions to `CLAIMED` / `RUNNING`, the region assignment is immutable for that attempt.

---

## 2. End-to-End Data Flows

### 2.1 Normal Workload Scheduling Flow

```mermaid
sequenceDiagram
    autonumber
    actor User as User / Client
    participant API as FastAPI Intake
    participant DE as Decision Engine
    participant CE as Constraint Evaluator
    participant RS as Region Simulator
    participant CS as Carbon Service
    participant EE as Energy Estimator
    participant DB as PostgreSQL
    participant Redis as Redis Queue
    participant Worker as Execution Worker

    User->>API: POST /api/v1/jobs (workload payload)
    API->>DB: INSERT Job (status='PENDING')
    API->>DE: evaluate_job(job_id)
    
    DE->>RS: get_all_regions_state()
    RS-->>DE: Region profiles & current utilization
    
    DE->>CE: filter_feasible(job, regions)
    CE-->>DE: Feasible Candidate Regions
    
    DE->>CS: get_carbon_intensity(regions)
    CS-->>DE: Validated CI_r values
    
    DE->>EE: estimate_energy(job, regions)
    EE-->>DE: Predicted E_r (kWh)
    
    Note over DE: Normalize factors N(E*CI), N(T), N(U), N(L)<br/>Calculate J_r = wC*N(E*CI) + wT*N(T) + wU*N(U) + wL*N(L)
    
    DE->>DB: INSERT SchedulingDecision (ranked regions, J_r scores)
    DE->>DB: INSERT JobAttempt (status='PENDING', region_id=best_region)
    DE->>DB: UPDATE Job (status='DISPATCHED')
    
    DE->>Redis: LPUSH execution_queue (attempt_id, region_id)
    
    Redis-->>Worker: RPOPLPUSH (attempt_id)
    Worker->>DB: Atomic Claim Attempt (status='CLAIMED')
    Worker->>DB: UPDATE JobAttempt (status='RUNNING'), Job (status='RUNNING')
    Worker->>RS: simulate_execution(job_params, region_params)
    RS-->>Worker: Simulated execution completed
    Worker->>DB: UPDATE JobAttempt (status='COMPLETED'), Job (status='COMPLETED')
```

---

### 2.2 Carbon Data Hierarchy & Fallback Flow

EcoRoute enforces a strict fallback hierarchy for carbon intensity:

```mermaid
flowchart TD
    Start([Evaluate Carbon for Region R]) --> LiveCheck{Query Electricity Maps API<br/>Response Valid & Fresh?}
    
    LiveCheck -- Yes --> UseLive[Use Live Carbon Intensity CI_r<br/>Data Quality: LIVE]
    UseLive --> CacheStore[Update Redis Cache with TTL]
    CacheStore --> SchedPass[Pass CI_r to Decision Engine]
    
    LiveCheck -- No (Error / Timeout / Stale) --> CacheCheck{Query Redis Cache<br/>Valid Cached Entry Exists?}
    
    CacheCheck -- Yes --> UseCache[Use Cached Carbon Intensity CI_r<br/>Data Quality: CACHED]
    UseCache --> SchedPass
    
    CacheCheck -- No (Cache Miss / Expired) --> Bypass[Bypass Carbon Optimization<br/>Data Quality: UNAVAILABLE<br/>Zero out wC in J_r calculation]
    Bypass --> ConvSched[Conventional Operational Scheduling<br/>Score based on T_r, U_r, L_r only]
    ConvSched --> AuditWarn[Record Carbon Unavailable Warning in Audit Log]
    AuditWarn --> SchedPass
```

> [!IMPORTANT]
> **No Carbon Value Fabrication**: EcoRoute must never invent or interpolate missing carbon values. If live and valid cache data are unavailable, carbon optimization is explicitly bypassed, falling back to conventional operational scheduling.

---

### 2.3 Execution Failure & Re-routing Flow

```mermaid
sequenceDiagram
    autonumber
    participant Worker as Execution Worker
    participant DB as PostgreSQL
    participant RM as Retry Manager
    participant DE as Decision Engine
    participant Redis as Redis Queue

    Worker->>DB: UPDATE JobAttempt (id=attempt_01, status='FAILED', error="Node timeout")
    Worker->>RM: handle_failure(job_id, attempt_01)
    
    RM->>DB: SELECT Job (check max_retries, deadline)
    
    alt Retries Remaining & Deadline Feasible
        RM->>DB: UPDATE Job (status='EVALUATING', attempt_count += 1)
        RM->>DE: trigger_fresh_routing(job_id)
        Note over DE: Full fresh evaluation under current dynamic signals
        DE->>DB: INSERT JobAttempt (id=attempt_02, status='PENDING')
        DE->>Redis: LPUSH execution_queue (attempt_02)
    else Deadline Breached or Retries Exhausted
        RM->>DB: UPDATE Job (status='FAILED', error_reason="Retry budget or deadline exceeded")
    end
```

---

### 2.4 Duplicate Delivery & Atomic Claim Prevention Flow

When multiple workers receive the same Attempt ID (e.g., due to redelivery, network blip, or parallel workers), atomic claim controls ensure exactly-once execution.

```mermaid
sequenceDiagram
    autonumber
    participant Q as Redis Dispatch Queue
    participant W1 as Worker 1
    participant W2 as Worker 2
    participant RedisLock as Redis Distributed Lock (SET NX PX)
    participant DB as PostgreSQL (JobAttempt Table)

    Q->>W1: Deliver Attempt 01
    Q->>W2: Duplicate Deliver Attempt 01 (Redelivery/Race)
    
    par Worker 1 acquires lock first
        W1->>RedisLock: SET lock:attempt:01 NX PX 5000
        RedisLock-->>W1: OK (Lock Acquired)
        W1->>DB: UPDATE job_attempts SET status='CLAIMED', worker='W1' WHERE id='01' AND status='PENDING'
        DB-->>W1: 1 row affected (Success)
        W1->>W1: Begin Simulated Workload Execution
    and Worker 2 tries to acquire lock
        W2->>RedisLock: SET lock:attempt:01 NX PX 5000
        RedisLock-->>W2: NIL (Lock Failed / Busy)
        Note over W2: Worker 2 falls back to DB conditional check
        W2->>DB: UPDATE job_attempts SET status='CLAIMED', worker='W2' WHERE id='01' AND status='PENDING'
        DB-->>W2: 0 rows affected (Already Claimed)
        W2->>W2: Log duplicate delivery ignored (No-Op)
    end
```

---

### 2.5 Condition-Based Deferral & Wakeup Flow

EcoRoute avoids arbitrary, fixed-interval polling loops. Workload deferral is condition-aware and deadline-bounded.

```mermaid
sequenceDiagram
    autonumber
    participant DE as Decision Engine
    participant DM as Deferral Manager
    participant DB as PostgreSQL
    participant Redis as Redis Keyspace / Timers

    DE->>DE: High carbon now, but significant deadline slack available
    DE->>DB: UPDATE Job (status='WAITING')
    DE->>DM: register_deferral(job_id, slack, target_condition)
    
    DM->>Redis: Set condition trigger / max deadline timer
    
    alt Trigger A: Carbon Intensity Forecast Drops (Grid Signal)
        Redis-->>DM: Signal: Carbon dropped below threshold
        DM->>DB: UPDATE Job (status='EVALUATING')
        DM->>DE: reevaluate_job(job_id)
    else Trigger B: Max Deferral Threshold Reached (Slack Depleted)
        Redis-->>DM: Timer Expired (Urgent Dispatch Required)
        DM->>DB: UPDATE Job (status='EVALUATING')
        DM->>DE: reevaluate_job(job_id, force_dispatch=True)
    end
```
