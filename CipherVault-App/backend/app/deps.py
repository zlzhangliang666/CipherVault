"""依赖注入：数据库会话、当前登录用户。"""

from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User
from app.schemas import ApiError
from app.security import decode_token

# auto_error=False：缺 token / 格式不对时由我们自己抛契约格式的 401 UNAUTHORIZED。
# FastAPI 默认行为是 403 + 它自己的 detail 结构，不符合 docs/CONTRACTS.md 的错误格式。
_bearer = HTTPBearer(auto_error=False)

DbSession = Annotated[Session, Depends(get_db)]


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    db: DbSession,
) -> User:
    """解析 `Authorization: Bearer <jwt>` → 当前用户。"""
    if credentials is None:
        raise ApiError("UNAUTHORIZED")
    user = db.get(User, decode_token(credentials.credentials))
    if user is None:
        # token 签名有效但账号已不存在，同样按未认证处理
        raise ApiError("UNAUTHORIZED")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
