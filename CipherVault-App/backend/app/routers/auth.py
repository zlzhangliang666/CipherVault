"""预登录取盐、注册、登录 —— 挂载后对外即 `/api/v1/auth/*`。

路径里只写 `/auth/...`，`/api/v1` 前缀统一在 `app/main.py` 挂载时加，
不要在两处都写导致变成 `/api/v1/api/v1/...`。
"""

from fastapi import APIRouter

from app.deps import DbSession
from app.schemas import KdfResponse, LoginRequest, LoginResponse, RegisterRequest, RegisterResponse
from app.services import auth_service

router = APIRouter(tags=["auth"])


@router.get("/auth/kdf", response_model=KdfResponse)
def get_kdf(db: DbSession, email: str) -> KdfResponse:
    """`GET /api/v1/auth/kdf?email=<email>`：查不到邮箱返回 404 USER_NOT_FOUND。"""
    return auth_service.get_kdf(db, email)


@router.post("/auth/register", response_model=RegisterResponse, status_code=201)
def register(payload: RegisterRequest, db: DbSession) -> RegisterResponse:
    """`POST /api/v1/auth/register`：邮箱已注册返回 409 EMAIL_EXISTS。"""
    return auth_service.register(db, payload)


@router.post("/auth/login", response_model=LoginResponse)
def login(payload: LoginRequest, db: DbSession) -> LoginResponse:
    """`POST /api/v1/auth/login`：authHash 不匹配返回 401 INVALID_CREDENTIALS。"""
    return auth_service.login(db, payload)
