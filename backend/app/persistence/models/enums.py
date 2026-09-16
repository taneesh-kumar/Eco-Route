from enum import StrEnum


class JobStatus(StrEnum):
    PENDING = "PENDING"
    EVALUATING = "EVALUATING"
    WAITING = "WAITING"
    DISPATCHED = "DISPATCHED"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class WorkloadType(StrEnum):
    BATCH = "BATCH"
    INFERENCE = "INFERENCE"
    TRAINING = "TRAINING"


class AttemptStatus(StrEnum):
    PENDING = "PENDING"
    CLAIMED = "CLAIMED"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class DecisionAction(StrEnum):
    EXECUTE = "EXECUTE"
    DEFER = "DEFER"
    REJECT = "REJECT"


class CarbonDataQuality(StrEnum):
    LIVE = "LIVE"
    CACHED = "CACHED"
    UNAVAILABLE = "UNAVAILABLE"


class CarbonSource(StrEnum):
    ELECTRICITY_MAPS = "ELECTRICITY_MAPS"
    REGIONAL_PROFILE = "REGIONAL_PROFILE"


class CloudProvider(StrEnum):
    AWS = "AWS"
    AZURE = "AZURE"
    GCP = "GCP"


class SchedulerVariant(StrEnum):
    CONVENTIONAL = "CONVENTIONAL"
    RANDOM = "RANDOM"
    CARBON_ONLY = "CARBON_ONLY"
    PERFORMANCE_ONLY = "PERFORMANCE_ONLY"
    ECOROUTE = "ECOROUTE"


class ExperimentStatus(StrEnum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
