# Domain & Class Model Design

This document defines the core domain entities, aggregates, and application service boundaries for the EcoRoute modular monolith.

---

## 1. Domain Model Hierarchy

```mermaid
classDiagram
    class Job {
        +UUID id
        +String workload_name
        +String workload_type
        +Float cpu_demand
        +Float memory_demand
        +Float base_execution_duration
        +Integer priority
        +Timestamp deadline
        +JobStatus status
        +Integer current_attempt_count
        +Integer max_retries
    }

    class JobAttempt {
        +UUID id
        +UUID job_id
        +Integer attempt_number
        +UUID region_id
        +AttemptStatus status
        +String claimed_by_worker
        +Float actual_duration
        +Float actual_energy_kwh
        +Float actual_co2eq_grams
        +String error_message
    }

    class Region {
        +UUID id
        +String code
        +String name
        +String provider
        +Float max_cpu_capacity
        +Float max_memory_capacity
        +Float current_utilization
        +Float performance_factor
        +Float idle_power_watts
        +Float peak_power_watts
        +Float network_latency_ms
        +Boolean is_available
    }

    class CarbonObservation {
        +UUID id
        +UUID region_id
        +Float carbon_intensity
        +String source
        +DataQuality data_quality
        +Timestamp observation_timestamp
        +Timestamp valid_until
    }

    class SchedulingDecision {
        +UUID id
        +UUID job_id
        +UUID attempt_id
        +UUID selected_region_id
        +DecisionAction decision_action
        +Float cost_score_jr
        +Float estimated_energy_kwh
        +Float estimated_co2eq_grams
        +String carbon_source_used
        +DataQuality carbon_quality_used
        +String decision_reason
        +JSON score_breakdown
        +JSON candidate_rankings
        +JSON applied_weights
    }

    class Experiment {
        +UUID id
        +String name
        +SchedulerVariant scheduler_variant
        +Integer random_seed
        +String scenario_type
        +ExperimentStatus status
    }

    class ExperimentResult {
        +UUID id
        +UUID experiment_id
        +String scheduler_algorithm
        +Float total_energy_kwh
        +Float total_co2eq_grams
        +Float deadline_compliance_rate
        +Float failure_rate
        +Float retry_rate
        +Integer duplicate_execution_count
    }

    class AuditEvent {
        +UUID id
        +UUID job_id
        +UUID attempt_id
        +String event_type
        +String actor
        +JSON event_metadata
        +Timestamp event_timestamp
    }

    Job "1" *-- "0..*" JobAttempt : has
    Job "1" *-- "0..*" SchedulingDecision : evaluated by
    Job "1" *-- "0..*" AuditEvent : generates
    Region "1" *-- "0..*" JobAttempt : executes on
    Region "1" *-- "0..*" CarbonObservation : records
    Region "1" *-- "0..*" SchedulingDecision : selected in
    Experiment "1" *-- "0..*" ExperimentResult : produces
```

---

## 2. Core Domain Entities

* **`Job`**: Aggregate root representing a computational workload across its lifecycle. Owns requirements, priority, deadlines, and retry budgets.
* **`JobAttempt`**: Value entity representing an immutable single execution run locked to a specific target `Region`.
* **`Region`**: Aggregate representing a logical/simulated cloud execution target, its capacity, power curve, and operational health.
* **`CarbonObservation`**: Entity recording a time-bounded grid carbon intensity measurement ($g\text{CO}_2\text{eq}/\text{kWh}$) and its provenance (`LIVE`, `CACHED`, `UNAVAILABLE`).
* **`SchedulingDecision`**: Immutable evaluation entity capturing full explainability metrics, sub-scores, normalization bounds, candidate rankings, and actions (`EXECUTE` / `DEFER`).
* **`Experiment` & `ExperimentResult`**: Aggregate defining reproducible benchmark harnesses and comparative evaluation metrics across all 5 scheduler variants.
* **`AuditEvent`**: Immutable forensic log entry recording system-wide state machine transitions.

---

## 3. Domain & Application Services

| Service | Purpose & Boundary | Non-Responsibilities |
| :--- | :--- | :--- |
| **`SchedulingEngine`** | Orchestrates signal gathering, feasibility pruning, scoring, and execute/defer actions. | Direct workload execution, raw external API fetching |
| **`ConstraintEvaluator`** | First-stage filter dropping candidate regions violating capacity, availability, or deadlines. | Score computation, carbon optimization, soft preferences |
| **`EnergyEstimator`** | Deterministic mathematical modeling of workload power scaling and energy ($E_r$ in kWh). | Carbon emission calculation, region ranking |
| **`CarbonService`** | Resolves carbon intensity from Electricity Maps and cache; enforces zero-fabrication fallback. | Fabricating missing values, calculating $J_r$ scores |
| **`RegionSimulator`** | Maintains dynamic regional utilization, capacity, and latency under deterministic seed control. | Carbon data resolution, placement decisions |
| **`DeferralManager`** | Evaluates deadline slack and carbon forecast opportunities ($J_{\text{future}} < J_{\text{current}} - \epsilon$) to hold workloads in `WAITING`. | Arbitrary fixed sleep loops, overriding hard deadlines |
| **`Dispatcher`** | Converts approved decisions into `JobAttempt(PENDING)` records, locks the region, and enqueues to Redis. | Region selection, workload execution |
| **`ExecutionWorker`** | Claims attempt atomically, simulates workload execution in locked region, reports telemetry. | Selecting fallback regions on error, altering decisions |
| **`RetryManager`** | Verifies retry quota and deadline slack on failure; requests fresh routing from `SchedulingEngine`. | Blindly reusing previous region, executing tasks directly |
| **`IdempotencyManager`**| Guarantees exactly-once execution per attempt via PostgreSQL conditional CAS updates and Redis mutexes. | Scheduling intelligence, payload validation |
| **`ExperimentEngine`** | Executes benchmark scenarios across standardized baseline schedulers with frozen random seeds. | Modifying production scheduling state |
