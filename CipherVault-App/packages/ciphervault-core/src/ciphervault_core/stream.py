"""HMAC-SHA256 密钥流与完整性标签 —— ``docs/ALGORITHM.md`` 第 3 节。

这是本项目唯一需要「浏览器 ↔ Python」双向逐位一致的算法原语，
只使用 :mod:`hashlib` / :mod:`hmac`，不依赖任何第三方加密库。

    ks      = HMAC-SHA256(ENC, iv ‖ uint32be(counter))   # counter = 0,1,2,… 串接
    ct[i]   = pt[i] XOR ks[i]
    tag     = HMAC-SHA256(MAC, iv ‖ ct)

必须牢记的四个细节（任务书第 9.2 节「常见坑」）：

1. ``iv`` 是 **16 字节**（钥匙卡），不是保险箱用的 12 字节，两者不可混用；
2. ``uint32be(counter)`` = ``counter.to_bytes(4, "big")``，counter **从 0 开始**；
3. ``tag`` 的输入是 ``iv ‖ ct``，**不是** ``iv ‖ pt``，也**不是** ``ct ‖ iv``；
4. 空明文 ⇒ ``ct`` 为空串，但 ``tag`` **仍必须计算**（``HMAC(MAC, iv ‖ b"")``）。

与 WebCrypto 的等价性：``hmac.new(key, msg, sha256).digest()`` 与
``crypto.subtle.sign("HMAC", key, msg)`` 输出完全一致。
"""

import hashlib
import hmac

#: 钥匙卡 iv 长度（字节）→ 32 个 hex 字符。注意与 :data:`vault.VAULT_IV_LEN` 区分。
KEYCARD_IV_LEN = 16

#: HMAC-SHA256 的输出长度，同时也是密钥流每个块的长度与 tag 长度。
_HASH_LEN = 32


def keystream(enc_key: bytes, iv: bytes, length: int) -> bytes:
    """生成 ``length`` 字节的 HMAC-SHA256 密钥流。

    按 ``counter = 0, 1, 2, …`` 逐块计算 ``HMAC-SHA256(enc_key, iv ‖ uint32be(counter))``
    并串接，**按需生成、够长即可**；最后一块会被截断到 ``length``。

    Args:
        enc_key: 密钥流密钥，即 ``dk[0:32]``（等价于 ``vaultKey``）。
        iv: 16 字节初始向量。
        length: 需要的密钥流字节数；``<= 0`` 时返回 ``b""``（对应空明文场景）。

    Returns:
        长度恰为 ``max(length, 0)`` 的密钥流。
    """
    if length <= 0:
        return b""
    ks = bytearray()
    counter = 0
    while len(ks) < length:
        block = hmac.new(
            bytes(enc_key),
            bytes(iv) + counter.to_bytes(4, "big"),
            hashlib.sha256,
        ).digest()
        ks += block
        counter += 1
    return bytes(ks[:length])


def xor_stream(pt: bytes, ks: bytes) -> bytes:
    """把明文/密文与密钥流按**字节**异或（加密与解密是同一个运算）。

    Args:
        pt: 待处理的数据（加密时是 UTF-8 明文，解密时是密文）。
        ks: 密钥流，长度必须 **>=** ``len(pt)``。

    Returns:
        逐字节异或后的结果，长度与 ``pt`` 相同。

    Raises:
        ValueError: 密钥流长度不足（说明调用方生成 ``ks`` 时用错了长度）。
    """
    if len(ks) < len(pt):
        raise ValueError(f"密钥流长度不足：需要 {len(pt)} 字节，只有 {len(ks)} 字节")
    return bytes(a ^ b for a, b in zip(bytes(pt), bytes(ks)))


def compute_tag(mac_key: bytes, iv: bytes, ct: bytes) -> bytes:
    """计算完整性标签 ``tag = HMAC-SHA256(MAC, iv ‖ ct)``。

    ``ct`` 为空串时同样返回一个 32 字节的 tag —— **不允许跳过**
    （``docs/ALGORITHM.md`` 第 3.1 节：空明文 ⇒ ct 为空串，tag 仍必须计算）。

    Args:
        mac_key: 完整性密钥，即 ``dk[32:64]``（其 hex 形式就是 ``authHash``）。
        iv: 16 字节初始向量。
        ct: 密文字节串。

    Returns:
        32 字节的 tag。
    """
    return hmac.new(bytes(mac_key), bytes(iv) + bytes(ct), hashlib.sha256).digest()


def verify_tag(mac_key: bytes, iv: bytes, ct: bytes, tag: bytes) -> bool:
    """**恒定时间**校验 tag 是否匹配。

    内部使用 :func:`hmac.compare_digest`；任务书第 9.1 节明令禁止用 ``==`` 比较 tag，
    否则会引入按字节提前返回的时间侧信道。

    Args:
        mac_key: 完整性密钥 ``dk[32:64]``。
        iv: 16 字节初始向量。
        ct: 密文字节串。
        tag: 待校验的 tag（应为 32 字节；长度不符时比较结果自然为 ``False``）。

    Returns:
        匹配返回 ``True``，否则 ``False``。本函数**不抛异常、不返回差异细节**，
        调用方据此统一给出「主密码不正确」文案，避免泄露失败原因。
    """
    expected = compute_tag(mac_key, iv, ct)
    return hmac.compare_digest(expected, bytes(tag))
