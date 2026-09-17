from fastapi import APIRouter

from app.api.v1.health import router as health_router
from app.api.v1.jobs import router as jobs_router
from app.api.v1.scheduling import router as scheduling_router
from app.api.v1.attempts import router as attempts_router
from app.api.v1.regions import router as regions_router
from app.api.v1.carbon import router as carbon_router
from app.api.v1.analytics import router as analytics_router
from app.api.v1.experiments import router as experiments_router

api_v1_router = APIRouter(prefix="/v1")
api_v1_router.include_router(health_router)
api_v1_router.include_router(jobs_router)
api_v1_router.include_router(scheduling_router)
api_v1_router.include_router(attempts_router)
api_v1_router.include_router(regions_router)
api_v1_router.include_router(carbon_router)
api_v1_router.include_router(analytics_router)
api_v1_router.include_router(experiments_router)

# Top level api router
api_router = APIRouter(prefix="/api")
api_router.include_router(api_v1_router)
