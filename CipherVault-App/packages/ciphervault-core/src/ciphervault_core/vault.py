"""保险箱（整库）blob 的参数与长度校验 —— ``docs/ALGORITHM.md`` 第 2 节。

★ **本模块刻意不实现真实 AES。**

算法规格第 2 节写得很清楚：

    pt = UTF8(JSON.stringify(VaultDoc))          // 明文只在内存
    iv = 12B 随机
    ct = AES-GCM-256(key = vaultKey, iv, pt)      // WebCrypto 输出 = 密文 ‖ 16B 认证标签
    落盘 = { format:"ciphervault/vault", formatVersion:1,
             kdf:{salt, iters}, iv, ct }

而「**只有渲染进程解密保险箱**；Electron 主进程与核心库都不解密」。
因此 Python 侧的职责只有两件事：

1. 把该约定写成可执行的文档（就是本文件）；
2. 提供 :func:`validate_vault_blob`，让工具与测试复用同一套长度/格式校验，
   避免各处手写 magic number 而与契约漂移。

关键长度常量：

* :data:`VAULT_IV_LEN` = 12 字节 → **24 个 hex 字符**（``docs/CONTRACTS.md`` §1）。
  ⚠️ 与钥匙卡的 16 字节 iv（``stream.KEYCARD_IV_LEN``）**不可混用**。
* :data:`VAULT_TAG_LEN` = 16 字节。WebCrypto 的 AES-GCM 输出是「密文 ‖ 16B 认证标签」，
  所以一个合法 blob 的 ``ct`` 至少要有 16 字节。

``iv`` 每次写入都必须重新随机生成，禁止复用；解密失败（标签不匹配，通常是主密码错误）
由前端提示「主密码不正确或数据已损坏」。
"""

from .hexutil import from_hex

#: 保险箱 iv 长度（字节）→ 24 个 hex 字符。**不是** 16。
VAULT_IV_LEN = 12
#: AES-GCM 认证标签长度（字节），包含在 ``ct`` 的尾部。
VAULT_TAG_LEN = 16


def validate_vault_blob(iv_hex: str, ct_hex: str) -> None:
    """校验一个保险箱密文 blob 的 ``iv`` / ``ct`` 字段格式与长度。

    Args:
        iv_hex: ``iv`` 字段，必须是 :data:`VAULT_IV_LEN` 字节的 hex（24 个字符）。
        ct_hex: ``ct`` 字段，必须是合法 hex，且字节数 >= :data:`VAULT_TAG_LEN`
            （因为 WebCrypto 的 AES-GCM 输出含 16 字节尾随标签）。

    Raises:
        TypeError: 字段不是 ``str``。
        ValueError: 长度或字符不合法。异常信息只含字段名与长度，**不回显 hex 内容**
            （``ct`` 是用户密文，属于敏感数据）。
    """
    iv = from_hex(iv_hex)
    if len(iv) != VAULT_IV_LEN:
        raise ValueError(
            f"iv 必须是 {VAULT_IV_LEN} 字节（{VAULT_IV_LEN * 2} 个 hex 字符），"
            f"收到 {len(iv)} 字节"
        )
    ct = from_hex(ct_hex)
    if len(ct) < VAULT_TAG_LEN:
        raise ValueError(
            f"ct 至少要包含 {VAULT_TAG_LEN} 字节的 AES-GCM 认证标签，收到 {len(ct)} 字节"
        )
