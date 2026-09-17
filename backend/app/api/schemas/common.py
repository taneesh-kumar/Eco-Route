"""Common API response schemas including RFC 7807 problem details and pagination."""

from typing import Any, Generic, List, Optional, TypeVar
from pydantic import BaseModel, Field

T = TypeVar("T")


class ProblemDetails(BaseModel):
    """RFC 7807 compliant structured error response."""
    type: str = Field(..., description="URI reference identifying the problem type")
    title: str = Field(..., description="Short, human-readable summary of problem")
    status: int = Field(..., description="HTTP status code")
    detail: str = Field(..., description="Human-readable explanation specific to this occurrence")
    instance: Optional[str] = Field(None, description="URI reference identifying the specific occurrence")
    errors: Optional[List[Any]] = Field(None, description="Detailed validation error list")


class PaginationParams(BaseModel):
    """Query parameters for paginated endpoints."""
    limit: int = Field(20, ge=1, le=100, description="Maximum items to return")
    offset: int = Field(0, ge=0, description="Number of items to skip")


class PaginatedResponse(BaseModel, Generic[T]):
    """Generic envelope for paginated resource lists."""
    items: List[T]
    total_count: int
    limit: int
    offset: int
