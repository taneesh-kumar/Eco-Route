# Frontend Architecture Design

This document specifies the presentation tier architecture, component hierarchy, mapping integrations, and state management for the EcoRoute web application.

---

## 1. Technology Baseline & Architecture

* **Framework**: Next.js 16 (App Router, React 19, TypeScript)
* **Styling**: Tailwind CSS, shadcn/ui component library
* **Mapping Engine**: MapLibre GL for regional geography and carbon heatmaps
* **Data Fetching**: Typed API client consuming FastAPI REST endpoints

```text
Next.js 16 Application
├── app/
│   ├── (dashboard)/
│   │   ├── jobs/           # Workload submission & real-time monitoring
│   │   ├── decisions/      # Explainable scheduling score views
│   │   ├── map/            # Geographic region & carbon visualization
│   │   ├── analytics/      # Sustainability KPIs & counterfactuals
│   │   └── experiments/    # Benchmark configurations & results
├── components/
│   ├── ui/                 # shadcn/ui foundational primitives
│   ├── jobs/               # Workload intake forms & status tables
│   ├── map/                # MapLibre GL canvas, markers, overlays
│   └── decisions/          # Jr score breakdown charts & radar plots
└── lib/
    ├── api-client.ts       # Typed HTTP client interacting with FastAPI
    └── types.ts            # Frontend TypeScript models (synced with Pydantic)
```

---

## 2. Key Frontend Views & Responsibilities

| View / Module | Key UI Components | Responsibilities | Boundary Constraint |
| :--- | :--- | :--- | :--- |
| **Job Dashboard** | Workload Intake Form, Active Workload Table, Lifecycle Badges | Submit new computational workloads; monitor real-time statuses (`PENDING`, `EVALUATING`, `WAITING`, `RUNNING`, `COMPLETED`, `FAILED`); view attempt histories. | Presentation only; no direct execution or state mutation. |
| **Scheduling Decision View** | Score Breakdown Cards, Radar Visualizer, Candidate Rank List | Display winning region, composite $J_r$ score, weighted sub-factors ($E_r \times CI_r$, $T_r$, $U_r$, $L_r$), carbon provenance (`LIVE`, `CACHED`, `UNAVAILABLE`), and decision rationale. | Visual explanation only; does not re-compute scores. |
| **Region Map View** | MapLibre GL Canvas, Regional Node Pins, Carbon Heatmap Overlay | Render simulated cloud regions geographically; display live utilization rings, latency vectors, and regional grid carbon intensity ($g\text{CO}_2\text{eq}/\text{kWh}$). | Visualization only; never makes placement decisions. |
| **Analytics View** | KPI Metric Cards, Time-Series Emission Charts, Counterfactual Graphs | Present aggregate $\text{CO}_2\text{eq}$ reductions vs conventional baselines, total kWh energy consumed, mean latency, and deadline compliance rates. | Consumes aggregated backend metrics via Analytics API. |
| **Experiment View** | Benchmark Runner Form, Comparative Result Matrix, Seed Inspector | Configure and trigger benchmark harnesses; visualize side-by-side performance across all 5 scheduler variants (`CONVENTIONAL`, `RANDOM`, `CARBON_ONLY`, `PERFORMANCE_ONLY`, `ECOROUTE`). | Consumes backend Experiment Engine results. |
