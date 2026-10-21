"""契约数据形状（一律 camelCase）与统一错误载体。

内部字段用 snake_case，靠 `alias_generator=to_camel` 映射成契约要求的 camelCase；
FastAPI 序列化响应时默认 `by_alias=True`，因此对外一律是 camelCase。
"""

from typing import Any

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

# docs/CONTRACTS.md §0 的统一错误码 → (HTTP 状态码, message)
# message 取契约各端点示例里的原文；UNAUTHORIZED / VALIDATION_ERROR 契约未给文案，用固定中文串。
ERROR_SPECS: dict[str, tuple[int, str]] = {
    "USER_NOT_FOUND": (404, "用户不存在"),
    "EMAIL_EXISTS": (409, "该邮箱已注册"),
    "INVALID_CREDENTIALS": (401, "邮箱或主密码不正确"),
    "UNAUTHORIZED": (401, "登录状态缺失、无效或已过期"),
    "VAULT_EMPTY": (404, "尚未创建保险箱"),
    "VERSION_CONFLICT": (409, "版本冲突"),
    "VALIDATION_ERROR": (422, "请求体校验失败"),
}

# 二进制一律十六进制小写字符串，不用 base64（docs/CONTRACTS.md §0）
_HEX_64 = r"^[0-9a-f]{64}$"  # authHash：32 字节
_HEX_32 = r"^[0-9a-f]{32}$"  # kdfSalt：16 字节
_HEX_24 = r"^[0-9a-f]{24}$"  # iv：12 字节
_HEX_ANY = r"^[0-9a-f]*$"  # ct：允许空串（空明文 ⇒ 空密文）


class ApiError(Exception):
    """业务错误。由 `app.main` 的异常处理器统一转成 `{"error":{...}}` 响应。

    `code` 只能是 `ERROR_SPECS` 里的 7 个之一——禁止自行发明错误码。
    """

    def __init__(self, code: str, detail: dict[str, Any] | None = None) -> None:
        status_code, message = ERROR_SPECS[code]
        self.code = code
        self.status_code = status_code
        self.message = message
        self.detail = detail or {}
        # 异常文案只用固定串，不携带任何请求内容（铁律 R1：日志里不得出现
        # authHash / token / ct 原文）
        super().__init__(code)


class CamelModel(BaseModel):
    """所有请求/响应模型的基类：snake_case 内部名 ↔ camelCase 对外名。"""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class HealthResponse(CamelModel):
    status: str
    version: str


class KdfResponse(CamelModel):
    kdf_salt: str
    kdf_iters: int


class RegisterRequest(CamelModel):
    email: str
    auth_hash: str = Field(pattern=_HEX_64)
    kdf_salt: str = Field(pattern=_HEX_32)
    kdf_iters: int


class RegisterResponse(CamelModel):
    user_id: str


class LoginRequest(CamelModel):
    email: str
    auth_hash: str = Field(pattern=_HEX_64)


class LoginResponse(CamelModel):
    token: str
    user_id: str
    expires_in: int


class VaultBlob(CamelModel):
    version: int
    iv: str
    ct: str
    updated_at: str


class VaultPutRequest(CamelModel):
    base_version: int
    iv: str = Field(pattern=_HEX_24)
    ct: str = Field(pattern=_HEX_ANY)


class VaultPutResponse(CamelModel):
    version: int
    updated_at: str


class ErrorBody(CamelModel):
    code: str
    message: str
    detail: dict[str, Any] | None = None


class ErrorResponse(CamelModel):
    error: ErrorBody
