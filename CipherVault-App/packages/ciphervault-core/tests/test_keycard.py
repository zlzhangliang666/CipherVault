# -*- coding: utf-8 -*-
"""``keycard`` 模块测试 —— 用向量里的主密码解出条目密码，错误主密码必须被拒。

对应任务书第 5.2 节对 ``tests/test_keycard.py`` 的要求，以及 ``docs/ALGORITHM.md``
第 6 节验收要求第 1、2 条：

1. 用 ``masterPassword`` 解 ``ctHex`` + ``tagHex`` → 必须得到 ``entryPassword``；
2. 用错误主密码解 → 必须被 tag 校验拒绝（**抛错，而不是返回乱码**）。

同时覆盖第 9.2 节「常见坑」第 1、2、6 条（iv 16 字节 / salt 16 字节 / 先验 tag 再解密），
以及第 9.1 节「异常文案不得泄露敏感值」。
"""

import json
from pathlib import Path

import pytest

from ciphervault_core import (
    KDF_ITERS_DEFAULT,
    KDF_SALT_LEN,
    KEYCARD_IV_LEN,
    from_hex,
    kc_decrypt,
    kc_encrypt,
)

VECTORS_PATH = Path(__file__).resolve().parents[1] / "vectors.json"
VECTORS = json.loads(VECTORS_PATH.read_text(encoding="utf-8"))
IDS = [vec["name"] for vec in VECTORS]


def _wrong_password(master: str) -> str:
    """把主密码的最后一个字符改掉一个，得到「只差一个字符」的错误主密码。"""
    last = "A" if master[-1] != "A" else "B"
    return master[:-1] + last


# --------------------------------------------------------------------------
# 验收要求 1：正确主密码必须还原出条目密码
# --------------------------------------------------------------------------
@pytest.mark.parametrize("vec", VECTORS, ids=IDS)
def test_decrypt_vector_with_correct_master_password(vec: dict) -> None:
    """4 条向量：``kc_decrypt(masterPassword, payload)`` 必须 == ``entryPassword``。"""
    assert kc_decrypt(vec["masterPassword"], vec) == vec["entryPassword"]


@pytest.mark.parametrize("vec", VECTORS, ids=IDS)
def test_decrypt_only_needs_the_five_payload_fields(vec: dict) -> None:
    """载荷只需 5 个字段即可解密；``vectors.json`` 的额外字段（skin 等）应被忽略。"""
    payload = {key: vec[key] for key in ("saltHex", "ivHex", "ctHex", "tagHex", "iters")}
    assert kc_decrypt(vec["masterPassword"], payload) == vec["entryPassword"]


# --------------------------------------------------------------------------
# 验收要求 2：错误主密码必须被 tag 校验拒绝
# --------------------------------------------------------------------------
@pytest.mark.parametrize("vec", VECTORS, ids=IDS)
def test_decrypt_with_wrong_master_password_is_rejected(vec: dict) -> None:
    """主密码改一个字符 → 必须抛 ``ValueError("主密码不正确")``，而不是返回乱码。"""
    with pytest.raises(ValueError, match="主密码不正确") as excinfo:
        kc_decrypt(_wrong_password(vec["masterPassword"]), vec)
    # 异常文案是固定串，不得回显主密码或任何密钥材料。
    message = str(excinfo.value)
    assert vec["masterPassword"] not in message
    assert vec["entryPassword"] not in message
    assert vec["authHashHex"] not in message
    assert vec["vaultKeyHex"] not in message


@pytest.mark.parametrize("vec", VECTORS, ids=IDS)
def test_tampered_ciphertext_is_rejected(vec: dict) -> None:
    """篡改密文一个 bit → tag 校验失败，同样报「主密码不正确」。"""
    ct = bytearray(from_hex(vec["ctHex"]))
    ct[0] ^= 0x01
    tampered = dict(vec)
    tampered["ctHex"] = ct.hex()
    with pytest.raises(ValueError, match="主密码不正确"):
        kc_decrypt(vec["masterPassword"], tampered)


def test_empty_master_password_does_not_bypass_verification() -> None:
    """空主密码同样必须被拒绝（tag 不匹配），不能因为「密码为空」而短路放行。"""
    with pytest.raises(ValueError, match="主密码不正确"):
        kc_decrypt("", VECTORS[0])


# --------------------------------------------------------------------------
# 加密：可注入固定 salt/iv 以复现向量
# --------------------------------------------------------------------------
@pytest.mark.parametrize("vec", VECTORS, ids=IDS)
def test_encrypt_with_fixed_salt_and_iv_reproduces_payload(vec: dict) -> None:
    """注入向量里的 ``saltHex`` / ``ivHex`` 重新加密 → ``ctHex``/``tagHex`` 逐字节相同。"""
    payload = kc_encrypt(
        vec["masterPassword"],
        vec["entryPassword"],
        salt=from_hex(vec["saltHex"]),
        iv=from_hex(vec["ivHex"]),
        iters=vec["iters"],
    )
    assert payload["ctHex"] == vec["ctHex"].lower()
    assert payload["tagHex"] == vec["tagHex"].lower()
    assert payload["saltHex"] == vec["saltHex"].lower()
    assert payload["ivHex"] == vec["ivHex"].lower()
    assert payload["iters"] == vec["iters"]


def test_encrypt_payload_has_exactly_the_spec_fields() -> None:
    """载荷字段严格为 ``saltHex``/``ivHex``/``ctHex``/``tagHex``/``iters`` 五个。"""
    payload = kc_encrypt("master", "entry")
    assert set(payload) == {"saltHex", "ivHex", "ctHex", "tagHex", "iters"}
    assert payload["iters"] == KDF_ITERS_DEFAULT
    assert len(payload["saltHex"]) == KDF_SALT_LEN * 2  # 32 hex
    assert len(payload["ivHex"]) == KEYCARD_IV_LEN * 2  # 32 hex
    assert len(payload["tagHex"]) == 64
    # 全项目统一小写 hex
    for field in ("saltHex", "ivHex", "ctHex", "tagHex"):
        assert payload[field] == payload[field].lower()


def test_encrypt_uses_fresh_random_salt_and_iv_by_default() -> None:
    """不注入 salt/iv 时必须取密码学随机值，两次加密不得复用（禁止 iv 复用）。"""
    first = kc_encrypt("master", "entry")
    second = kc_encrypt("master", "entry")
    assert first["saltHex"] != second["saltHex"]
    assert first["ivHex"] != second["ivHex"]
    assert first["ctHex"] != second["ctHex"]


def test_roundtrip_with_random_salt_and_iv() -> None:
    """随机 salt/iv 下加解密必须能往返。"""
    payload = kc_encrypt("blue-Harbor-2026-quiet", "S3cr3t-Entry-01!")
    assert kc_decrypt("blue-Harbor-2026-quiet", payload) == "S3cr3t-Entry-01!"


def test_empty_entry_password_roundtrip() -> None:
    """空条目密码：``ctHex`` 为空串，但 ``tagHex`` 仍照常计算，且能往返。"""
    payload = kc_encrypt("master", "")
    assert payload["ctHex"] == ""
    assert len(payload["tagHex"]) == 64
    assert kc_decrypt("master", payload) == ""


def test_unicode_entry_password_roundtrip() -> None:
    """条目密码按 **UTF-8 字节**加密，中文/emoji 也必须能往返。"""
    secret = "密码-Pa55w0rd-🔐"
    payload = kc_encrypt("master", secret)
    assert kc_decrypt("master", payload) == secret


# --------------------------------------------------------------------------
# 参数校验
# --------------------------------------------------------------------------
def test_encrypt_rejects_wrong_salt_length() -> None:
    """注入的 salt 必须是 16 字节。"""
    with pytest.raises(ValueError, match="salt 必须是 16 字节"):
        kc_encrypt("master", "entry", salt=bytes(12), iv=bytes(KEYCARD_IV_LEN))


def test_encrypt_rejects_wrong_iv_length() -> None:
    """注入的 iv 必须是 **16** 字节——保险箱的 12 字节不可混用。"""
    with pytest.raises(ValueError, match="iv 必须是 16 字节"):
        kc_encrypt("master", "entry", salt=bytes(KDF_SALT_LEN), iv=bytes(12))


def test_encrypt_rejects_non_positive_iters() -> None:
    """``iters`` 必须是正整数。"""
    with pytest.raises(ValueError, match="iters 必须是正整数"):
        kc_encrypt("master", "entry", iters=0)


@pytest.mark.parametrize(
    "missing",
    ["saltHex", "ivHex", "ctHex", "tagHex", "iters"],
)
def test_decrypt_reports_missing_payload_field(missing: str) -> None:
    """载荷缺字段 → 报错并指出缺哪个字段（但不回显字段内容）。"""
    payload = {key: VECTORS[0][key] for key in ("saltHex", "ivHex", "ctHex", "tagHex", "iters")}
    del payload[missing]
    with pytest.raises(ValueError, match="缺少字段"):
        kc_decrypt(VECTORS[0]["masterPassword"], payload)


def test_decrypt_rejects_bad_hex_and_bad_lengths() -> None:
    """非法 hex、iv/salt/tag 长度不符、``iters`` 非正整数，都必须在**解密前**被拒。"""
    base = {key: VECTORS[0][key] for key in ("saltHex", "ivHex", "ctHex", "tagHex", "iters")}

    with pytest.raises(ValueError):
        kc_decrypt("master", {**base, "ctHex": "zz"})  # 非法 hex 字符

    with pytest.raises(ValueError, match="saltHex 必须对应 16 字节"):
        kc_decrypt("master", {**base, "saltHex": "00" * 15})

    with pytest.raises(ValueError, match="ivHex 必须对应 16 字节"):
        kc_decrypt("master", {**base, "ivHex": "00" * 12})  # 误用保险箱的 12 字节

    with pytest.raises(ValueError, match="tagHex 必须对应 32 字节"):
        kc_decrypt("master", {**base, "tagHex": "00" * 16})

    with pytest.raises(ValueError, match="iters 必须是正整数"):
        kc_decrypt("master", {**base, "iters": 0})
