"""ORM 模型：字段严格对应 `docs/CONTRACTS.md` §2 的建表 SQL（TEXT / INTEGER）。"""

from datetime import datetime, timezone

from sqlalchemy import ForeignKey, Integer, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def utcnow_iso() -> str:
    """契约要求的 ISO8601 UTC 时间串，例 `2026-10-20T12:00:00Z`（不带毫秒）。"""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class User(Base):
    """账号表。只存 authHash 的再哈希，绝不存主密码 / 明文 / vaultKey（铁律 R1、R2）。"""

    __tablename__ = "users"

    # uuid4 hex
    id: Mapped[str] = mapped_column(Text, primary_key=True)
    # 统一小写去空格后存储，UNIQUE 约束才有效
    email: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    # hex( sha256( PEPPER + authHashHex ) )
    auth_hash: Mapped[str] = mapped_column(Text, nullable=False)
    # hex, 16B
    kdf_salt: Mapped[str] = mapped_column(Text, nullable=False)
    kdf_iters: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[str] = mapped_column(Text, nullable=False)


class Vault(Base):
    """密文 blob 表。服务器只保管 iv / ct，永远不解密（铁律 R3）。"""

    __tablename__ = "vaults"

    user_id: Mapped[str] = mapped_column(
        Text,
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    version: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
        server_default=text("1"),
    )
    # hex, 12B
    iv: Mapped[str] = mapped_column(Text, nullable=False)
    # hex，可为空串（空明文 ⇒ 空密文）
    ct: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[str] = mapped_column(Text, nullable=False)
