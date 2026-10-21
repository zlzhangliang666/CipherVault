"""FastAPI 应用入口：CORS、`X-API-Version` 中间件、统一异常处理、挂载 `/api/v1` 路由。"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import APIRouter, FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import RequestResponseEndpoint

from app.config import API_VERSION, APP_VERSION, settings
from app.db import init_db
from app.routers import auth, health, vault
from app.schemas import ApiError, ErrorBody, ErrorResponse


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    init_db()
    yield


app = FastAPI(title="CipherVault API", version=APP_VERSION, lifespan=lifespan)

# 先加 CORS，再加下面的版本头中间件：后加的在外层，因此 CORS 预检响应也会带上 X-API-Version
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-API-Version"],
)


@app.middleware("http")
async def add_api_version_header(
    request: Request, call_next: RequestResponseEndpoint
) -> Response:
    """docs/CONTRACTS.md §0：所有响应都必须带 `X-API-Version: 1`。"""
    response = await call_next(request)
    response.headers["X-API-Version"] = API_VERSION
    return response


def _error_response(
    status_code: int,
    code: str,
    message: str,
    detail: dict[str, Any] | None = None,
) -> JSONResponse:
    """统一错误格式 `{"error":{"code","message","detail"}}`；detail 为空时不输出该键。"""
    body = ErrorResponse(error=ErrorBody(code=code, message=message, detail=detail))
    return JSONResponse(
        status_code=status_code,
        content=body.model_dump(by_alias=True, exclude_none=True),
    )


@app.exception_handler(ApiError)
async def handle_api_error(request: Request, exc: ApiError) -> JSONResponse:
    return _error_response(exc.status_code, exc.code, exc.message, exc.detail or None)


@app.exception_handler(RequestValidationError)
async def handle_validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
    """把 FastAPI 默认的 422 结构转成契约格式。

    只回传字段名、错误类型与原因，**丢掉 `input` / `ctx`**：FastAPI 默认会把请求原值
    一起回显，那等于把 authHash 写进响应体与访问日志（违反铁律 R1）。
    """
    fields = [
        {
            "field": ".".join(str(part) for part in error["loc"][1:]),
            "type": error.get("type", ""),
            "message": error.get("msg", ""),
        }
        for error in exc.errors()
    ]
    return _error_response(422, "VALIDATION_ERROR", "请求体校验失败", {"fields": fields})


api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(vault.router)
app.include_router(api_router, prefix="/api/v1")
