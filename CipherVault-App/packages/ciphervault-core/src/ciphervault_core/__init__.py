"""CipherVault 加密核心库（纯 Python 标准库实现）。

本包把 ``docs/ALGORITHM.md``（冻结的算法规格 v1.0）落成可测试、可复现的代码，
并提供跨语言基准向量 ``vectors.json`` 的校验 CLI —— 前端（TS/WebCrypto）与本库的
密文必须**逐字节相同**，这是整个项目的集成验收基准。

模块划分：

===================  ==========================================================
:mod:`.hexutil`      hex ↔ bytes（小写输出、非法输入抛 ``ValueError``）
:mod:`.kdf`          算法第 1 节：PBKDF2 密钥派生（vaultKey / authHash）
:mod:`.vault`        算法第 2 节：保险箱 blob **只做文档与参数校验，不做真实 AES**
:mod:`.stream`       算法第 3 节：HMAC-SHA256 密钥流 + tag 计算/恒定时间校验
:mod:`.skin`         算法第 4 节：趣味皮肤（SEP / POEMS / XF / encode / decode）
:mod:`.keycard`      算法第 3 节：钥匙卡载荷级加解密（kc_encrypt / kc_decrypt）
:mod:`.vectors`      算法第 6 节：向量生成与校验 CLI
:mod:`.cli`          离线解密入口（读载荷 → 输入主密码 → 输出条目密码与显示串）
===================  ==========================================================

命令行入口（安装本包后可用）::

    python -m ciphervault_core.vectors --verify vectors.json
    python -m ciphervault_core.cli keycard_payload.json

⚠️ 安全铁律（``docs/ARCHITECTURE.md``）：主密码、明文、``vaultKey`` **绝不允许**
出现在任何 HTTP 请求体 / URL / 日志中；本包所有异常文案均为固定串，不回显敏感值。
"""

from .hexutil import from_hex, to_hex
from .kdf import (
    KDF_DKLEN,
    KDF_ITERS_DEFAULT,
    KDF_SALT_LEN,
    auth_hash_hex,
    derive_keys,
    vault_key_bytes,
)
from .keycard import kc_decrypt, kc_encrypt
from .skin import POEMS, SEP, XF, Codec, decode_token, encode_token
from .stream import (
    KEYCARD_IV_LEN,
    compute_tag,
    keystream,
    verify_tag,
    xor_stream,
)
from .vault import (
    VAULT_IV_LEN,
    VAULT_TAG_LEN,
    validate_put_request,
    validate_vault_blob,
)

__version__ = "0.1.0"

__all__ = [
    # 常量
    "KDF_DKLEN",
    "KDF_ITERS_DEFAULT",
    "KDF_SALT_LEN",
    "KEYCARD_IV_LEN",
    "POEMS",
    "SEP",
    "VAULT_IV_LEN",
    "VAULT_TAG_LEN",
    "XF",
    "__version__",
    # hex 工具
    "from_hex",
    "to_hex",
    # 密钥派生
    "auth_hash_hex",
    "derive_keys",
    "vault_key_bytes",
    # 密钥流与 tag
    "compute_tag",
    "keystream",
    "verify_tag",
    "xor_stream",
    # 趣味皮肤
    "Codec",
    "decode_token",
    "encode_token",
    # 钥匙卡载荷
    "kc_decrypt",
    "kc_encrypt",
    # 保险箱 blob 校验（Python 侧不做真实 AES）
    "validate_put_request",
    "validate_vault_blob",
]
