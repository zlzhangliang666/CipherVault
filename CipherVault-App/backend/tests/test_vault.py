"""密文 blob 的读写：未认证 401、首次写入、读取一致、版本递增、VAULT_EMPTY、过期 409。"""

from fastapi.testclient import TestClient

IV = "11" * 12  # 12 字节 → 24 个 hex 字符
CT = "00" * 16
OTHER_IV = "22" * 12
OTHER_CT = "ff" * 32
BOB_EMAIL = "bob@example.com"
BOB_AUTH_HASH = "ef" * 32


def _put(
    client: TestClient,
    headers: dict[str, str],
    base_version: int,
    iv: str = IV,
    ct: str = CT,
):
    return client.put(
        "/api/v1/vault",
        headers=headers,
        json={"baseVersion": base_version, "iv": iv, "ct": ct},
    )


def _get(client: TestClient, headers: dict[str, str]):
    return client.get("/api/v1/vault", headers=headers)


# ---- 认证 ------------------------------------------------------------------


def test_get_vault_without_token_returns_401(client: TestClient) -> None:
    response = client.get("/api/v1/vault")

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"
    assert response.headers["X-API-Version"] == "1"


def test_put_vault_without_token_returns_401(client: TestClient) -> None:
    response = client.put(
        "/api/v1/vault", json={"baseVersion": 0, "iv": IV, "ct": CT}
    )

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"


def test_get_vault_with_garbage_token_returns_401(client: TestClient) -> None:
    response = _get(client, {"Authorization": "Bearer not-a-jwt"})

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"


# ---- 首次写入与读取 --------------------------------------------------------


def test_get_vault_before_first_write_returns_404(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    response = _get(client, auth_headers)

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "VAULT_EMPTY"


def test_first_write_with_base_version_zero_starts_at_version_1(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    response = _put(client, auth_headers, 0)

    assert response.status_code == 200
    body = response.json()
    assert body["version"] == 1
    assert body["updatedAt"].endswith("Z")
    assert response.headers["X-API-Version"] == "1"


def test_read_returns_the_same_blob(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    assert _put(client, auth_headers, 0, iv=OTHER_IV, ct=OTHER_CT).status_code == 200

    response = _get(client, auth_headers)

    assert response.status_code == 200
    body = response.json()
    assert body["version"] == 1
    assert body["iv"] == OTHER_IV  # 与写入的那一份逐字一致
    assert body["ct"] == OTHER_CT
    assert body["updatedAt"].endswith("Z")


def test_empty_ciphertext_is_accepted(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    # 空明文 ⇒ ct 为空串，但仍然是合法的 blob
    assert _put(client, auth_headers, 0, ct="").status_code == 200
    assert _get(client, auth_headers).json()["ct"] == ""


# ---- 版本递增与乐观并发 ----------------------------------------------------


def test_write_with_latest_version_increments(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    assert _put(client, auth_headers, 0).json()["version"] == 1

    response = _put(client, auth_headers, 1, iv=OTHER_IV, ct=OTHER_CT)

    assert response.status_code == 200
    assert response.json()["version"] == 2
    body = _get(client, auth_headers).json()
    assert body["version"] == 2
    assert body["iv"] == OTHER_IV


def test_stale_base_version_returns_409(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    assert _put(client, auth_headers, 0).json()["version"] == 1

    response = _put(client, auth_headers, 0)

    assert response.status_code == 409
    error = response.json()["error"]
    assert error["code"] == "VERSION_CONFLICT"
    assert error["detail"]["currentVersion"] == 1
    assert response.headers["X-API-Version"] == "1"


def test_conflict_does_not_overwrite_the_blob(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    assert _put(client, auth_headers, 0).json()["version"] == 1

    assert _put(client, auth_headers, 0, iv=OTHER_IV, ct=OTHER_CT).status_code == 409

    body = _get(client, auth_headers).json()
    assert body["version"] == 1  # 冲突的写入不能落库
    assert body["iv"] == IV


def test_conflict_detail_reports_the_current_server_version(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    assert _put(client, auth_headers, 0).json()["version"] == 1
    assert _put(client, auth_headers, 1).json()["version"] == 2

    response = _put(client, auth_headers, 1)  # 过期：服务端已经是 2

    assert response.status_code == 409
    assert response.json()["error"]["detail"]["currentVersion"] == 2


def test_first_write_with_nonzero_base_version_returns_409(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    response = _put(client, auth_headers, 3)

    assert response.status_code == 409
    error = response.json()["error"]
    assert error["code"] == "VERSION_CONFLICT"
    assert error["detail"]["currentVersion"] == 0


# ---- 校验与隔离 ------------------------------------------------------------


def test_wrong_iv_length_returns_422(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    response = _put(client, auth_headers, 0, iv="11" * 11)  # 11 字节，不是 12

    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "VALIDATION_ERROR"
    assert "iv" in {field["field"] for field in error["detail"]["fields"]}


def test_vault_is_isolated_between_users(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    assert _put(client, auth_headers, 0).status_code == 200

    client.post(
        "/api/v1/auth/register",
        json={
            "email": BOB_EMAIL,
            "authHash": BOB_AUTH_HASH,
            "kdfSalt": "99" * 16,
            "kdfIters": 200000,
        },
    )
    bob_token = client.post(
        "/api/v1/auth/login", json={"email": BOB_EMAIL, "authHash": BOB_AUTH_HASH}
    ).json()["token"]

    response = _get(client, {"Authorization": f"Bearer {bob_token}"})

    # Bob 看不到 Alice 的保险箱
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "VAULT_EMPTY"
