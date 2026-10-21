"""钥匙卡载荷的加密与解密 —— ``docs/ALGORITHM.md`` 第 3 节。

「离线钥匙卡」是 CipherVault 的两大卖点之一：每条密码都能导出成一张**脱离本项目即可运行**
的卡片（``.html`` 或 ``.py``），卡片里内嵌密文载荷，仍必须输入主密码才能还原。

载荷字段（全项目统一小写 hex，``docs/CONTRACTS.md`` 第 0 节）::

    { "saltHex": <32 hex>, "ivHex": <32 hex>, "ctHex": <hex>, "tagHex": <64 hex>, "iters": 200000 }

加密流程::

    salt = 16B 随机（测试向量中用固定值）
    iv   = 16B 随机（测试向量中用固定值）
    dk   = PBKDF2-HMAC-SHA256( UTF8(主密码), salt, kdfIters, dkLen = 64 )
    ENC  = dk[0:32]      # 密钥流密钥
    MAC  = dk[32:64]     # 完整性密钥
    pt   = UTF8(条目密码)  # 注意：加密的是「条目密码」，密钥来自「主密码」

解密流程（**顺序不能反**）::

    1. 先校验 tag = HMAC-SHA256(MAC, iv ‖ ct)，用恒定时间比较；不匹配 → 「主密码不正确」
    2. 再还原 pt[i] = ct[i] XOR ks[i]，UTF-8 解码

先验 tag 再解密，是为了避免对伪造数据做无用计算与信息泄露。

⚠️ 注意 :data:`~.kdf.KDF_SALT_LEN` 与 :data:`~.stream.KEYCARD_IV_LEN` 的差别：
钥匙卡 salt 是 16 字节、iv 也是 **16** 字节；保险箱 iv 是 **12** 字节。两者不可混用。
"""

import secrets
from collections.abc import Mapping
from typing import Any

from .hexutil import from_hex, to_hex
from .kdf import KDF_ITERS_DEFAULT, KDF_SALT_LEN, derive_keys
from .stream import KEYCARD_IV_LEN, compute_tag, keystream, verify_tag, xor_stream

#: 完整性标签长度（字节）→ 64 个 hex 字符（HMAC-SHA256 输出）。
_TAG_LEN = 32

#: 载荷必须包含的字段（顺序即 ``docs/ALGORITHM.md`` 3.1 的书写顺序）。
_PAYLOAD_FIELDS = ("saltHex", "ivHex", "ctHex", "tagHex", "iters")


def kc_encrypt(
    master_password: str,
    entry_password: str,
    salt: bytes | None = None,
    iv: bytes | None = None,
    iters: int = KDF_ITERS_DEFAULT,
) -> dict[str, Any]:
    """用主密码加密一条「条目密码」，返回可直接内嵌进钥匙卡的载荷字典。

    Args:
        master_password: 主密码明文（只用于派生密钥，**不会**出现在返回值或异常里）。
        entry_password: 待保护的条目密码明文，按 UTF-8 编码后加密。
            允许空串——此时 ``ctHex`` 为 ``""``，但 ``tagHex`` 仍会正常计算。
        salt: 可选的固定 16 字节盐。**仅测试向量复现时使用**；
            传 ``None`` 则由 :func:`secrets.token_bytes` 生成密码学随机盐。
        iv: 可选的固定 16 字节 iv，用途同上。生成钥匙卡时**必须**留空以取随机值，
            禁止复用（``docs/ALGORITHM.md`` 第 8 节第 4 条）。
        iters: PBKDF2 迭代次数，默认 200000。

    Returns:
        含 ``saltHex`` / ``ivHex`` / ``ctHex`` / ``tagHex`` / ``iters`` 五个键的字典，
        所有二进制字段均为小写 hex 字符串。

    Raises:
        ValueError: 注入的 ``salt`` / ``iv`` 长度不对，或 ``iters`` 不是正整数。
    """
    if salt is None:
        salt = secrets.token_bytes(KDF_SALT_LEN)
    if iv is None:
        iv = secrets.token_bytes(KEYCARD_IV_LEN)
    salt, iv = bytes(salt), bytes(iv)

    if len(salt) != KDF_SALT_LEN:
        raise ValueError(f"salt 必须是 {KDF_SALT_LEN} 字节，收到 {len(salt)} 字节")
    if len(iv) != KEYCARD_IV_LEN:
        raise ValueError(
            f"钥匙卡 iv 必须是 {KEYCARD_IV_LEN} 字节，收到 {len(iv)} 字节"
            "（注意：保险箱用的是 12 字节，两者不可混用）"
        )
    _check_iters(iters)

    # derive_keys 返回 (dk[0:32], dk[32:64])，在钥匙卡语境下就是 (ENC, MAC)。
    enc_key, mac_key = derive_keys(master_password, salt, iters)

    pt = entry_password.encode("utf-8")
    ks = keystream(enc_key, iv, len(pt))
    ct = xor_stream(pt, ks)
    tag = compute_tag(mac_key, iv, ct)

    return {
        "saltHex": to_hex(salt),
        "ivHex": to_hex(iv),
        "ctHex": to_hex(ct),
        "tagHex": to_hex(tag),
        "iters": iters,
    }


def kc_decrypt(master_password: str, payload: Mapping[str, Any]) -> str:
    """用主密码解开钥匙卡载荷，返回条目密码明文。

    **先验 tag，再解密**——顺序不可颠倒。

    Args:
        master_password: 主密码明文。
        payload: 载荷字典，须含 ``saltHex`` / ``ivHex`` / ``ctHex`` / ``tagHex`` / ``iters``。
            多余的键（例如 ``skin``、``name``）会被忽略，因此可以直接把
            ``vectors.json`` 里的一条向量、或生成的钥匙卡 JSON 整体传进来。

    Returns:
        条目密码明文（UTF-8 解码结果）。

    Raises:
        ValueError: 载荷缺字段、hex 非法、长度不符、``iters`` 非正整数，
            或 **tag 校验不通过**。tag 不通过时统一抛
            ``ValueError("主密码不正确")``——固定文案，不含任何期望值/实际值，
            以免泄露主密码或密钥材料的信息（``docs/ALGORITHM.md`` 第 8 节第 2 条）。
    """
    missing = [name for name in _PAYLOAD_FIELDS if name not in payload]
    if missing:
        raise ValueError(f"钥匙卡载荷缺少字段：{'、'.join(missing)}")

    salt = from_hex(str(payload["saltHex"]))
    iv = from_hex(str(payload["ivHex"]))
    ct = from_hex(str(payload["ctHex"]))
    tag = from_hex(str(payload["tagHex"]))
    iters = payload["iters"]

    if len(salt) != KDF_SALT_LEN:
        raise ValueError(f"saltHex 必须对应 {KDF_SALT_LEN} 字节，收到 {len(salt)} 字节")
    if len(iv) != KEYCARD_IV_LEN:
        raise ValueError(f"ivHex 必须对应 {KEYCARD_IV_LEN} 字节，收到 {len(iv)} 字节")
    if len(tag) != _TAG_LEN:
        raise ValueError(f"tagHex 必须对应 {_TAG_LEN} 字节，收到 {len(tag)} 字节")
    _check_iters(iters)

    enc_key, mac_key = derive_keys(master_password, salt, int(iters))

    # 第 1 步：恒定时间校验 tag。失败即拒绝，绝不对未认证数据做解密。
    if not verify_tag(mac_key, iv, ct, tag):
        raise ValueError("主密码不正确")

    # 第 2 步：tag 通过后才还原明文。异或与加密时是同一个运算。
    pt = xor_stream(ct, keystream(enc_key, iv, len(ct)))
    return pt.decode("utf-8")


def _check_iters(iters: Any) -> None:
    """校验迭代次数是正整数（``bool`` 显式排除）。

    Raises:
        ValueError: 类型或取值不合法。
    """
    if isinstance(iters, bool) or not isinstance(iters, int) or iters < 1:
        raise ValueError("iters 必须是正整数")
