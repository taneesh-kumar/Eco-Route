# Sequence & Interaction Design

This document details the runtime sequence interactions across the EcoRoute modular monolith for all major operational scenarios.

---

## 1. Normal Workload Scheduling & Execution

```mermaid
sequenceDiagram
    autonumber
    actor Client
    participant API as Job API
    participant SE as Scheduling Engine
    participant CE as Constraint Evaluator
    participant CS as Carbon Service
    participant EE as Energy Estimator
    participant DM as Deferral Manager
    participant DISP as Dispatcher
    participant AM as Attempt Manager
    participant Redis as Redis Queue
    participant Worker as Execution Worker
    participant DB as PostgreSQL

    Client->>API: POST /jobs (workload payload)
    API->>DB: INSERT Job (status='PENDING')
    API->>SE: schedule_job(job_id)
    
    SE->>CE: filter_feasible(job, regions)
    CE-->>SE: Feasible Candidate Regions
    
    SE->>CS: get_carbon(feasible_regions)
    CS-->>SE: Validated CI_r (LIVE)
    
    SE->>EE: estimate_energy(job, feasible_regions)
    EE-->>SE: Estimated E_r (kWh)
    
    Note over SE: Calculate Jr = wC*N(E*CI) + wT*N(T) + wU*N(U) + wL*N(L)<br/>Rank regions & tie-break
    
    SE->>DM: evaluate_deferral(winning_region, slack, priority)
    DM-->>SE: Action = EXECUTE
    
    SE->>DB: INSERT SchedulingDecision (ranked list, sub-scores)
    SE->>DISP: dispatch(job_id, winning_region)
    
    DISP->>AM: create_attempt(job_id, winning_region)
    AM->>DB: INSERT JobAttempt (status='PENDING', region locked)
    DISP->>Redis: Enqueue attempt_id
    
    Redis-->>Worker: Pop attempt_id
    Worker->>DB: Atomic Claim Attempt (status='CLAIMED')
    Worker->>DB: UPDATE Job & JobAttempt (status='RUNNING')
    Worker->>Worker: Execute Simulation Loop
    Worker->>DB: UPDATE Job & JobAttempt (status='COMPLETED', actual_energy, actual_duration)
```

---

## 2. Deferred Workload & Condition-Based Wakeup

```mermaid
sequenceDiagram
    autonumber
    participant SE as Scheduling Engine
    participant DM as Deferral Manager
    participant DB as PostgreSQL
    participant Redis as Redis Timers / Signals

    SE->>DM: evaluate_deferral() -> Slack exists, green window forecast
    DM->>DB: UPDATE Jobs SET status='WAITING'
    DM->>Redis: Set condition listener (Carbon drop) & max slack timer
    
    alt Signal 1: Carbon Intensity Drops (Grid Update)
        Redis-->>DM: Signal: Carbon dropped below threshold
        DM->>DB: UPDATE Jobs SET status='EVALUATING'
        DM->>SE: reevaluate_job(job_id)
        Note over SE: Complete fresh scheduling evaluation through full pipeline
    else Signal 2: Max Slack Timer Expires (Urgent Dispatch)
        Redis-->>DM: Timer Expired (Urgent)
        DM->>DB: UPDATE Jobs SET status='EVALUATING'
        DM->>SE: reevaluate_job(job_id, force_dispatch=True)
    end
```

---

## 3. Failed Attempt Recovery & Fresh Central Re-routing

```mermaid
sequenceDiagram
    autonumber
    participant Worker as Execution Worker
    participant AM as Attempt Manager
    participant RM as Retry Manager
    participant SE as Scheduling Engine
    participant DISP as Dispatcher
    participant DB as PostgreSQL

    Worker->>AM: mark_attempt_failed(attempt_01, error="Simulated timeout")
    AM->>DB: UPDATE JobAttempts SET status='FAILED' WHERE id='attempt_01'
    Worker->>RM: handle_failure(job_id, attempt_01)
    
    RM->>RM: Check retry quota (count < max_retries) & deadline slack
    
    alt Retries Remaining & Slack Feasible
        RM->>DB: UPDATE Jobs SET status='EVALUATING', attempt_count=2
        RM->>SE: trigger_fresh_routing(job_id)
        Note over SE: Fresh multi-objective evaluation under current dynamic conditions
        SE->>DISP: dispatch(job_id, new_selected_region)
        DISP->>AM: create_attempt(job_id, new_selected_region)
        AM->>DB: INSERT JobAttempts (Attempt 02, status='PENDING')
    else Quota Exhausted or Deadline Breached
        RM->>DB: UPDATE Jobs SET status='FAILED'
    end
```

---

## 4. Duplicate Delivery Prevention (Atomic Claim Race)

```mermaid
sequenceDiagram
    autonumber
    participant Q as Redis Queue
    participant W1 as Worker 1
    participant W2 as Worker 2
    participant DB as PostgreSQL (JobAttempts Table)

    Q->>W1: Deliver Attempt 01
    Q->>W2: Duplicate Deliver Attempt 01 (Race Condition / Redelivery)
    
    par Worker 1 claims
        W1->>DB: UPDATE job_attempts SET status='CLAIMED', claimed_by='W1' WHERE id='01' AND status='PENDING'
        DB-->>W1: 1 row affected (SUCCESS)
        W1->>W1: Begin Workload Execution
    and Worker 2 claims
        W2->>DB: UPDATE job_attempts SET status='CLAIMED', claimed_by='W2' WHERE id='01' AND status='PENDING'
        DB-->>W2: 0 rows affected (ALREADY CLAIMED)
        W2->>W2: Log duplicate delivery ignored (No-Op)
    end
```
