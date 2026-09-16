# EcoRoute Architecture Documentation

Welcome to the official Architecture Design documentation for **EcoRoute**, a carbon-aware cloud workload scheduler.

This documentation serves as the authoritative architectural baseline for subsequent Detailed Design, Database Migration, and Implementation phases.

---

## 1. Executive Summary

EcoRoute is an intelligent scheduling system designed to optimize the placement of computational workloads across simulated cloud regions based on carbon intensity, energy estimation, execution duration, capacity utilization, and network latency. EcoRoute balances sustainability (carbon minimization) with operational feasibility (deadlines, priorities, reliability, and SLA requirements).

> [!NOTE]
> Actual multi-cloud execution across real third-party cloud infrastructure is outside the academic scope of this project. Execution targets and regions are modeled as logical/simulated entities.

---

## 2. Documentation Map

The architecture documentation suite is organized modularly as follows:

| Document | Focus Area | Description |
| :--- | :--- | :--- |
| [System Architecture](file:///t:/Taneesh/Documents/Git%20Repos/Eco-Route/docs/architecture/system-architecture.md) | High-Level Architecture & Style | Modular monolith topology, tech stack, global block diagrams, and system context. |
| [Component Architecture](file:///t:/Taneesh/Documents/Git%20Repos/Eco-Route/docs/architecture/component-architecture.md) | Internal Modules & Engines | Detailed specs for Job Intake, Decision Engine, Carbon Service, Simulator, Deferral Manager, Dispatcher, and Workers. |
| [Data Architecture](file:///t:/Taneesh/Documents/Git%20Repos/Eco-Route/docs/architecture/data-architecture.md) | Persistence, Caching & State | PostgreSQL relational schemas, Redis cache/locking roles, state machines (Job/Attempt), and data integrity. |
| [Reliability Architecture](file:///t:/Taneesh/Documents/Git%20Repos/Eco-Route/docs/architecture/reliability-architecture.md) | Reliability, Retries & Idempotency | Execution attempt isolation, atomic claiming, failure recovery, carbon fallbacks, and data flow diagrams. |
| [Architecture Decisions](file:///t:/Taneesh/Documents/Git%20Repos/Eco-Route/docs/architecture/architecture-decisions.md) | ADRs & Traceability Matrix | Authoritative Architecture Decision Records (ADRs 1–13) and Requirements Traceability Matrix (FR1–FR10). |

---

## 3. Core Architectural Principles

1. **Modular Monolith**: Core intelligence and workflows reside inside a structured FastAPI application with strict boundary isolation, avoiding premature distributed complexity.
2. **Hard Constraints First**: Operational constraints (hardware sizing, deadlines) always take precedence over carbon optimization.
3. **No Carbon Fabrication**: EcoRoute never synthesizes or guesses carbon-intensity values; when trustworthy live and cached data are absent, it falls back deterministically to conventional operational routing.
4. **Idempotent Multi-Attempt Execution**: Logical workloads (`Job ID`) are decoupled from physical/simulated execution runs (`Attempt ID`), with distributed atomic claims preventing duplicate execution.
5. **Region Locking on Run**: Deferral is dynamic prior to dispatch, but once an attempt begins execution in a region, that region is locked for the duration of the attempt.
