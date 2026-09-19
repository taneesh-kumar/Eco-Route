/**
 * EcoRoute Frontend API Client.
 * Provides typed methods for interacting with the FastAPI REST API.
 */

import {
  AnalyticsSummary,
  CarbonObservationResponse,
  ExperimentCreatePayload,
  ExperimentResponse,
  ExperimentResultResponse,
  JobAttemptResponse,
  JobCreatePayload,
  JobResponse,
  RegionResponse,
  SchedulingDecisionResponse,
} from "./types";

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

export interface ApiClientConfig {
  baseUrl?: string;
}

export class ApiClient {
  private baseUrl: string;

  constructor(config?: ApiClientConfig) {
    const rawUrl =
      config?.baseUrl || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    this.baseUrl = rawUrl.replace(/\/+$/, "");
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(options?.headers || {}),
    };

    const res = await fetch(url, {
      ...options,
      headers,
      cache: "no-store",
    });

    if (!res.ok) {
      let errorDetail = res.statusText;
      try {
        const errJson = await res.json();
        errorDetail = errJson.detail || errJson.title || JSON.stringify(errJson);
      } catch {
        // Fallback to status text
      }
      throw new Error(`API error [${res.status}] ${path}: ${errorDetail}`);
    }

    return res.json();
  }

  // Health
  public async getHealth(): Promise<HealthResponse> {
    return this.request<HealthResponse>("/api/v1/health");
  }

  public async getLiveness(): Promise<{ status: string }> {
    return this.request<{ status: string }>("/health/live");
  }

  // Jobs
  public async createJob(payload: JobCreatePayload): Promise<JobResponse> {
    const res = await this.request<any>("/api/v1/jobs", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return res.job || res;
  }

  public async getJobs(params?: {
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ items: JobResponse[]; total_count: number; limit: number; offset: number }> {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (params?.limit) query.set("limit", params.limit.toString());
    if (params?.offset) query.set("offset", params.offset.toString());
    const queryStr = query.toString() ? `?${query.toString()}` : "";
    return this.request<{ items: JobResponse[]; total_count: number; limit: number; offset: number }>(
      `/api/v1/jobs${queryStr}`
    );
  }

  public async getJob(id: string): Promise<JobResponse> {
    return this.request<JobResponse>(`/api/v1/jobs/${id}`);
  }

  public async cancelJob(id: string): Promise<JobResponse> {
    return this.request<JobResponse>(`/api/v1/jobs/${id}/cancel`, {
      method: "POST",
    });
  }

  // Scheduling Decisions
  public async triggerScheduling(jobId: string): Promise<any> {
    return this.request<any>(`/api/v1/scheduling/jobs/${jobId}/evaluate`, {
      method: "POST",
    });
  }

  public async getJobDecisions(jobId: string): Promise<any[]> {
    return this.request<any[]>(`/api/v1/scheduling/jobs/${jobId}`);
  }

  public async getRecentDecisions(limit = 20): Promise<any[]> {
    return this.request<any[]>(`/api/v1/scheduling/decisions/recent?limit=${limit}`);
  }

  public async getDecision(decisionId: string): Promise<any> {
    return this.request<any>(`/api/v1/scheduling/decisions/${decisionId}`);
  }

  // Job Attempts
  public async getJobAttempts(jobId: string): Promise<JobAttemptResponse[]> {
    return this.request<JobAttemptResponse[]>(`/api/v1/jobs/${jobId}/attempts`);
  }

  public async getAttempt(attemptId: string): Promise<JobAttemptResponse> {
    return this.request<JobAttemptResponse>(`/api/v1/attempts/${attemptId}`);
  }

  // Regions
  public async getRegions(): Promise<RegionResponse[]> {
    return this.request<RegionResponse[]>("/api/v1/regions");
  }

  public async getRegion(code: string): Promise<RegionResponse> {
    return this.request<RegionResponse>(`/api/v1/regions/${code}`);
  }

  // Carbon Observations
  public async getLatestCarbon(regionCode?: string): Promise<CarbonObservationResponse[]> {
    const query = regionCode ? `?region_code=${regionCode}` : "";
    return this.request<CarbonObservationResponse[]>(`/api/v1/carbon/latest${query}`);
  }

  // Analytics
  public async getAnalyticsSummary(): Promise<AnalyticsSummary> {
    return this.request<AnalyticsSummary>("/api/v1/analytics/summary");
  }

  // Simulation Experiments
  public async createExperiment(payload: ExperimentCreatePayload): Promise<ExperimentResponse> {
    return this.request<ExperimentResponse>("/api/v1/experiments", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  public async getExperiments(limit = 50): Promise<ExperimentResponse[]> {
    return this.request<ExperimentResponse[]>(`/api/v1/experiments?limit=${limit}`);
  }

  public async getExperiment(id: string): Promise<ExperimentResponse> {
    return this.request<ExperimentResponse>(`/api/v1/experiments/${id}`);
  }

  public async getExperimentResults(id: string): Promise<ExperimentResultResponse[]> {
    return this.request<ExperimentResultResponse[]>(`/api/v1/experiments/${id}/results`);
  }
}

export const apiClient = new ApiClient();
