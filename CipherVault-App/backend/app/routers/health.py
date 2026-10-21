"""`GET /health` —— 挂载到 `/api/v1` 前缀后对外即 `GET /api/v1/health`。"""

from fastapi import APIRouter

from app.config import APP_VERSION
from app.schemas import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """无需认证。"""
    return HealthResponse(status="ok", version=APP_VERSION)
