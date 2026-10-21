"""SQLAlchemy 2.0 engine / session / Base，以及启动建表。"""

from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings

# SQLite 的连接不能跨线程复用，而 FastAPI 会把同步路由放到线程池里跑
_connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}

engine = create_engine(settings.database_url, connect_args=_connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    """所有 ORM 模型的基类。"""


def init_db() -> None:
    """建表（`CREATE TABLE IF NOT EXISTS`），由 `app.main` 的 lifespan 在启动时调用。"""
    from app import models  # noqa: F401  导入以把 users / vaults 注册进 Base.metadata

    Base.metadata.create_all(bind=engine)


def get_db() -> Iterator[Session]:
    """请求级数据库会话依赖。"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
