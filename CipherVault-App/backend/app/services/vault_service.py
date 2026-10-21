"""密文 blob 的读取与乐观并发写入。

服务器只保管 iv / ct，不做任何解密、不做自动合并（铁律 R3）。
"""

from sqlalchemy.orm import Session

from app.models import Vault, utcnow_iso
from app.schemas import ApiError, VaultBlob, VaultPutRequest, VaultPutResponse


def get_vault(db: Session, user_id: str) -> VaultBlob:
    vault = db.get(Vault, user_id)
    if vault is None:
        raise ApiError("VAULT_EMPTY")
    return VaultBlob(
        version=vault.version,
        iv=vault.iv,
        ct=vault.ct,
        updated_at=vault.updated_at,
    )


def put_vault(db: Session, user_id: str, payload: VaultPutRequest) -> VaultPutResponse:
    """乐观并发：`baseVersion` 必须等于库中当前 `version`，否则 409。

    首次写入 `baseVersion = 0`，服务端从 `version = 1` 开始。
    """
    vault = db.get(Vault, user_id)
    now = utcnow_iso()

    if vault is None:
        if payload.base_version != 0:
            raise ApiError("VERSION_CONFLICT", detail={"currentVersion": 0})
        vault = Vault(
            user_id=user_id,
            version=1,
            iv=payload.iv,
            ct=payload.ct,
            updated_at=now,
        )
        db.add(vault)
        db.commit()
        return VaultPutResponse(version=vault.version, updated_at=vault.updated_at)

    if payload.base_version != vault.version:
        # 冲突时把服务端当前版本回给客户端，由前端让用户选择保留哪一份
        raise ApiError("VERSION_CONFLICT", detail={"currentVersion": vault.version})

    vault.iv = payload.iv
    vault.ct = payload.ct
    vault.version += 1
    vault.updated_at = now
    db.commit()
    return VaultPutResponse(version=vault.version, updated_at=vault.updated_at)
