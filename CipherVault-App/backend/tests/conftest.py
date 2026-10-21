"""pytest 公共 fixture：临时 SQLite + TestClient。

环境变量必须在导入 `app.*` **之前**设好——`app/config.py` 在导入时就实例化 Settings，
`app/db.py` 在导入时就按 `DATABASE_URL` 建 engine；晚一步就会在 `backend/` 下
建出 `ciphervault.db`，而测试严禁写生产库。
"""

import os
import tempfile
from collections.abc import Iterator
from pathlib import Path

_TMP_DIR = Path(tempfile.mkdtemp(prefix="ciphervault-backend-test-"))
os.environ["DATABASE_URL"] = f"sqlite:///{(_TMP_DIR / 'test.db').as_posix()}"
# HS256 要求密钥不短于 32 字节，否则 PyJWT 会告警（生产环境的 JWT_SECRET 同理）
os.environ["JWT_SECRET"] = "test-jwt-secret-0123456789abcdef0123456789abcdef"
os.environ["JWT_TTL_SECONDS"] = "86400"
os.environ["PEPPER"] = "test-pepper"
os.environ["CORS_ORIGINS"] = "http://localhost:5173"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402

EMAIL = "alice@example.com"
AUTH_HASH = "ab" * 32  # 32 字节 → 64 个 hex 字符
KDF_SALT = "cd" * 16  # 16 字节 → 32 个 hex 字符
KDF_ITERS = 200000


@pytest.fixture
def client() -> Iterator[TestClient]:
    """每个用例前后都重建表，保证用例之间互不污染。"""
    Base.metadata.drop_all(bind=engine)
    with TestClient(app) as test_client:  # 进入上下文触发 lifespan → init_db() 建表
        yield test_client
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db_session(client: TestClient) -> Iterator[Session]:
    """直接查库做断言（例如自证 authHash 原文没有落库）。

    依赖 `client` 以确保表已经建好。
    """
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def auth_headers(client: TestClient) -> dict[str, str]:
    """注册 + 登录，返回带 `Authorization: Bearer <jwt>` 的请求头。"""
    register = client.post(
        "/api/v1/auth/register",
        json={
            "email": EMAIL,
            "authHash": AUTH_HASH,
            "kdfSalt": KDF_SALT,
            "kdfIters": KDF_ITERS,
        },
    )
    assert register.status_code == 201, register.text
    login = client.post("/api/v1/auth/login", json={"email": EMAIL, "authHash": AUTH_HASH})
    assert login.status_code == 200, login.text
    token = login.json()["token"]
    return {"Authorization": f"Bearer {token}"}
