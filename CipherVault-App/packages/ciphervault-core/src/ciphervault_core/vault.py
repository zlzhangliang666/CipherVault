"""保险箱（整库）blob 的参数与长度校验 —— ``docs/ALGORITHM.md`` 第 2 节。

★ **本模块刻意不实现真实 AES。**

算法规格第 2 节写得很清楚：

    pt = UTF8(JSON.stringify(VaultDoc))          // 明文只在内存
    iv = 12B 随机
    ct = AES-GCM-256(key = vaultKey, iv, pt)      // WebCrypto 输出 = 密文 ‖ 16B 认证标签
    上传 = { iv: hex(iv), ct: hex(ct), baseVersion }

而「**只有前端解密保险箱**；后端与核心库都不解密（后端只见密文 blob）」。
因此 Python 侧的职责只有两件事：

1. 把该约定写成可执行的文档（就是本文件）；
2. 提供 :func:`validate_vault_blob` / :func:`validate_put_request`，
   让后端（组员 B）在处理 ``GET/PUT /api/v1/vault`` 时能复用同一套长度/格式校验，
   避免各处手写 magic number 而与契约漂移。

关键长度常量：

* :data:`VAULT_IV_LEN` = 12 字节 → **24 个 hex 字符**（``docs/CONTRACTS.md`` 1.5/1.6）。
  ⚠️ 与钥匙卡的 16 字节 iv（``stream.KEYCARD_IV_LEN``）**不可混用**。
* :data:`VAULT_TAG_LEN` = 16 字节。WebCrypto 的 AES-GCM 输出是「密文 ‖ 16B 认证标签」，
  所以一个合法 blob 的 ``ct`` 至少要有 16 字节。

``iv`` 每次上传都必须重新随机生成，禁止复用；解密失败（标签不匹配，通常是主密码错误）
由前端提示「主密码不正确或数据已损坏」。这两条同样只在前端生效。
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


def validate_put_request(base_version: int, iv_hex: str, ct_hex: str) -> None:
    """校验 ``PUT /api/v1/vault`` 请求体（``docs/CONTRACTS.md`` 1.6）。

    请求体形状::

        { "baseVersion": 3, "iv": "<hex, 24 字符>", "ct": "<hex>" }

    ``baseVersion`` 用于乐观并发：首次写入传 ``0``，服务端从 ``version = 1`` 开始；
    与库中 ``version`` 不一致即返回 409 ``VERSION_CONFLICT``，不做自动合并。

    Args:
        base_version: 客户端读取 blob 时拿到的版本号，必须是**非负整数**。
        iv_hex: 同 :func:`validate_vault_blob`。
        ct_hex: 同 :func:`validate_vault_blob`。

    Raises:
        TypeError: ``base_version`` 不是整数（``bool`` 也被拒绝，尽管它是 ``int`` 子类）。
        ValueError: ``base_version`` 为负数，或 blob 字段校验失败。
    """
    # bool 是 int 的子类，必须显式排除，否则 baseVersion=true 会被当成 1 悄悄通过。
    if isinstance(base_version, bool) or not isinstance(base_version, int):
        raise TypeError(f"baseVersion 必须是整数，收到 {type(base_version).__name__}")
    if base_version < 0:
        raise ValueError(f"baseVersion 必须为非负整数，收到 {base_version}")
    validate_vault_blob(iv_hex, ct_hex)
