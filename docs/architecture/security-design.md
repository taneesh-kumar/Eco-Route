# Security Design

This document specifies the security boundaries, authorization models, input sanitization, and data protection mechanisms for EcoRoute.

---

## 1. Security Architecture & Boundaries

```text
Untrusted Client Tier (Next.js 16 / Web Browser)
                    │
                    │ HTTPS / TLS 1.3
                    ▼
FastAPI Boundary Layer
   ├── JWT / Bearer Token Authentication
   ├── Role-Based Access Control (RBAC)
   ├── Pydantic Request Validation & Bounds Checking
   └── Rate Limiting
                    │
                    ▼
Domain & Scheduling Engine (Authoritative Validation)
                    │
                    ▼ (SQLAlchemy Async / Parameterized Queries)
Supabase PostgreSQL (Protected Relational Store)
```

---

## 2. Core Security Controls

### 2.1 Backend-Enforced Trust Model
* **Zero Client Trust**: The Next.js frontend is strictly a presentation and intake agent. Clients are never trusted to enforce scheduling, feasibility, or execution rules.
* **Tamper-Proof State**: Clients cannot force a region placement, bypass deadline constraints, or directly mutate job attempt lifecycle states. All state transitions pass through validated backend state machines.

### 2.2 Input Validation & Boundary Defense
* **Schema Validation**: All inbound JSON payloads are strictly validated using Pydantic v2 schemas.
* **Boundary Checks**: Numerical demands (CPU cores $> 0$, RAM $> 0$, duration $> 0$, priority $1 \le P \le 10$, deadline $> t_{\text{now}}$) are verified before any domain logic executes. Malformed payloads are rejected with HTTP `422 Unprocessable Entity`.

### 2.3 Injection & Database Protection
* **Parameterized SQL**: All database interactions are executed via SQLAlchemy 2.0 ORM and Core parameterized queries, preventing SQL injection vulnerabilities.
* **Credentials Isolation**: Database connection strings, Supabase service keys, and Electricity Maps API tokens are injected via environment variables and never exposed to the client bundle.

### 2.4 Auditability & Non-Repudiation
* **Immutable Event Logging**: All state transitions (`JOB_CREATED`, `DECISION_MADE`, `ATTEMPT_CLAIMED`, `EXECUTION_COMPLETED`, `RETRY_CREATED`) are logged as immutable records in the `audit_events` table with timestamps, actor metadata, and full forensic context.
