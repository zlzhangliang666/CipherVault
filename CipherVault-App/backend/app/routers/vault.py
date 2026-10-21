"""密文 blob 的读写（乐观并发）—— 挂载后对外即 `/api/v1/vault`。"""

from fastapi import APIRouter

from app.deps import CurrentUser, DbSession
from app.schemas import VaultBlob, VaultPutRequest, VaultPutResponse
from app.services import vault_service

router = APIRouter(tags=["vault"])


@router.get("/vault", response_model=VaultBlob)
def get_vault(db: DbSession, user: CurrentUser) -> VaultBlob:
    """拉取密文。需要 Bearer；还没建过保险箱返回 404 VAULT_EMPTY。"""
    return vault_service.get_vault(db, user.id)


@router.put("/vault", response_model=VaultPutResponse)
def put_vault(payload: VaultPutRequest, db: DbSession, user: CurrentUser) -> VaultPutResponse:
    """上传密文。`baseVersion` 过期返回 409 VERSION_CONFLICT。"""
    return vault_service.put_vault(db, user.id, payload)
