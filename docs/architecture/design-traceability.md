# Design Traceability Matrix

This document provides full traceability connecting the finalized Functional Requirements (**FR1 through FR10**) to all architectural, component, database, scheduling, and API design specifications.

---

## 1. Requirements-to-Design Traceability Matrix

| Req ID | Requirement Summary | System Architecture | Component Design | Database Schema | Scheduling Engine | API Endpoint | Verification Test Target |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **FR1** | Workload Intake & Submission Validation | `system-architecture.md` | `Job API` | `jobs` table | `validate_job_parameters` | `POST /jobs` | Unit & API Tests |
| **FR2** | Multi-Region Simulation & Modeling | `system-architecture.md` | `Region Simulator` | `regions` table | `discover_regions` | `GET /regions` | Simulation Tests |
| **FR3** | Energy & Carbon Footprint Estimation | `system-architecture.md` | `Energy Estimator`, `Carbon Service` | `carbon_observations` table | $E_r$, $C_r$ Equations | `GET /carbon/...` | Energy Model Tests |
| **FR4** | Multi-Objective Optimization ($J_r$) | `system-architecture.md` | `Decision Engine`, `Score Calculator` | `scheduling_decisions` table | $J_r$ Scoring & Normalization | `GET /scheduling/...`| Scorer & Ranking Tests |
| **FR5** | Priority & Hard Deadline Enforcement | `system-architecture.md` | `Constraint Evaluator` | `jobs.deadline`, `jobs.priority` | Slack & Deadline Gating | `POST /jobs` | Constraint Tests |
| **FR6** | Condition-Based Dynamic Deferral | `system-architecture.md` | `Deferral Manager` | `jobs.status = 'WAITING'` | Green Forecast Threshold $\epsilon$ | `GET /jobs/{id}` | Deferral Loop Tests |
| **FR7** | Carbon Fallback & Reliability Hierarchy | `reliability-architecture.md` | `Carbon Service`, `Carbon Cache` | `carbon_observations.data_quality` | Live $\to$ Cache $\to$ Conventional | `GET /carbon/...` | Fallback Tests |
| **FR8** | Failure Recovery & Fresh Central Routing| `reliability-architecture.md` | `Retry Manager`, `Decision Engine` | `job_attempts.status = 'FAILED'` | Fresh Pipeline Re-routing | `GET /attempts/...` | Retry Routing Tests |
| **FR9** | Atomic Claiming & Idempotent Multi-Attempt Execution | `reliability-architecture.md` | `Idempotency Manager`, `Worker` | `UNIQUE(job_id, attempt_number)` | PostgreSQL CAS Claim Update | `GET /attempts/...` | Concurrency Race Tests |
| **FR10**| Scheduling Auditability & Benchmark Experiments | `system-architecture.md` | `Audit Service`, `Experiment Engine`| `audit_events`, `experiments`, `experiment_results` | 5 Scheduler Variants | `POST /experiments` | Benchmark Suite Tests |

---

## 2. Design Completeness Checklist

- [x] **FR1–FR10 Full Coverage**: Every finalized requirement has architectural, database, and API design mapping.
- [x] **System Boundaries Explicit**: Next.js (presentation only), FastAPI (modular monolith application tier), PostgreSQL (authoritative durable store), Redis (auxiliary cache/locks/queues).
- [x] **Component Ownership Defined**: All 24 backend components have explicit responsibilities, inputs, outputs, and non-responsibilities.
- [x] **Relational Schema Specified**: All 8 core tables documented with types, constraints, and JSONB schemas in PostgreSQL.
- [x] **Scheduling Mathematics Defined**: Full formulas for $T_r, P(U), \Delta P, E_r, C_r, N(\cdot)$, and composite cost $J_r$.
- [x] **Zero Carbon Fabrication Enforced**: Missing carbon triggers conventional fallback ($w_C = 0$); values are never guessed.
- [x] **Atomic Claim Mechanics Established**: PostgreSQL CAS updates prevent duplicate execution across parallel workers.
- [x] **Centralized Fresh Retry Routing**: Failed attempts never reuse stale decisions; every retry receives a new Attempt ID.
- [x] **Region Locking Enforced**: Active running attempts remain locked to their assigned target region.
- [x] **Experiment Reproducibility Guaranteed**: Frozen random seeds and immutable experiment tables benchmark all 5 scheduler variants.
