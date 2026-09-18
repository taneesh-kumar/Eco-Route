"""Pydantic schemas for scheduling decisions and explainability."""

from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional
import uuid
from pydantic import BaseModel, ConfigDict, computed_field, model_validator


class SelectedCandidateSnapshot(BaseModel):
    """Authoritative canonical snapshot of the selected candidate region's decision metrics.
    
    Single source of truth for all selected-region decision metrics.
    """
    selected_region_id: Optional[uuid.UUID] = None
    selected_region_code: Optional[str] = None
    carbon_intensity_gco2_per_kwh: Optional[Decimal] = None
    carbon_source: str = "UNAVAILABLE"
    carbon_quality: str = "UNAVAILABLE"
    carbon_is_estimated: bool = False
    carbon_estimation_method: Optional[str] = None
    carbon_observed_at: Optional[datetime] = None
    carbon_cache_age_seconds: Optional[int] = None
    energy_kwh: Optional[Decimal] = None
    estimated_emissions_co2eq_grams: Optional[Decimal] = None
    duration_seconds: Optional[Decimal] = None
    projected_utilization: Optional[Decimal] = None
    latency_ms: Optional[Decimal] = None
    composite_score: Optional[Decimal] = None


class StructuredDeferralInfo(BaseModel):
    """Authoritative structured deferral evaluation metrics and opportunity evidence."""
    forecast_status: str = "NO_USEFUL_FORECAST"
    forecast_source: str = "ELECTRICITY_MAPS"
    forecast_checked_until: Optional[str] = None
    deferral_eligible: bool = False
    deferral_reason: str = ""
    current_expected_emissions: Optional[Decimal] = None
    future_expected_emissions: Optional[Decimal] = None
    expected_savings: Optional[Decimal] = None
    relative_improvement_pct: Optional[Decimal] = None
    deferral_threshold_pct: Optional[Decimal] = None
    forecast_timestamp: Optional[str] = None


class DecisionResponse(BaseModel):
    """Core scheduling decision record."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    job_id: uuid.UUID
    attempt_id: Optional[uuid.UUID] = None
    selected_region_id: Optional[uuid.UUID] = None
    decision_action: str
    decision_mode: str = "CARBON_AWARE"
    carbon_optimization_applied: bool = True
    fallback_reason: Optional[str] = None
    baseline_strategy: Optional[str] = None
    baseline_region_id: Optional[uuid.UUID] = None
    baseline_energy_kwh: Optional[Decimal] = None
    baseline_co2eq_grams: Optional[Decimal] = None
    estimated_savings_co2eq_grams: Optional[Decimal] = None
    cost_score_jr: Optional[Decimal] = None
    estimated_energy_kwh: Optional[Decimal] = None
    estimated_co2eq_grams: Optional[Decimal] = None
    carbon_source_used: str
    carbon_quality_used: str
    decision_reason: str
    created_at: datetime
    selected_candidate: Optional[SelectedCandidateSnapshot] = None
    deferral_info: Optional[StructuredDeferralInfo] = None

    @model_validator(mode="before")
    @classmethod
    def sanitize_attributes(cls, data: Any) -> Any:
        if hasattr(data, "decision_mode"):
            val = getattr(data, "decision_mode")
            if not isinstance(val, str):
                try:
                    setattr(data, "decision_mode", "CARBON_AWARE")
                except Exception:
                    pass
        for attr in (
            "fallback_reason",
            "baseline_strategy",
            "baseline_region_id",
            "baseline_energy_kwh",
            "baseline_co2eq_grams",
            "estimated_savings_co2eq_grams",
        ):
            if hasattr(data, attr):
                val = getattr(data, attr)
                if not (isinstance(val, (str, Decimal, int, float, uuid.UUID)) or val is None):
                    try:
                        setattr(data, attr, None)
                    except Exception:
                        pass

        # Extract score_breakdown and candidate_rankings
        score_breakdown = {}
        candidate_rankings = []
        if isinstance(data, dict):
            score_breakdown = data.get("score_breakdown") or {}
            candidate_rankings = data.get("candidate_rankings") or []
        else:
            if hasattr(data, "score_breakdown"):
                score_breakdown = getattr(data, "score_breakdown") or {}
            if hasattr(data, "candidate_rankings"):
                candidate_rankings = getattr(data, "candidate_rankings") or []

        # 1. Authoritative selected_candidate snapshot
        cand_snap = (
            (data.get("selected_candidate") if isinstance(data, dict) else getattr(data, "selected_candidate", None))
            or score_breakdown.get("selected_candidate")
        )
        if not cand_snap:
            # Fallback discovery from candidate_rankings
            sel_id = data.get("selected_region_id") if isinstance(data, dict) else getattr(data, "selected_region_id", None)
            found = None
            if sel_id and candidate_rankings:
                for c in candidate_rankings:
                    if str(c.get("region_id")) == str(sel_id):
                        found = c
                        break
            if not found and candidate_rankings and len(candidate_rankings) > 0 and candidate_rankings[0].get("is_feasible"):
                found = candidate_rankings[0]

            if found:
                raw_ci = found.get("carbon_intensity_gco2") or found.get("carbon_intensity")
                raw_qual = found.get("carbon_quality") or (data.get("carbon_quality_used") if isinstance(data, dict) else getattr(data, "carbon_quality_used", "LIVE"))
                raw_src = found.get("carbon_source") or (data.get("carbon_source_used") if isinstance(data, dict) else getattr(data, "carbon_source_used", "ELECTRICITY_MAPS"))
                is_est = raw_qual == "LIVE_ESTIMATED" or found.get("is_estimated") is True
                cand_snap = {
                    "selected_region_id": found.get("region_id"),
                    "selected_region_code": found.get("region_code"),
                    "carbon_intensity_gco2_per_kwh": raw_ci,
                    "carbon_source": raw_src,
                    "carbon_quality": raw_qual,
                    "carbon_is_estimated": is_est,
                    "carbon_estimation_method": "Electricity Maps Live Model" if is_est else None,
                    "energy_kwh": found.get("energy_kwh"),
                    "estimated_emissions_co2eq_grams": found.get("emissions_co2eq") or found.get("raw_carbon_gco2"),
                    "duration_seconds": found.get("duration_seconds"),
                    "projected_utilization": found.get("projected_utilization"),
                    "latency_ms": found.get("raw_latency_ms") or found.get("network_latency_ms"),
                    "composite_score": found.get("composite_score") or found.get("cost_score_jr"),
                }

        def _get_val(obj: Any, key: str, default: Any = None) -> Any:
            if isinstance(obj, dict):
                return obj.get(key, default)
            return getattr(obj, key, default)

        if cand_snap:
            if isinstance(data, dict):
                data["selected_candidate"] = cand_snap
                # Exact projection of selected_candidate to convenience top-level fields
                data["selected_region_id"] = _get_val(cand_snap, "selected_region_id")
                data["estimated_energy_kwh"] = _get_val(cand_snap, "energy_kwh")
                data["estimated_co2eq_grams"] = _get_val(cand_snap, "estimated_emissions_co2eq_grams")
                data["cost_score_jr"] = _get_val(cand_snap, "composite_score")
                data["carbon_source_used"] = _get_val(cand_snap, "carbon_source", "UNAVAILABLE")
                data["carbon_quality_used"] = _get_val(cand_snap, "carbon_quality", "UNAVAILABLE")
            else:
                setattr(data, "selected_candidate", cand_snap)
                setattr(data, "selected_region_id", _get_val(cand_snap, "selected_region_id"))
                setattr(data, "estimated_energy_kwh", _get_val(cand_snap, "energy_kwh"))
                setattr(data, "estimated_co2eq_grams", _get_val(cand_snap, "estimated_emissions_co2eq_grams"))
                setattr(data, "cost_score_jr", _get_val(cand_snap, "composite_score"))
                setattr(data, "carbon_source_used", _get_val(cand_snap, "carbon_source", "UNAVAILABLE"))
                setattr(data, "carbon_quality_used", _get_val(cand_snap, "carbon_quality", "UNAVAILABLE"))

        # 2. Structured deferral_info
        def_info = (
            (data.get("deferral_info") if isinstance(data, dict) else getattr(data, "deferral_info", None))
            or score_breakdown.get("deferral_info")
        )
        if not def_info:
            d_reason = data.get("decision_reason", "") if isinstance(data, dict) else getattr(data, "decision_reason", "")
            d_action = data.get("decision_action", "EXECUTE") if isinstance(data, dict) else getattr(data, "decision_action", "EXECUTE")
            def_info = {
                "forecast_status": "NO_USEFUL_FORECAST" if d_action == "EXECUTE" else "DEFERRAL_APPROVED",
                "forecast_source": "ELECTRICITY_MAPS",
                "deferral_eligible": False,
                "deferral_reason": d_reason,
            }
        if def_info:
            if isinstance(data, dict):
                data["deferral_info"] = def_info
            else:
                setattr(data, "deferral_info", def_info)

        return data

    @model_validator(mode="after")
    def sync_canonical_selected_candidate(self) -> "DecisionResponse":
        """Enforces that selected_candidate is the single authoritative source of truth."""
        if self.selected_candidate:
            if self.selected_candidate.selected_region_id is not None:
                object.__setattr__(self, "selected_region_id", self.selected_candidate.selected_region_id)
            if self.selected_candidate.energy_kwh is not None:
                object.__setattr__(self, "estimated_energy_kwh", self.selected_candidate.energy_kwh)
            if self.selected_candidate.estimated_emissions_co2eq_grams is not None:
                object.__setattr__(self, "estimated_co2eq_grams", self.selected_candidate.estimated_emissions_co2eq_grams)
            if self.selected_candidate.composite_score is not None:
                object.__setattr__(self, "cost_score_jr", self.selected_candidate.composite_score)
            if self.selected_candidate.carbon_source:
                object.__setattr__(self, "carbon_source_used", self.selected_candidate.carbon_source)
            if self.selected_candidate.carbon_quality:
                object.__setattr__(self, "carbon_quality_used", self.selected_candidate.carbon_quality)
        return self

    @computed_field
    @property
    def action(self) -> str:
        return self.decision_action

    @computed_field
    @property
    def rationale(self) -> str:
        return self.decision_reason

    @computed_field
    @property
    def carbon_source(self) -> str:
        if self.selected_candidate and self.selected_candidate.carbon_source:
            return self.selected_candidate.carbon_source
        return self.carbon_source_used

    @computed_field
    @property
    def carbon_quality(self) -> str:
        if self.selected_candidate and self.selected_candidate.carbon_quality:
            return self.selected_candidate.carbon_quality
        return self.carbon_quality_used

    @computed_field
    @property
    def selected_region_code(self) -> Optional[str]:
        if self.selected_candidate and self.selected_candidate.selected_region_code:
            return self.selected_candidate.selected_region_code
        return None

    @computed_field
    @property
    def carbon_intensity_gco2(self) -> Optional[float]:
        if self.selected_candidate and self.selected_candidate.carbon_intensity_gco2_per_kwh is not None:
            return float(self.selected_candidate.carbon_intensity_gco2_per_kwh)
        return None


class DecisionExplainabilityResponse(DecisionResponse):
    """Full decision explainability breakdown for audit and UI visualizer."""
    score_breakdown: Dict[str, Any] = {}
    candidate_rankings: List[Dict[str, Any]] = []
    applied_weights: Dict[str, Any] = {}
    normalization_factors: Dict[str, Any] = {}

    @computed_field
    @property
    def weights(self) -> Dict[str, float]:
        if self.applied_weights:
            try:
                w_carbon = float(self.applied_weights.get("carbon", 0.40))
                w_time = float(self.applied_weights.get("time", self.applied_weights.get("cost", 0.30)))
                w_util = float(self.applied_weights.get("utilization", 0.20))
                w_latency = float(self.applied_weights.get("latency", 0.10))
                return {
                    "carbon_weight": w_carbon,
                    "time_weight": w_time,
                    "utilization_weight": w_util,
                    "latency_weight": w_latency,
                    "cost_weight": w_time,
                }
            except Exception:
                pass
        return {
            "carbon_weight": 0.40,
            "time_weight": 0.30,
            "utilization_weight": 0.20,
            "latency_weight": 0.10,
            "cost_weight": 0.30,
        }
