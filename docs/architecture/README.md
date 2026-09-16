# EcoRoute Architecture & Design Documentation

Authoritative architecture and detailed engineering design baseline for **EcoRoute**, a carbon-aware cloud workload scheduler.

> [!NOTE]
> Execution targets and regions are modeled as logical/simulated entities. Real multi-cloud infrastructure provisioning is outside the academic scope.

---

## Documentation Suite Map

| Document | Focus Area | Description |
| :--- | :--- | :--- |
| [System Architecture](system-architecture.md) | High-Level Architecture | System topology, modular monolith style, technology boundaries, and system block diagrams. |
| [Component Architecture](component-architecture.md) | High-Level Modules | Module overview, domain contracts, and boundaries across core functional areas. |
| [Component Design](component-design.md) | Internal Component Specs | Detailed specifications for all 24 backend components across API, Scheduling, Simulation, Carbon, Execution, and Analytics. |
| [Domain Model Design](domain-model-design.md) | Domain Model & Services | Domain entities, aggregates, and application service boundaries. |
| [Data Architecture](data-architecture.md) | Data Overview & States | Relational architecture, Redis operational role, and Job/Attempt state machines. |
| [Database Design](database-design.md) | Logical Schema & Persistence | Supabase PostgreSQL schema, constraints, JSONB definitions, and database-level atomic claim mechanics. |
| [Scheduling Engine Design](scheduling-engine-design.md) | Scheduling Intelligence | Mathematical formulations ($J_r, E_r, C_r$), normalization, zero-fabrication fallback, and condition deferral. |
| [API Contract Design](api-contract-design.md) | Interface Boundary | REST resource groups, request/response models, and Pydantic validation boundaries between Next.js and FastAPI. |
| [Interaction Design](interaction-design.md) | Sequence Flows | Runtime sequence diagrams for normal scheduling, deferrals, retries, and duplicate delivery prevention. |
| [Reliability & Failure Handling](reliability-design.md) | Fault Tolerance | Zero-fabrication carbon fallback, attempt failure recovery, atomic claims, and Redis/PostgreSQL outage mitigations. |
| [Security Design](security-design.md) | Security & Access Control | Backend trust boundary, Pydantic input sanitization, parameterized SQL, and immutable audit ledgers. |
| [Frontend Architecture](frontend-architecture.md) | Presentation Tier | Next.js 16 app structure, component hierarchy, MapLibre GL mapping, and real-time dashboard views. |
| [Experiment & Evaluation Design](experiment-design.md) | Academic Benchmarking | Controlled experiment methodology, evaluation metrics, and reproducibility across 5 standardized scheduler variants. |
| [Architecture Decisions (ADRs)](architecture-decisions.md) | Architecture Decisions | Authoritative Architecture Decision Records (ADR-01 through ADR-13). |
| [Design Traceability Matrix](design-traceability.md) | Requirements Traceability | End-to-end matrix mapping requirements FR1–FR10 across all design specifications. |

---

## Core Architectural Principles

1. **Modular Monolith**: Clean domain boundaries in a single FastAPI application; avoids premature distributed complexity.
2. **Hard Constraints First**: Hardware limits and deadlines always take precedence over carbon optimization.
3. **No Carbon Fabrication**: Missing carbon data triggers fallback to cache or conventional routing without fabricating numbers.
4. **Idempotent Multi-Attempt Execution**: Logical `Job ID` is decoupled from physical `Attempt ID` with database-enforced atomic claiming.
5. **Region Locking**: Region placement is locked once execution begins for that attempt.
