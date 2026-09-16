# Architecture Decisions & Requirements Traceability

This document records the official Architecture Decision Records (ADRs) and the Requirements Traceability Matrix for the EcoRoute system.

---

## 1. Architecture Decision Records (ADRs)

### ADR-01: Modular Monolith Architecture
* **Decision**: Adopt a modular monolith backend (FastAPI application with strict internal domain boundaries) rather than a distributed microservices network.
* **Rationale**: Eliminates network serialization latency, distributed transaction orchestration, and operational deployment complexity while maintaining strict domain separation and testability. Facilitates deterministic simulations and reproducible academic experiments.

### ADR-02: Backend Ownership of Scheduling Intelligence
* **Decision**: All scheduling algorithms, constraint evaluations, scoring calculations ($J_r$), and deferral decisions reside exclusively within the FastAPI backend.
* **Rationale**: Prevents business logic duplication and security vulnerabilities. Guarantees that clients (frontend UI, scripts) act purely as presentation and ingestion agents.

### ADR-03: PostgreSQL as the Durable System of Record
* **Decision**: PostgreSQL is the single authoritative persistent data store for all entities (`jobs`, `job_attempts`, `regions`, `decisions`, `audits`, `experiments`).
* **Rationale**: Relational data integrity, ACID transactional guarantees, foreign key enforcement, and durable historical audit logging are mandatory for compliant scheduling verification.

### ADR-04: Redis as Supporting Operational Infrastructure
* **Decision**: Redis is used strictly for transient caching, distributed mutex locking, and background task queuing.
* **Rationale**: Redis provides high-throughput in-memory capabilities for short-lived carbon cache entries and atomic claim distributed locks without replacing PostgreSQL as durable storage.

### ADR-05: Strict Separation of Region Simulation from Scheduling
* **Decision**: The Region Simulator models physical/simulated hardware, capacity, utilization, and synthetic latency independently of the Decision Engine.
* **Rationale**: Keeps scheduling logic generic and portable. The scheduler evaluates telemetry signals without being coupled to how those signals were generated.

### ADR-06: Decoupling of Carbon Data Integration from Simulated Regional Profiles
* **Decision**: Carbon integration (Electricity Maps API, fallback logic, and observation caching) is handled by an isolated Carbon Service separate from static region profiles.
* **Rationale**: Allows carbon sources to fail, refresh, or switch providers independently without altering simulated hardware models or base region capacities.

### ADR-07: Worker Execution Isolation and Decision Separation
* **Decision**: Execution workers execute assigned attempts; workers must never select or re-route jobs.
* **Rationale**: Preserves single-source-of-truth routing. When an execution fails, the worker reports the failure and relinquishes control back to the Decision Engine.

### ADR-08: Unique Attempt IDs for Every Execution Run
* **Decision**: Every retry creates a distinct `JobAttempt` with a new `attempt_id` and incremented `attempt_number`.
* **Rationale**: Enables comprehensive auditability, accurate per-attempt telemetry tracking, and clean failure forensics without mutating past historical attempt records.

### ADR-09: Region Locking for Running Attempts
* **Decision**: Once an attempt enters `CLAIMED` / `RUNNING` status, the target region is locked for that specific attempt.
* **Rationale**: Live cross-region workload migration mid-execution is outside the project scope and introduces high complexity with questionable carbon ROI. If an attempt fails, it terminates and re-evaluates cleanly.

### ADR-10: Condition- and Deadline-Based Dynamic Deferral
* **Decision**: Deferral is dynamic based on remaining deadline slack, priority, and carbon forecast triggers, rather than an arbitrary static sleep loop.
* **Rationale**: Eliminates wasted idle delays and prevents deadline misses caused by rigid static waiting periods.

### ADR-11: Zero Fabrication of Carbon Intensity Values
* **Decision**: EcoRoute must never fabricate, guess, or synthesize carbon-intensity values if external data is missing.
* **Rationale**: Fabricated carbon metrics corrupt academic baselines and provide false sustainability guarantees. Missing data triggers fallback to cached data or conventional operational scheduling.

### ADR-12: Frontend State Mutation Restriction
* **Decision**: The Next.js frontend has read-only access to scheduling decisions, telemetry, and system state; it cannot directly mutate database records or trigger raw worker commands.
* **Rationale**: Enforces API contract integrity, validates user permissions, and ensures all state transitions pass through the validated backend state machine.

### ADR-13: Logical Simulation of Multi-Cloud Providers
* **Decision**: AWS, Azure, and GCP are modeled as simulated regional targets and metadata baselines; EcoRoute does not provision live third-party cloud infrastructure.
* **Rationale**: Real multi-cloud VM/container provisioning is explicitly outside the academic scope and introduces cloud cost and authentication overhead without altering scheduling intelligence validity.

---

## 2. Requirements Traceability Matrix (FR1 – FR10)

This matrix maps each finalized Functional Requirement (FR) directly to its architectural components and implementing modules.

| Requirement ID | Requirement Summary | Architectural Components | Implementation / Verification Module |
| :--- | :--- | :--- | :--- |
| **FR1** | Workload Intake & Submission Validation | Job Intake, API Layer, PostgreSQL Persistence | `app/api/jobs.py`, `app/persistence/models/job.py` |
| **FR2** | Multi-Region Simulation & Resource Modeling | Region Simulator, External Cloud Profiles | `app/simulation/region_simulator.py`, `app/simulation/profiles.py` |
| **FR3** | Energy & Carbon Footprint Estimation | Energy Estimator, Carbon Service, Electricity Maps Client | `app/energy/estimator.py`, `app/carbon/service.py` |
| **FR4** | Multi-Objective Optimization & Scoring ($J_r$) | Decision Engine, Constraint Evaluator | `app/scheduling/engine.py`, `app/scheduling/constraints.py`, `app/scheduling/scorer.py` |
| **FR5** | Priority & Hard Deadline Enforcement | Constraint Evaluator, Deferral Manager | `app/scheduling/constraints.py`, `app/deferral/manager.py` |
| **FR6** | Condition-Based Dynamic Deferral | Deferral Manager, Redis Timers, Decision Engine | `app/deferral/manager.py`, `app/infrastructure/redis.py` |
| **FR7** | Carbon Fallback & Reliability Hierarchy | Carbon Service, Redis Cache, Decision Engine | `app/carbon/fallback.py`, `app/carbon/cache.py` |
| **FR8** | Execution Failure Handling & Fresh Re-routing | Retry Manager, Decision Engine | `app/execution/retry_manager.py`, `app/scheduling/engine.py` |
| **FR9** | Atomic Claiming & Idempotent Multi-Attempt Execution | Idempotency Manager, Dispatcher, Workers, PostgreSQL | `app/execution/idempotency.py`, `app/execution/dispatcher.py`, `app/execution/worker.py` |
| **FR10** | Scheduling Auditability, Analytics & Controlled Experiments | Analytics & Audit Service, Experiment Engine, PostgreSQL | `app/analytics/audit.py`, `app/experiments/engine.py` |
