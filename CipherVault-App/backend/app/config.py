"""运行期配置：从环境变量 / `.env` 读取（样例见 `backend/.env.example`）。"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

# docs/CONTRACTS.md §0：所有响应都必须带 `X-API-Version: 1` 响应头
API_VERSION = "1"
# `GET /api/v1/health` 返回的服务版本，与 pyproject.toml 的 version 保持一致
APP_VERSION = "0.1.0"


class Settings(BaseSettings):
    """五个环境变量，与 `docs/CONTRACTS.md` §2 的表格一一对应。

    默认值取自 `.env.example`，与 `docker-compose.yml` 里的 `${JWT_SECRET:-...}`
    回退值语义一致；生产环境必须用随机生成的 `JWT_SECRET` 与 `PEPPER` 覆盖。
    """

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "sqlite:///./ciphervault.db"
    jwt_secret: str = "dev-jwt-secret-change-me"
    jwt_ttl_seconds: int = 86400
    pepper: str = "dev-pepper-change-me"
    # 逗号分隔的普通字符串（不是 JSON 数组），与 docker-compose.yml 的写法一致
    cors_origins: str = "http://localhost:5173"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
