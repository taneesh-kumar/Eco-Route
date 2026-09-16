# EcoRoute Architecture Documentation

Authoritative architecture and detailed design baseline for **EcoRoute**, a carbon-aware cloud workload scheduler.

> [!NOTE]
> Execution targets and regions are modeled as logical/simulated entities. Real multi-cloud infrastructure provisioning is outside the project scope.

---

## Documentation Map

| Document | Description |
| :--- | :--- |
| [System Architecture](system-architecture.md) | High-level topology, modular monolith style, tech stack boundaries, and system diagrams. |
| [Component Architecture](component-architecture.md) | High-level module specifications, contracts, and boundaries across the 15 core architectural areas. |
| [Component Design](component-design.md) | Implementation-oriented specifications for all 24 backend components across API, Scheduling, Simulation, Carbon, Execution, and Analytics. |
| [Data Architecture](data-architecture.md) | High-level relational schema, Redis operational role, and Job/Attempt state machines. |
| [Database Design](database-design.md) | Detailed Supabase PostgreSQL schema, indexes, integrity constraints, JSONB schemas, and atomic CAS claim mechanics. |
| [Scheduling Engine Design](scheduling-engine-design.md) | Detailed scheduling pipeline, mathematical models ($J_r, E_r, C_r$), normalization, zero-fabrication fallback, deferral, and retry re-routing. |
| [Reliability Architecture](reliability-architecture.md) | Attempt isolation, retry mechanics, atomic claims, carbon fallback hierarchy, and sequence flows. |
| [Architecture Decisions (ADRs)](architecture-decisions.md) | 13 Architecture Decision Records and Requirements Traceability Matrix (FR1–FR10). |

---

## Core Architectural Principles

1. **Modular Monolith**: Clean domain boundaries in a single FastAPI application; avoids premature distributed complexity.
2. **Hard Constraints First**: Hardware limits and deadlines always take precedence over carbon optimization.
3. **No Carbon Fabrication**: Missing carbon data triggers fallback to cache or conventional routing without fabricating numbers.
4. **Idempotent Multi-Attempt Execution**: Logical `Job ID` is decoupled from physical `Attempt ID` with atomic claiming.
5. **Region Locking**: Region placement is locked once execution begins for that attempt.
