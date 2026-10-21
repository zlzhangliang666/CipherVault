"""密钥派生 —— ``docs/ALGORITHM.md`` 第 1 节。

    dk = PBKDF2-HMAC-SHA256( password = UTF8(主密码), salt = kdfSalt(16B),
                             iterations = kdfIters, dkLen = 64 )

    vaultKey = dk[0:32]        # AES-GCM-256 密钥，仅存于渲染进程内存，绝不落盘
    authHash = hex(dk[32:64])  # 单机版运行时不再使用，仅为跨语言向量兼容保留

要点：

* 一次 PBKDF2 同时得到两段输出，二者由同一 64 字节输出切分而来。
* **切分顺序不可颠倒**：前 32 字节是 ``vaultKey``（钥匙卡里叫 ``ENC``），
  后 32 字节是 ``authHash`` 的原始字节（钥匙卡里叫 ``MAC``）。
* ``kdfSalt`` 与 ``kdfIters`` 随 ``vault.cvault`` 一起落盘；``vaultKey`` 不落盘。
  单机版没有服务器，``authHash`` 只用于验证跨语言派生结果一致。
* 与 WebCrypto 等价：本模块的 ``hashlib.pbkdf2_hmac`` 与前端
  ``crypto.subtle.deriveBits(..., 64 * 8)`` 结果完全一致；前端**不得**用
  ``deriveKey`` 去算 ``authHash``（``deriveKey`` 无法导出原始字节）。
"""

import hashlib

#: PBKDF2 输出总长度（字节）。前 32 给 vaultKey/ENC，后 32 给 authHash/MAC。
KDF_DKLEN = 64
#: kdfSalt 长度（字节）→ 32 个 hex 字符（``docs/CONTRACTS.md`` 1.2）。
KDF_SALT_LEN = 16
#: 默认迭代次数；注册后不可变更（本版不做改主密码流程）。
KDF_ITERS_DEFAULT = 200000


def derive_keys(
    master_password: str,
    salt: bytes,
    iters: int = KDF_ITERS_DEFAULT,
) -> tuple[bytes, bytes]:
    """由主密码派生 ``(vault_key, auth_hash)`` 两段各 32 字节的密钥材料。

    Args:
        master_password: 主密码明文，内部按 UTF-8 编码后送入 PBKDF2。
            本函数**不会**把它写进任何日志或异常信息。
        salt: 16 字节盐（``kdfSalt``）。长度由调用方保证——本模块不做校验，
            以便复用同一份派生逻辑处理任意固定盐的测试向量。
        iters: 迭代次数，默认 :data:`KDF_ITERS_DEFAULT`。

    Returns:
        ``(vault_key, auth_hash)``：
        ``vault_key = dk[0:32]``（AES-GCM-256 密钥 / 钥匙卡的 ENC），
        ``auth_hash = dk[32:64]``（登录校验值的**原始字节**，非 hex）。
    """
    dk = hashlib.pbkdf2_hmac(
        "sha256",
        master_password.encode("utf-8"),
        bytes(salt),
        iters,
        KDF_DKLEN,
    )
    return dk[:32], dk[32:]


def auth_hash_hex(
    master_password: str,
    salt: bytes,
    iters: int = KDF_ITERS_DEFAULT,
) -> str:
    """返回可上传的 ``authHash``：``hex(dk[32:64])``，64 个小写 hex 字符。

    注册时前端把它发给 ``POST /api/v1/auth/register``；登录时发给
    ``POST /api/v1/auth/login``。服务器再哈希后落库，**不存原文**。
    """
    return derive_keys(master_password, salt, iters)[1].hex()


def vault_key_bytes(
    master_password: str,
    salt: bytes,
    iters: int = KDF_ITERS_DEFAULT,
) -> bytes:
    """返回 ``vaultKey = dk[0:32]``（32 字节）。

    ⚠️ 该值**绝不允许**出现在任何 HTTP 请求体 / URL / 日志中（铁律 R1）；
    只应存活于客户端内存，并在离开页面或超时后清除。
    """
    return derive_keys(master_password, salt, iters)[0]
