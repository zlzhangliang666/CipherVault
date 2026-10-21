"""JWT 签发/校验，以及 authHash 落库前的服务端再哈希。

服务器只做哈希与令牌校验，不做任何加解密（铁律 R3）。
"""

import hashlib
import hmac
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt

from app.config import settings
from app.schemas import ApiError

# 算法固定 HS256（见任务书第 7 节）
_ALGORITHM = "HS256"


def hash_auth_hash(auth_hash_hex: str) -> str:
    """`hex( sha256( PEPPER + authHashHex ) )`，见 docs/CONTRACTS.md §2 的 users.auth_hash。

    authHash 原文绝不落库；库里只有这个再哈希（铁律 R2）。
    """
    return hashlib.sha256((settings.pepper + auth_hash_hex).encode("utf-8")).hexdigest()


def verify_auth_hash(auth_hash_hex: str, stored_hash: str) -> bool:
    """恒定时间比较，避免通过响应耗时枚举账号。"""
    return hmac.compare_digest(hash_auth_hash(auth_hash_hex), stored_hash)


def create_token(user_id: str) -> str:
    """签发 JWT：载荷含 `sub`（= userId）与 `exp`。"""
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=settings.jwt_ttl_seconds)
    payload: dict[str, Any] = {"sub": user_id, "exp": expires_at}
    return jwt.encode(payload, settings.jwt_secret, algorithm=_ALGORITHM)


def decode_token(token: str) -> str:
    """校验 JWT 并取出 userId；缺失/过期/无效一律 `UNAUTHORIZED`（不要与
    `INVALID_CREDENTIALS` 混用——后者只表示 authHash 不匹配）。
    """
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[_ALGORITHM])
    except jwt.PyJWTError:
        # from None：不把 JWT 库的异常文案带出去，那里可能含载荷片段
        raise ApiError("UNAUTHORIZED") from None
    subject = payload.get("sub")
    if not isinstance(subject, str) or not subject:
        raise ApiError("UNAUTHORIZED")
    return subject
