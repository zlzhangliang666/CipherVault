"""注册 / 重复注册 / 预登录取盐 / 登录成功 / 登录失败 / 请求体校验失败。"""

import re

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import User
from app.security import hash_auth_hash

EMAIL = "alice@example.com"
AUTH_HASH = "ab" * 32  # 32 字节 → 64 个 hex 字符
KDF_SALT = "cd" * 16  # 16 字节 → 32 个 hex 字符
KDF_ITERS = 200000
HEX_32 = re.compile(r"^[0-9a-f]{32}$")
HEX_64 = re.compile(r"^[0-9a-f]{64}$")


def _register_body(**overrides: object) -> dict[str, object]:
    body: dict[str, object] = {
        "email": EMAIL,
        "authHash": AUTH_HASH,
        "kdfSalt": KDF_SALT,
        "kdfIters": KDF_ITERS,
    }
    body.update(overrides)
    return body


def _register(client: TestClient, **overrides: object):
    return client.post("/api/v1/auth/register", json=_register_body(**overrides))


def _login(client: TestClient, email: str = EMAIL, auth_hash: str = AUTH_HASH):
    return client.post("/api/v1/auth/login", json={"email": email, "authHash": auth_hash})


# ---- GET /api/v1/auth/kdf -------------------------------------------------


def test_kdf_before_register_returns_404(client: TestClient) -> None:
    response = client.get("/api/v1/auth/kdf", params={"email": "nobody@example.com"})

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "USER_NOT_FOUND"
    assert response.headers["X-API-Version"] == "1"


def test_kdf_after_register_returns_salt_and_iters(client: TestClient) -> None:
    assert _register(client).status_code == 201

    response = client.get("/api/v1/auth/kdf", params={"email": EMAIL})

    assert response.status_code == 200
    body = response.json()
    assert HEX_32.fullmatch(body["kdfSalt"])
    assert body["kdfSalt"] == KDF_SALT
    assert body["kdfIters"] == KDF_ITERS


def test_kdf_without_email_param_returns_422(client: TestClient) -> None:
    response = client.get("/api/v1/auth/kdf")

    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "VALIDATION_ERROR"
    assert "email" in {field["field"] for field in error["detail"]["fields"]}


# ---- POST /api/v1/auth/register -------------------------------------------


def test_register_returns_201_and_32_hex_user_id(client: TestClient) -> None:
    response = _register(client)

    assert response.status_code == 201
    assert HEX_32.fullmatch(response.json()["userId"])
    assert response.headers["X-API-Version"] == "1"


def test_register_twice_returns_409(client: TestClient) -> None:
    assert _register(client).status_code == 201

    response = _register(client)

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "EMAIL_EXISTS"


def test_register_normalizes_email_before_uniqueness_check(client: TestClient) -> None:
    assert _register(client, email="  Alice@Example.COM  ").status_code == 201

    # 归一化后是同一个邮箱，必须撞上 UNIQUE 约束
    assert _register(client).status_code == 409


def test_register_without_kdf_salt_returns_422(client: TestClient) -> None:
    body = _register_body()
    del body["kdfSalt"]

    response = client.post("/api/v1/auth/register", json=body)

    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "VALIDATION_ERROR"
    assert "kdfSalt" in {field["field"] for field in error["detail"]["fields"]}
    assert response.headers["X-API-Version"] == "1"


def test_register_with_non_hex_auth_hash_returns_422(client: TestClient) -> None:
    response = _register(client, authHash="ZZ" * 32)

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_register_response_never_echoes_auth_hash(client: TestClient) -> None:
    response = _register(client)

    assert AUTH_HASH not in response.text


# ---- POST /api/v1/auth/login ----------------------------------------------


def test_login_returns_token_user_id_and_expires_in(client: TestClient) -> None:
    user_id = _register(client).json()["userId"]

    response = _login(client)

    assert response.status_code == 200
    body = response.json()
    assert body["token"]
    assert body["userId"] == user_id
    assert body["expiresIn"] == 86400


def test_login_with_wrong_auth_hash_returns_401(client: TestClient) -> None:
    assert _register(client).status_code == 201

    response = _login(client, auth_hash="ff" * 32)

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "INVALID_CREDENTIALS"


def test_login_with_unknown_email_returns_401(client: TestClient) -> None:
    response = _login(client, email="nobody@example.com")

    # 与 authHash 不匹配同一个错误码，避免被用来枚举已注册邮箱
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "INVALID_CREDENTIALS"


def test_login_accepts_unnormalized_email(client: TestClient) -> None:
    assert _register(client).status_code == 201

    assert _login(client, email="  ALICE@EXAMPLE.COM ").status_code == 200


# ---- 铁律 R2：库里只能有 sha256(PEPPER + authHash) -------------------------


def test_only_peppered_rehash_is_stored(client: TestClient, db_session: Session) -> None:
    assert _register(client).status_code == 201

    stored = db_session.scalar(select(User.auth_hash).where(User.email == EMAIL))

    assert stored is not None
    assert stored != AUTH_HASH  # authHash 原文没有落库
    assert stored == hash_auth_hash(AUTH_HASH)
    assert HEX_64.fullmatch(stored)  # 落库的是 sha256 摘要：64 个 hex 字符
