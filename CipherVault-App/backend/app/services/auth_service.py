"""注册 / 登录 / 预登录取盐的业务逻辑。"""

from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.models import User, utcnow_iso
from app.schemas import (
    ApiError,
    KdfResponse,
    LoginRequest,
    LoginResponse,
    RegisterRequest,
    RegisterResponse,
)
from app.security import create_token, hash_auth_hash, verify_auth_hash


def normalize_email(raw: str) -> str:
    """契约要求：email 统一小写去空格后再查重与存储。"""
    return raw.strip().lower()


def _find_by_email(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == normalize_email(email)))


def get_kdf(db: Session, email: str) -> KdfResponse:
    """预登录：前端必须先拿到 kdfSalt / kdfIters 才能在本地派生 authHash。"""
    user = _find_by_email(db, email)
    if user is None:
        raise ApiError("USER_NOT_FOUND")
    return KdfResponse(kdf_salt=user.kdf_salt, kdf_iters=user.kdf_iters)


def register(db: Session, payload: RegisterRequest) -> RegisterResponse:
    """注册：查重 → 对 authHash 再做一次 sha256(PEPPER + authHash) → 落库。"""
    email = normalize_email(payload.email)
    if _find_by_email(db, email) is not None:
        raise ApiError("EMAIL_EXISTS")
    user = User(
        id=uuid4().hex,
        email=email,
        auth_hash=hash_auth_hash(payload.auth_hash),
        kdf_salt=payload.kdf_salt,
        kdf_iters=payload.kdf_iters,
        created_at=utcnow_iso(),
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        # 两个请求同时注册同一邮箱时，由 email 的 UNIQUE 约束兜底
        db.rollback()
        raise ApiError("EMAIL_EXISTS") from None
    return RegisterResponse(user_id=user.id)


def login(db: Session, payload: LoginRequest) -> LoginResponse:
    """登录：校验 authHash → 签发 JWT。"""
    user = _find_by_email(db, payload.email)
    # 邮箱不存在与 authHash 不匹配返回同一个错误码，避免被用来枚举已注册邮箱
    if user is None or not verify_auth_hash(payload.auth_hash, user.auth_hash):
        raise ApiError("INVALID_CREDENTIALS")
    return LoginResponse(
        token=create_token(user.id),
        user_id=user.id,
        expires_in=settings.jwt_ttl_seconds,
    )
