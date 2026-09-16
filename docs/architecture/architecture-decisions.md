# Architecture Decisions & Requirements Traceability

This document records the official Architecture Decision Records (ADRs) and Requirements Traceability Matrix for EcoRoute.

---

## 1. Architecture Decision Records (ADRs)

| ADR ID | Title | Decision | Rationale |
| :--- | :--- | :--- | :--- |
| **ADR-01** | Modular Monolith Backend | Build a modular FastAPI monolith instead of distributed microservices. | Eliminates network serialization latency and distributed transaction complexity while enabling deterministic simulation experiments. |
| **ADR-02** | Backend Intelligence Ownership | Centralize all scheduling algorithms, scoring ($J_r$), and deferral logic in FastAPI. | Prevents business logic duplication; ensures clients act strictly as presentation/intake agents. |
| **ADR-03** | PostgreSQL System of Record | Use PostgreSQL as the authoritative persistent data store. | Relational integrity, ACID transactions, and durable audit logs are mandatory for verifiable scheduling. |
| **ADR-04** | Redis Supporting Role | Use Redis strictly for transient caching, distributed locks, and queues. | Provides high-throughput in-memory operations without replacing PostgreSQL as durable storage. |
| **ADR-05** | Simulation / Scheduler Separation | Decouple the Region Simulator from the Decision Engine. | Keeps scheduling logic generic; scheduler evaluates telemetry signals without knowing how they were simulated. |
| **ADR-06** | Carbon Service Decoupling | Isolate carbon data fetching and caching from static region hardware profiles. | Allows carbon sources to fail, refresh, or switch providers without altering hardware models. |
| **ADR-07** | Worker Execution Isolation | Workers execute decisions and report outcomes; workers never select or re-route jobs. | Preserves single-source-of-truth routing in the Decision Engine upon failure. |
| **ADR-08** | Unique Attempt ID per Retry | Every retry creates a distinct `JobAttempt` with a new `attempt_id` and incremented counter. | Enables complete forensic auditability and accurate telemetry without mutating past attempt records. |
| **ADR-09** | Region-Locked Execution | Running attempts are strictly locked to their assigned target region. | Live cross-region migration introduces high overhead with minimal carbon benefit; failed runs re-evaluate cleanly. |
| **ADR-10** | Dynamic Condition Deferral | Deferral is dynamic based on deadline slack and carbon forecast triggers, not static sleep loops. | Avoids unnecessary idle delays and prevents deadline breaches caused by rigid static waiting times. |
| **ADR-11** | Zero Carbon Fabrication | Never synthesize or guess missing carbon intensity values. | Fabricated values compromise research validity. System falls back gracefully to cache or conventional routing. |
| **ADR-12** | Frontend Mutation Restriction | Frontend has read-only access to decisions/state and cannot bypass backend validation. | Enforces state machine integrity and guarantees all transitions are validated by the backend. |
| **ADR-13** | Logical Multi-Cloud Simulation | AWS, Azure, and GCP are modeled as simulated regional targets and reference profiles. | Real multi-cloud infrastructure provisioning is outside academic scope; simulation provides full experimental control. |

---

## 2. Requirements Traceability Matrix (FR1 – FR10)

| Requirement ID | Requirement Summary | Architectural Components | Implementing Module(s) |
| :--- | :--- | :--- | :--- |
| **FR1** | Workload Intake & Validation | Job Intake, API Layer, PostgreSQL | `app/api/jobs.py`, `app/persistence/models/job.py` |
| **FR2** | Multi-Region Simulation | Region Simulator, Cloud Profiles | `app/simulation/region_simulator.py`, `app/simulation/profiles.py` |
| **FR3** | Energy & Carbon Estimation | Energy Estimator, Carbon Service | `app/energy/estimator.py`, `app/carbon/service.py` |
| **FR4** | Multi-Objective Optimization ($J_r$) | Decision Engine, Constraint Evaluator | `app/scheduling/engine.py`, `app/scheduling/scorer.py` |
| **FR5** | Priority & Hard Deadlines | Constraint Evaluator, Deferral Manager | `app/scheduling/constraints.py`, `app/deferral/manager.py` |
| **FR6** | Condition-Based Dynamic Deferral | Deferral Manager, Redis Timers | `app/deferral/manager.py`, `app/infrastructure/redis.py` |
| **FR7** | Carbon Fallback & Reliability | Carbon Service, Redis Cache | `app/carbon/fallback.py`, `app/carbon/cache.py` |
| **FR8** | Failure Recovery & Fresh Re-routing | Retry Manager, Decision Engine | `app/execution/retry_manager.py`, `app/scheduling/engine.py` |
| **FR9** | Atomic Claims & Idempotency | Idempotency Manager, Dispatcher, Workers | `app/execution/idempotency.py`, `app/execution/worker.py` |
| **FR10** | Auditability & Experiments | Analytics & Audit, Experiment Engine | `app/analytics/audit.py`, `app/experiments/engine.py` |
