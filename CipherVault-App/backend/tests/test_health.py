"""`GET /api/v1/health`。"""

from fastapi.testclient import TestClient


def test_health_returns_ok_and_version(client: TestClient) -> None:
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": "0.1.0"}


def test_health_response_has_api_version_header(client: TestClient) -> None:
    response = client.get("/api/v1/health")

    assert response.headers["X-API-Version"] == "1"
