# Experiment & Evaluation Design

This document defines the methodology, evaluation metrics, and reproducibility controls for controlled academic benchmarks within EcoRoute.

---

## 1. Experiment Structure & Benchmark Variants

Every experiment harness executes identical synthetic workload batches across five standardized scheduler algorithms:

```text
Experiment Definition
├── Scenario Type (e.g., Grid Carbon Volatility, Capacity Congestion)
├── Workload Batch Configuration (Demands, Durations, Deadlines)
├── Region Configuration (Capacities, Power Specs, Latencies)
├── Deterministic Random Seed (Frozen across comparative runs)
└── Execution Across 5 Schedulers:
      ├── 1. CONVENTIONAL       (Lowest Latency / First-Fit)
      ├── 2. RANDOM             (Random Feasible Placement)
      ├── 3. CARBON_ONLY        (Minimum Carbon, Ignoring Latency/Cost)
      ├── 4. PERFORMANCE_ONLY   (Fastest Region Execution Duration)
      └── 5. ECOROUTE           (Normalized Multi-Objective Jr Optimization)
```

---

## 2. Evaluation Metrics

| Metric | Measurement Unit | Evaluation Objective |
| :--- | :--- | :--- |
| **Total Energy** | Kilowatt-hours (kWh) | Evaluates total computational energy efficiency across workloads. |
| **Total Emissions** | Grams $\text{CO}_2\text{eq}$ | Measures aggregate carbon reduction vs baseline schedulers. |
| **Execution Duration** | Seconds | Quantifies impact on workload runtime and performance factors. |
| **Network Latency** | Milliseconds (ms) | Measures network responsiveness and SLA degradation. |
| **Deadline Compliance** | Percentage ($0.0 - 1.0$) | Evaluates strict operational SLA adherence and zero deadline misses. |
| **Failure Rate** | Percentage ($0.0 - 1.0$) | Quantifies attempt error frequency and simulated node resilience. |
| **Retry Rate** | Percentage ($0.0 - 1.0$) | Measures system recovery and re-routing efficiency. |
| **Deferral Rate** | Percentage ($0.0 - 1.0$) | Quantifies temporal flexibility utilization for green grid windows. |
| **Duplicate Executions** | Integer Count | Must be strictly `0` across all runs, verifying atomic idempotency claims. |
| **Capacity Utilization** | Percentage ($0.0 - 1.0$) | Measures load balancing and regional congestion distribution. |

---

## 3. Academic Reproducibility & Audit Standards

To guarantee strict academic reproducibility:
1. **Frozen Random Seeds**: Synthetic workload generation and simulation perturbations are initialized with a fixed random seed.
2. **Immutable Experiment Records**: Experiment definitions, scenario parameters, and resulting telemetry are persisted in PostgreSQL (`experiments` and `experiment_results` tables).
3. **Identical Inputs**: All 5 comparison algorithms evaluate identical workload arrival sequences and regional starting conditions.
