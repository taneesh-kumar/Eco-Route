# Reliability, Retries & Data Flow Architecture

This document defines the reliability model, retry mechanics, idempotency controls, and data flows for EcoRoute.

---

## 1. Reliability & Attempt Isolation Model

```text
Job ID: job-9a7f-41bc
   │
   ├── Attempt 01 (Region: us-east-1)  ──► Status: FAILED (Simulated Timeout)
   ├── Attempt 02 (Region: eu-west-1)  ──► Status: FAILED (Regional Node Degradation)
   └── Attempt 03 (Region: us-west-2)  ──► Status: RUNNING (Currently Executing)
```

* **New Attempt per Retry**: Every retry generates a new `attempt_id` and increments `attempt_number`.
* **Fresh Central Routing**: Failed attempts report back to the Decision Engine for a fresh multi-objective evaluation under current dynamic conditions.
* **Deadline & Quota Enforcement**: Retries are permitted only if remaining retry quota ($N_{\text{attempts}} \le N_{\text{max}}$) and deadline slack ($\text{slack} \ge T_r$) are satisfied.
* **Region Locking**: Active attempts are locked to their assigned region.

---

## 2. End-to-End Data Flows

### 2.1 Normal Workload Scheduling

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
    DE->>CE: filter_feasible(job, regions)
    CE-->>DE: Feasible Regions
    
    DE->>CS: get_carbon_intensity(regions)
    DE->>EE: estimate_energy(job, regions)
    
    Note over DE: Calculate Jr = wC*N(E*CI) + wT*N(T) + wU*N(U) + wL*N(L)
    
    DE->>DB: INSERT SchedulingDecision & JobAttempt (status='PENDING')
    DE->>DB: UPDATE Job (status='DISPATCHED')
    DE->>Redis: LPUSH execution_queue (attempt_id)
    
    Redis-->>Worker: Pop attempt_id
    Worker->>DB: Atomic Claim (status='CLAIMED')
    Worker->>DB: UPDATE JobAttempt & Job (status='RUNNING')
    Worker->>RS: simulate_execution()
    Worker->>DB: UPDATE JobAttempt & Job (status='COMPLETED')
```

---

### 2.2 Carbon Fallback Hierarchy

EcoRoute enforces a strict fallback hierarchy:

```mermaid
flowchart TD
    Start([Evaluate Carbon for Region]) --> LiveCheck{Query Electricity Maps<br/>Valid & Fresh?}
    
    LiveCheck -- Yes --> UseLive[Use Live CI_r<br/>Data Quality: LIVE]
    UseLive --> CacheStore[Update Redis Cache with TTL]
    CacheStore --> SchedPass[Pass CI_r to Decision Engine]
    
    LiveCheck -- No --> CacheCheck{Query Redis Cache<br/>Valid Entry Exists?}
    
    CacheCheck -- Yes --> UseCache[Use Cached CI_r<br/>Data Quality: CACHED]
    UseCache --> SchedPass
    
    CacheCheck -- No --> Bypass[Bypass Carbon Optimization<br/>Data Quality: UNAVAILABLE<br/>Set wC = 0 in Jr]
    Bypass --> ConvSched[Conventional Operational Scheduling<br/>Score based on T_r, U_r, L_r only]
    ConvSched --> SchedPass
```

> [!IMPORTANT]
> **No Carbon Fabrication**: Missing carbon data triggers graceful fallback to cache or conventional operational scheduling. Carbon values are never fabricated.

---

### 2.3 Failure Recovery & Re-routing

```mermaid
sequenceDiagram
    autonumber
    participant Worker as Execution Worker
    participant DB as PostgreSQL
    participant RM as Retry Manager
    participant DE as Decision Engine
    participant Redis as Redis Queue

    Worker->>DB: UPDATE JobAttempt (status='FAILED', error="Node timeout")
    Worker->>RM: handle_failure(job_id, attempt_01)
    
    alt Retries Remaining & Deadline Feasible
        RM->>DB: UPDATE Job (status='EVALUATING', attempt_count += 1)
        RM->>DE: trigger_fresh_routing(job_id)
        DE->>DB: INSERT JobAttempt (id=attempt_02, status='PENDING')
        DE->>Redis: LPUSH execution_queue (attempt_02)
    else Retries Exhausted or Deadline Breached
        RM->>DB: UPDATE Job (status='FAILED')
    end
```

---

### 2.4 Duplicate Delivery Prevention (Atomic Claims)

```mermaid
sequenceDiagram
    autonumber
    participant Q as Redis Queue
    participant W1 as Worker 1
    participant W2 as Worker 2
    participant RedisLock as Redis (SET NX PX)
    participant DB as PostgreSQL

    Q->>W1: Deliver Attempt 01
    Q->>W2: Duplicate Deliver Attempt 01
    
    par Worker 1 claims first
        W1->>RedisLock: SET lock:attempt:01 NX PX 5000 -> OK
        W1->>DB: UPDATE job_attempts SET status='CLAIMED' WHERE status='PENDING' (Success)
        W1->>W1: Execute Attempt 01
    and Worker 2 attempts claim
        W2->>RedisLock: SET lock:attempt:01 NX PX 5000 -> Busy
        W2->>DB: UPDATE job_attempts SET status='CLAIMED' WHERE status='PENDING' (0 rows)
        W2->>W2: Ignore Duplicate (No-Op)
    end
```

---

### 2.5 Condition-Based Deferral & Wakeup

```mermaid
sequenceDiagram
    autonumber
    participant DE as Decision Engine
    participant DM as Deferral Manager
    participant DB as PostgreSQL
    participant Redis as Redis Timers

    DE->>DB: UPDATE Job (status='WAITING')
    DE->>DM: register_deferral(job_id, slack_time)
    DM->>Redis: Set condition trigger / deadline timer
    
    alt Trigger: Carbon Intensity Drops
        Redis-->>DM: Signal: Carbon dropped below threshold
        DM->>DE: reevaluate_job(job_id)
    else Trigger: Deadline Slack Depleted
        Redis-->>DM: Timer Expired (Urgent Dispatch)
        DM->>DE: reevaluate_job(job_id, force_dispatch=True)
    end
```
