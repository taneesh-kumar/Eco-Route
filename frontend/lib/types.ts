/**
 * TypeScript type definitions for EcoRoute Next.js Frontend.
 * Synced directly with FastAPI Pydantic v2 schemas and domain models.
 */

export type JobStatus =
  | "PENDING"
  | "WAITING"
  | "SCHEDULED"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type WorkloadType = "BATCH" | "INFERENCE" | "TRAINING";

export type DecisionAction = "SCHEDULE" | "EXECUTE" | "DEFER" | "REJECT";

export type AttemptStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";

export type CarbonQuality = "LIVE" | "VALID_CACHE" | "FALLBACK_CACHE" | "UNTRUSTED" | "UNAVAILABLE";

export type CarbonSource = "ELECTRICITY_MAPS" | "WATTHOURS" | "CARBON_INTERFACE" | "STATIC_FALLBACK";

export type SchedulerVariant =
  | "ECOROUTE"
  | "CONVENTIONAL"
  | "CARBON_ONLY"
  | "PERFORMANCE_ONLY"
  | "RANDOM";

export interface ComponentHealth {
  status: string;
  message: string;
}

export interface HealthResponse {
  status: "healthy" | "degraded" | "unhealthy";
  environment: string;
  components: {
    api: ComponentHealth;
    database: ComponentHealth;
    redis: ComponentHealth;
  };
}

export interface WorkloadDemand {
  cpu_demand: number;
  memory_demand: number;
  base_execution_duration: number;
}

export interface SchedulingWeights {
  carbon_weight: number;
  time_weight?: number;
  utilization_weight?: number;
  latency_weight: number;
  cost_weight?: number; // legacy fallback
}

export interface JobCreatePayload {
  workload_name: string;
  workload_type: WorkloadType;
  cpu_cores: number;
  memory_gb: number;
  estimated_duration_seconds: number;
  priority: number;
  priority_class?: "HIGH" | "MEDIUM" | "LOW";
  deadline_offset_seconds: number;
  max_retries?: number;
  carbon_weight?: number;
  time_weight?: number;
  utilization_weight?: number;
  cost_weight?: number;
  latency_weight?: number;
}

export interface JobResponse {
  id: string;
  workload_name: string;
  workload_type: WorkloadType;
  cpu_demand: number;
  memory_demand: number;
  base_execution_duration?: number;
  estimated_duration_seconds?: number;
  priority: number;
  priority_class?: "HIGH" | "MEDIUM" | "LOW";
  deadline: string;
  status: JobStatus;
  current_attempt_count: number;
  max_retries: number;
  assigned_region_id: string | null;
  assigned_region_code?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SelectedCandidateSnapshot {
  selected_region_id: string | null;
  selected_region_code: string | null;
  carbon_intensity_gco2_per_kwh: number | null;
  carbon_source: string;
  carbon_quality: string;
  carbon_is_estimated: boolean;
  carbon_estimation_method: string | null;
  carbon_observed_at: string | null;
  carbon_cache_age_seconds: number | null;
  carbon_max_cache_age_seconds?: number | null;
  energy_kwh: string | number | null;
  estimated_emissions_co2eq_grams: string | number | null;
  duration_seconds: string | number | null;
  projected_utilization: number | null;
  latency_ms: number | null;
  composite_score: number | null;
}

export interface StructuredDeferralInfo {
  forecast_status: string;
  forecast_source: string;
  forecast_checked_until?: string | null;
  deferral_eligible: boolean;
  deferral_reason: string;
  priority?: number | null;
  priority_class?: "HIGH" | "MEDIUM" | "LOW" | string | null;
  deferral_policy?: string | null;
  current_expected_emissions?: number | string | null;
  future_expected_emissions?: number | string | null;
  expected_savings?: number | string | null;
  relative_improvement_pct?: number | string | null;
  deferral_threshold_pct?: number | string | null;
  forecast_timestamp?: string | null;
}

export interface CandidateRanking {
  region_id: string;
  region_code: string;
  rank: number;
  composite_score: number;
  carbon_intensity_gco2: number | null;
  raw_carbon_gco2: number;
  raw_latency_ms: number;
  raw_energy_kwh?: number;
  raw_duration_seconds?: number;
  projected_utilization?: number;
  norm_carbon: number;
  norm_duration?: number;
  norm_utilization?: number;
  norm_latency: number;
  norm_cost?: number;
  subscore_carbon: number;
  subscore_duration?: number;
  subscore_utilization?: number;
  subscore_latency: number;
  subscore_cost?: number;
  is_feasible: boolean;
  rejection_reason?: string | null;
}

export interface SchedulingDecisionResponse {
  id: string;
  job_id: string;
  action: DecisionAction;
  decision_mode?: "CARBON_AWARE" | "CONVENTIONAL_FALLBACK" | "DEFERRED";
  carbon_optimization_applied?: boolean;
  fallback_reason?: string | null;
  selected_region_id: string | null;
  selected_region_code: string | null;
  rationale: string;
  selected_candidate?: SelectedCandidateSnapshot | null;
  deferral_info?: StructuredDeferralInfo | null;
  candidate_rankings: CandidateRanking[];
  carbon_intensity_gco2: number | null;
  carbon_quality: CarbonQuality | null;
  carbon_source: CarbonSource | null;
  weights: SchedulingWeights;
  baseline_strategy?: string | null;
  baseline_region_id?: string | null;
  baseline_energy_kwh?: number | null;
  baseline_co2eq_grams?: number | null;
  estimated_energy_kwh?: number | null;
  estimated_co2eq_grams?: number | null;
  estimated_savings_co2eq_grams?: number | null;
  cost_score_jr?: number | null;
  created_at: string;
}

export interface JobAttemptResponse {
  id: string;
  job_id: string;
  attempt_number: number;
  region_id: string;
  region_code?: string | null;
  status: AttemptStatus;
  started_at: string | null;
  completed_at: string | null;
  energy_kwh: number | null;
  carbon_intensity_gco2: number | null;
  co2eq_grams: number | null;
  error_message: string | null;
  created_at: string;
}

export interface RegionResponse {
  id: string;
  code: string;
  name: string;
  provider: string;
  country: string;
  latitude: number;
  longitude: number;
  max_cpu_capacity: number;
  max_memory_capacity: number;
  current_utilization: number;
  performance_factor: number;
  idle_power_watts: number;
  peak_power_watts: number;
  network_latency_ms: number;
  is_available: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CarbonObservationResponse {
  id: string;
  region_id: string;
  region_code: string;
  carbon_intensity_gco2: number | null;
  quality: CarbonQuality;
  source: CarbonSource;
  is_trustworthy: boolean;
  observed_at: string;
}

export interface AnalyticsSummary {
  total_jobs: number;
  completed_jobs: number;
  failed_jobs: number;
  waiting_jobs: number;
  running_jobs: number;
  total_attempts: number;
  total_energy_kwh: number;
  total_co2eq_grams: number;
  avg_job_duration_seconds: number;
  carbon_savings_pct_vs_baseline: number;
}

export interface ExperimentCreatePayload {
  name: string;
  scenario_type?: string;
  workload_count?: number;
  random_seed?: number;
}

export interface ExperimentResponse {
  id: string;
  name: string;
  scheduler_variant: string;
  random_seed: number;
  scenario_type: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface ExperimentResultResponse {
  id: string;
  experiment_id: string;
  scheduler_algorithm: string;
  total_energy_kwh: number;
  total_co2eq_grams: number;
  avg_execution_time_seconds: number;
  avg_latency_ms: number;
  deadline_compliance_rate: number;
  failure_rate: number;
  retry_rate: number;
  duplicate_execution_count: number;
  deferral_rate: number;
  avg_region_utilization: number;
  detailed_metrics: Record<string, any>;
}
