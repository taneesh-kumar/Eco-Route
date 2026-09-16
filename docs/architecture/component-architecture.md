# Component Architecture

This document specifies the individual internal modules, their responsibilities, contracts, inputs/outputs, and boundaries within the EcoRoute modular monolith.

---

## 1. Component Overview & Interaction Map

```mermaid
flowchart TD
    JI[Job Intake] --> |Valid Job| CE[Constraint Evaluator]
    CE --> |Feasible Regions| DE[Decision Engine]
    
    RS[Region Simulator] --> |Region State, Latency, Perf| DE
    CS[Carbon Service] --> |Validated / Cached Carbon Intensity| DE
    EE[Energy Estimator] --> |Predicted Power & Energy (E_r)| DE
    
    DE --> |Schedule / Defer Decision| DM[Deferral Manager]
    DE --> |Dispatch Decision| DISP[Dispatcher]
    
    DM --> |Condition Trigger / Wakeup| DE
    
    DISP --> |Claim Workload Attempt| IC[Idempotency & Claim Manager]
    IC --> |Authorized Attempt| EW[Execution Worker]
    
    EW --> |Success / Telemetry| AA[Analytics & Audit Service]
    EW --> |Failure Event| RM[Retry Manager]
    RM --> |Trigger Re-routing| DE
    
    EE <--> RS
```

---

## 2. Component Specifications

### 2.1 Job Intake

* **Purpose**: Gateway for ingesting, validating, and persisting inbound workload requests.
* **Responsibilities**:
  * Validates request payloads against Pydantic schemas (CPU cores, memory, duration, priority, deadlines, workload classification).
  * Assigns unique immutable `job_id` and initial timestamps.
  * Persists the job in PostgreSQL in `PENDING` state.
  * Dispatches an evaluation event to the Decision Engine.
* **Inputs**: Client JSON submission payloads via REST API.
* **Outputs**: Persisted `Job` entity, HTTP `201 Created` with Job resource descriptor.
* **Dependencies**: Persistence Layer (PostgreSQL), Scheduling Engine.
* **Must NOT be responsible for**: Feasibility checks, region selection, execution management, or scoring.

---

### 2.2 Decision Engine

* **Purpose**: The central scheduling intelligence component responsible for ranking regions and determining execution actions (`EXECUTE` vs `DEFER`).
* **Responsibilities**:
  * Orchestrates the evaluation pipeline: signals collection $\to$ hard constraint filtering $\to$ energy/carbon estimation $\to$ normalization $\to$ composite score calculation $\to$ dispatch vs deferral decision.
  * Computes the normalized multi-objective scheduling cost $J_r$:
    $$J_r = w_C \cdot N(E_r \times CI_r) + w_T \cdot N(T_r) + w_U \cdot N(U_r) + w_L \cdot N(L_r)$$
    where lower $J_r$ indicates a better placement, all objectives are normalized across feasible candidate regions, and weights sum to $1.0$ ($w_C + w_T + w_U + w_L = 1.0$).
  * Preserves full regional rankings, intermediate normalization values, and decision rationale in decision records for auditable transparency.
* **Inputs**: Job specifications, active feasible regions, simulated region metrics, carbon intensity data, energy estimates, and priority weights.
* **Outputs**: `SchedulingDecision` record containing winning region ID, ranked region list, score breakdown, and chosen action (`DISPATCH` or `DEFER`).
* **Dependencies**: Constraint Evaluator, Region Simulator, Carbon Service, Energy Estimator, Persistence.
* **Must NOT be responsible for**: Hardware simulation execution, direct worker task dispatch, or raw carbon provider HTTP fetching.

---

### 2.3 Constraint Evaluator

* **Purpose**: Gatekeeper that applies strict, non-negotiable operational filters before any optimization or scoring takes place.
* **Responsibilities**:
  * Checks hard constraints: regional capacity availability, memory/CPU fit, hardware architecture match, regional availability status, and hard deadline feasibility ($t_{\text{now}} + T_r + L_r \le t_{\text{deadline}}$).
  * Drops non-conforming regions from the candidate pool.
* **Inputs**: Job requirements and live Region profiles.
* **Outputs**: Set of `Feasible Regions` (or an empty set triggering deferral/rejection).
* **Dependencies**: Region Simulator.
* **Must NOT be responsible for**: Ranking regions, calculating carbon savings, or applying soft preferences. Hard feasibility must never be compromised by carbon scores.

---

### 2.4 Energy Estimator

* **Purpose**: Calculates expected energy consumption ($E_r$) and power dynamics for a given workload running on a candidate region.
* **Responsibilities**:
  * Uses workload execution profile ($T_r$), CPU/memory demands, and regional power characteristics (idle power $P_{\text{idle}}$, peak power $P_{\text{peak}}$, and utilization scaling).
  * Computes total estimated kilowatt-hours: $E_r = \int P(t) dt$.
* **Inputs**: Workload compute specifications, regional hardware power profiles, estimated runtime $T_r$.
* **Outputs**: Estimated energy $E_r$ (kWh) per feasible region.
* **Dependencies**: Region Simulator.
* **Must NOT be responsible for**: Calculating carbon emissions or determining job placement.

---

### 2.5 Carbon Service

* **Purpose**: Retrieves, validates, caches, and supplies trustworthy regional carbon-intensity metrics.
* **Responsibilities**:
  * Fetches real-time carbon intensity ($g\text{CO}_2\text{eq}/\text{kWh}$) from Electricity Maps.
  * Validates data freshness, confidence intervals, and quality flags.
  * Caches validated observations in Redis with TTLs.
  * Enforces the architectural fallback hierarchy: Live $\to$ Cache $\to$ Conventional Bypass.
  * Records data origin and quality flags (`LIVE`, `CACHED`, `UNAVAILABLE`) in scheduling metadata.
* **Inputs**: Region identifier / geographical coordinates.
* **Outputs**: Carbon intensity value $CI_r$ with data quality provenance.
* **Dependencies**: External APIs (Electricity Maps), Redis, PostgreSQL (for observation logging).
* **Must NOT be responsible for**: Fabricating or interpolating missing carbon values; selecting regions.

---

### 2.6 Region Simulator

* **Purpose**: Models logical cloud regions and their dynamic operational characteristics.
* **Responsibilities**:
  * Maintains simulated regional state: capacity, current utilization ($U_r$), availability/health, performance degradation factors, idle/peak power draw, and simulated network latency ($L_r$).
  * Simulates dynamic scenarios: diurnal traffic swings, congestion, power spikes, network latency jitter, and hardware failures.
  * Supports deterministic execution with fixed random seeds for benchmark reproducibility.
* **Inputs**: Seed configuration, simulated tick/clock, synthetic traffic profiles, baseline cloud provider specs.
* **Outputs**: Regional telemetry snapshots and simulated execution progress.
* **Dependencies**: None (self-contained simulation core).
* **Must NOT be responsible for**: Carbon intensity integration; deciding where workloads should be scheduled.

---

### 2.7 Deferral Manager

* **Purpose**: Manages workloads that are temporarily held in `WAITING` state pending improved carbon or operational conditions.
* **Responsibilities**:
  * Evaluates deferral feasibility based on slack time ($\text{slack} = t_{\text{deadline}} - (t_{\text{now}} + T_r + L_r)$), forecast opportunity, and workload priority.
  * Re-evaluates waiting jobs when condition-based triggers occur (e.g., carbon forecast inflection, tick timers, region capacity release).
  * Enforces maximum allowable deferral thresholds to prevent deadline breaches.
* **Inputs**: Waiting jobs, current time, regional carbon signals, updated region availability.
* **Outputs**: Re-evaluation triggers passed to Decision Engine; job transition to `EVALUATING` or `FAILED` (if expired).
* **Dependencies**: Decision Engine, Redis (timers/locks), PostgreSQL.
* **Must NOT be responsible for**: Using arbitrary static sleep loops; overriding hard deadlines.

---

### 2.8 Dispatcher

* **Purpose**: Coordinates the transition from scheduling decisions to physical/simulated execution.
* **Responsibilities**:
  * Creates a new `JobAttempt` record in PostgreSQL in `PENDING` state with a unique `attempt_id`.
  * Locks the assigned region for the specific attempt.
  * Publishes dispatch events to the worker execution queue in Redis.
* **Inputs**: `SchedulingDecision` with action `DISPATCH`.
* **Outputs**: Created `JobAttempt` entity, worker queue notification.
* **Dependencies**: Persistence (PostgreSQL), Redis.
* **Must NOT be responsible for**: Running workload task code or deciding retry strategies.

---

### 2.9 Execution Worker

* **Purpose**: Executes workload attempts within the simulated target region.
* **Responsibilities**:
  * Atomically claims an attempt using the Idempotency Manager.
  * Simulates step-by-step workload processing, tracking elapsed time, dynamic energy consumption, and synthetic telemetry.
  * Updates attempt state: `CLAIMED` $\to$ `RUNNING` $\to$ `COMPLETED` (or `FAILED`).
  * Yields completed telemetry and emits failure signals on error.
* **Inputs**: Worker queue dispatch messages (`job_id`, `attempt_id`, `region_id`).
* **Outputs**: Execution telemetry, final attempt outcome status.
* **Dependencies**: Idempotency Manager, Region Simulator, Persistence.
* **Must NOT be responsible for**: Deciding fallback regions upon failure; modifying logical job definitions.

---

### 2.10 Retry Manager

* **Purpose**: Handles execution failures and returns failed jobs to the Decision Engine for fresh routing.
* **Responsibilities**:
  * Intercepts `FAILED` attempt outcomes.
  * Checks remaining retry budget (max attempts) and remaining deadline slack.
  * If eligible for retry, transitions Job to `EVALUATING` and requests a completely fresh scheduling decision.
  * If retry budget or deadline is exhausted, marks Job permanently `FAILED`.
* **Inputs**: Failed `JobAttempt` records.
* **Outputs**: Fresh scheduling request or terminal `FAILED` job status.
* **Dependencies**: Decision Engine, Persistence (PostgreSQL).
* **Must NOT be responsible for**: Reusing previous region assignments automatically; retrying inside the worker process without Decision Engine re-evaluation.

---

### 2.11 Idempotency & Atomic Claim Manager

* **Purpose**: Prevents duplicate executions of attempts and guards critical scheduling transitions.
* **Responsibilities**:
  * Enforces atomic claims on `(job_id, attempt_id)` pairs via Redis atomic distributed locks (`SET key val NX PX`) backed by PostgreSQL conditional updates (`UPDATE job_attempts SET status = 'CLAIMED' WHERE id = :id AND status = 'PENDING'`).
  * Ensures that duplicate or out-of-order queue delivery results in a no-op for redundant workers.
* **Inputs**: Attempt claim requests from Workers.
* **Outputs**: Boolean claim authorization (`APPROVED` or `REJECTED`).
* **Dependencies**: Redis, PostgreSQL.
* **Must NOT be responsible for**: Scheduling logic; payload parsing.

---

### 2.12 Analytics & Audit Service

* **Purpose**: Ingestion and reporting of scheduling metrics, carbon savings, and historical compliance.
* **Responsibilities**:
  * Aggregates CO₂eq reductions versus a conventional (carbon-unaware) baseline.
  * Records immutable audit records for every scheduling decision, constraint rejection, carbon fallback event, and retry.
  * Exposes aggregated data to frontend analytics dashboards.
* **Inputs**: Decision records, attempt telemetry, baseline counterfactual estimates.
* **Outputs**: Metric summaries, carbon savings KPIs, structured audit logs.
* **Dependencies**: Persistence (PostgreSQL).
* **Must NOT be responsible for**: Real-time scheduling decisions.

---

### 2.13 Experiment Engine

* **Purpose**: Executes controlled, repeatable baseline experiments for academic evaluation.
* **Responsibilities**:
  * Instantiates standardized test harnesses with frozen random seeds, fixed workload batches, and synthetic scenarios (e.g., carbon grid fluctuations, network spikes, worker failures).
  * Executes comparative schedulers:
    1. *EcoRoute Carbon-Aware Scheduler*
    2. *Conventional Baseline (Lowest Latency)*
    3. *Cost/Utilization Baseline (First-Fit / Round-Robin)*
  * Exports structured experiment results and comparative metrics.
* **Inputs**: Experiment configuration parameters, workload profiles, seed definitions.
* **Outputs**: `ExperimentResult` datasets with side-by-side efficiency and SLA metrics.
* **Dependencies**: Scheduling Engine, Region Simulator, Persistence.
* **Must NOT be responsible for**: Altering production operational state without explicit experiment boundaries.
