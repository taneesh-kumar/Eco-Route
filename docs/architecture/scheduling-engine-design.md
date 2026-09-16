# Scheduling Engine Design

This document defines the scheduling logic, decision pipeline, mathematical models, constraint filtering, carbon resolution, deferral mechanics, and retry flows for the EcoRoute Scheduling Engine.

---

## 1. Scheduling Objective

The Scheduling Engine performs two decoupled decisions for each workload:
1. **Region Selection**: Identifies the optimal feasible simulated region based on operational constraints, energy, carbon, utilization, and latency.
2. **Execution Timing (`EXECUTE` vs. `DEFER`)**: Determines whether to dispatch immediately or hold in `WAITING` state to leverage a near-term lower-carbon opportunity while remaining safely within deadline slack.

---

## 2. Complete Scheduling Pipeline

```mermaid
flowchart TD
    Job([Workload Request]) --> V[1. Validate Job Input]
    V --> CR[2. Discover Candidate Regions]
    CR --> HC[3. Hard Constraint Evaluation]
    
    HC --> FeasCheck{Feasible Regions Exist?}
    FeasCheck -- NO --> ZeroFeas[Evaluate Slack & Deadlines]
    ZeroFeas -->|Slack Available| ActWait([Action: DEFER to WAITING])
    ZeroFeas -->|Slack Exhausted| ActFail([Action: REJECT / UNSCHEDULABLE])
    
    FeasCheck -- YES --> FeasPool[(Feasible Candidate Set)]
    
    FeasPool --> CR_Res[4. Resolve Carbon Data]
    CR_Res --> CarbCheck{Trustworthy Carbon Available?}
    
    CarbCheck -- NO --> ConvFB[Conventional Operational Mode<br/>(Time, Utilization, Latency only)]
    CarbCheck -- YES --> EE[5. Deterministic Energy Estimation]
    
    EE --> EM[6. Calculate Emissions Cr]
    EM --> NORM[7. Min-Max Normalization over Feasible Set]
    NORM --> SC[8. Calculate Composite Jr Score]
    
    SC --> RANK[9. Deterministic Region Ranking & Tie-Breaking]
    ConvFB --> RANK
    
    RANK --> DEF_EVAL[10. Priority, Deadline Slack & Opportunity Check]
    
    DEF_EVAL --> DecisionAction{Final Action Determination}
    DecisionAction -->|Dispatch Now| DispatchAct([Action: EXECUTE winning region])
    DecisionAction -->|Safe Green Opportunity| DeferAct([Action: DEFER to WAITING])
```

---

## 3. Mathematical Models & Scoring Formulation

### 3.1 Energy Estimation ($E_r$)
Deterministic modeling of workload energy consumption:
* **Execution Duration ($T_r$)**:
  $$T_r = \frac{T_{\text{base}}}{\text{PerformanceFactor}_r}$$
* **Power Scaling ($P(U)$)**:
  $$P(U) = P_{\text{idle}} + (P_{\text{peak}} - P_{\text{idle}}) \cdot U$$
* **Differential Workload Power ($\Delta P$)**:
  $$\Delta P = P(U_{\text{after}}) - P(U_{\text{before}})$$
* **Total Estimated Energy ($E_r$) in kWh**:
  $$E_r = \frac{\Delta P \times T_r}{3{,}600{,}000}$$

> **Note**: $E_r$ is a deterministic simulation estimate derived from modeled power curves, not a physical wattmeter measurement.

### 3.2 Emissions Calculation ($C_r$)
$$C_r = E_r \times CI_r \quad (g\text{CO}_2\text{eq})$$
* If carbon data is `UNAVAILABLE`, $C_r$ is recorded as `UNAVAILABLE` (never zero).

### 3.3 Normalization (Feasible Set Only)
For each lower-is-better metric $x_r \in \{C_r, T_r, U_r, L_r\}$:
$$N(x_r) = \begin{cases} \frac{x_r - x_{\min}}{x_{\max} - x_{\min}} & \text{if } x_{\max} > x_{\min} \\ 0.0 & \text{if } x_{\max} == x_{\min} \end{cases}$$

### 3.4 Multi-Objective Cost Function ($J_r$)
$$J_r = w_C \cdot N(E_r \times CI_r) + w_T \cdot N(T_r) + w_U \cdot N(U_r) + w_L \cdot N(L_r)$$
* **Weight Constraint**: $w_C + w_T + w_U + w_L = 1.0$ ($w_i \ge 0$).
* **Optimization Goal**: Lower $J_r$ indicates superior placement.
* **Conventional Fallback Scoring**: When carbon is `UNAVAILABLE`, $w_C = 0$ and weights are re-normalized ($w_T' + w_U' + w_L' = 1.0$). Carbon values are **never fabricated**.

---

## 4. Constraint Evaluation & Edge Cases

### 4.1 Hard Feasibility Constraints
A region must satisfy all hard constraints before scoring:
1. `Region.is_available == True`
2. `Region.available_cpu >= Job.cpu_demand`
3. `Region.available_ram >= Job.memory_demand`
4. `t_now + T_r + L_r <= t_deadline`

Infeasible regions are dropped immediately, recorded with rejection reasons, and never receive a $J_r$ score.

### 4.2 Zero Feasible Regions Handling
* If $\text{Slack} = t_{\text{deadline}} - (t_{\text{now}} + T_{\text{base}}) > 0$: Job transitions to `WAITING` to await capacity deallocation.
* If $\text{Slack} \le 0$: Job transitions to `FAILED` (`UNSCHEDULABLE`). Hard constraints are never bypassed.

### 4.3 Deterministic Tie-Breaking
If $J_A == J_B$:
* **With Carbon**: (1) Lower emissions $C_r \to$ (2) Lower duration $T_r \to$ (3) Lexicographical `region.code`.
* **Without Carbon**: (1) Lower duration $T_r \to$ (2) Lexicographical `region.code`.

---

## 5. Deferral, Region Locking & Retries

### 5.1 Deferral & Slack Rules
$$\text{Slack} = t_{\text{deadline}} - (t_{\text{now}} + T_{\text{best}} + L_{\text{best}})$$
* **Slack $\le 0$**: Immediate execution required (`EXECUTE`).
* **Slack $> 0$**: Deferral to `WAITING` permitted if a verified carbon forecast indicates $J_{\text{future}} < J_{\text{current}} - \epsilon$.
* **Re-evaluation Triggers**: Carbon updates, capacity releases, tick timers, or expiring slack trigger a full fresh evaluation through the pipeline.

### 5.2 Region Locking
Once an attempt enters `RUNNING`, its target region is locked for the life of that attempt. Mid-execution live migrations are prohibited.

### 5.3 Retry Scheduling
* Failed attempts report to the **Retry Manager**.
* If retry quota ($N < N_{\text{max}}$) and slack permit, the **Decision Engine** performs a fresh scheduling evaluation under live dynamic signals and creates a new `attempt_id`.
* Previous regions are never blindly reused.

---

## 6. Complete Scheduling Algorithm

```text
function schedule_workload(job: Job) -> SchedulingDecision:
    candidates = get_all_active_regions()
    feasible = [r for r in candidates if is_feasible(job, r)]

    if len(feasible) == 0:
        return DEFER if has_slack(job) else REJECT

    carbon_obs = {r.id: get_carbon(r.id) for r in feasible}
    carbon_available = all(obs.quality in [LIVE, CACHED] for obs in carbon_obs.values())

    if not carbon_available:
        scores = compute_conventional_scores(job, feasible)
    else:
        raw_metrics = compute_metrics(job, feasible, carbon_obs)
        scores = compute_jr_scores(min_max_normalize(raw_metrics))

    ranked = sort_and_tie_break(feasible, scores, carbon_available)
    best = ranked[0]

    slack = job.deadline - (now() + best.t_r + best.latency)
    if slack > 0 and has_green_forecast_window(best, slack, epsilon):
        return create_decision(job.id, action=DEFER, rankings=ranked)

    return create_decision(job.id, action=EXECUTE, selected=best, rankings=ranked)
```

---

## 7. Decision Output Schema & Sequence Flows

### 7.1 Decision Output Schema
`decision_id`, `job_id`, `decision_action` (`EXECUTE`/`DEFER`/`REJECT`), `selected_region_id`, `cost_score_jr`, `estimated_energy_kwh`, `estimated_co2eq_grams`, `carbon_source_used`, `carbon_quality_used`, `fallback_mode`, `decision_reason`, `score_breakdown` (`JSONB`), `candidate_rankings` (`JSONB`), `applied_weights` (`JSONB`), `normalization_factors` (`JSONB`), `decision_timestamp`.

### 7.2 Decision Sequence Flows

```mermaid
sequenceDiagram
    autonumber
    participant API as Job API / Client
    participant DE as Decision Engine
    participant CE as Constraint Evaluator
    participant CS as Carbon Service
    participant EE as Energy Estimator
    participant SC as Score Calculator
    participant DM as Deferral Manager
    participant DISP as Dispatcher

    API->>DE: schedule(job)
    DE->>CE: filter_feasible(job, regions)
    CE-->>DE: Feasible Candidate Set
    DE->>CS: get_carbon(feasible)
    CS-->>DE: CI_r (or UNAVAILABLE flag)
    DE->>EE: estimate_energy(job, feasible)
    EE-->>DE: E_r (kWh)
    DE->>SC: calculate_jr(E_r, CI_r, T_r, U_r, L_r)
    SC-->>DE: Ranked regions & breakdowns
    DE->>DM: check_deferral(ranked, deadline, priority)
    
    alt Action = EXECUTE
        DM-->>DE: EXECUTE
        DE->>DISP: dispatch(job.id, winning_region)
    else Action = DEFER
        DM-->>DE: DEFER
        Note over DE: Transition Job to WAITING; set Redis trigger
    end
```

---

## 8. Non-Negotiable Scheduling Invariants

1. **Constraints Precede Optimization**: Infeasible regions are never scored.
2. **Zero Carbon Fabrication**: Missing carbon triggers conventional fallback ($w_C = 0$); values are never guessed.
3. **Normalized Scope**: Min-max normalization operates strictly across feasible candidates.
4. **Deterministic Ranking**: All rankings and tie-breakers are reproducible without random selection.
5. **Deadline Invariance**: Deferral is strictly forbidden if waiting risks missing the deadline.
6. **Fresh Re-evaluation**: Deferred workloads and retries undergo full fresh pipeline evaluations.
7. **Region Locking**: Active running attempts are locked to their assigned target region.
8. **Decoupled Workers**: Execution workers execute attempts and report status; workers never make routing decisions.
9. **Full Auditability**: Every decision record preserves complete sub-scores, weights, and candidate rankings.
