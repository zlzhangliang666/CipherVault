# -*- coding: utf-8 -*-
"""``kdf`` 模块测试 —— 对照 ``vectors.json`` 里的 ``authHashHex`` / ``vaultKeyHex``。

覆盖 ``docs/ALGORITHM.md`` 第 6 节验收要求第 5 条：

    用 masterPassword + saltHex + iters 派生 →
    authHashHex（dk[32:64]）与 vaultKeyHex（dk[0:32]）逐字节相同

以及任务书第 9.2 节「常见坑」第 2、3 条：salt 16 字节、dklen 64、
**切分顺序** ``vaultKey = dk[:32]`` / ``authHash = dk[32:]`` 不可颠倒。
"""

import hashlib
import json
from pathlib import Path

import pytest

from ciphervault_core import (
    KDF_DKLEN,
    KDF_ITERS_DEFAULT,
    KDF_SALT_LEN,
    auth_hash_hex,
    derive_keys,
    from_hex,
    vault_key_bytes,
)

VECTORS_PATH = Path(__file__).resolve().parents[1] / "vectors.json"
VECTORS = json.loads(VECTORS_PATH.read_text(encoding="utf-8"))
IDS = [vec["name"] for vec in VECTORS]


def test_constants_match_spec() -> None:
    """常量必须与冻结规格一致：dkLen=64、salt=16B、默认迭代 200000。"""
    assert KDF_DKLEN == 64
    assert KDF_SALT_LEN == 16
    assert KDF_ITERS_DEFAULT == 200000


def test_derive_keys_returns_two_32_byte_halves() -> None:
    """``derive_keys`` 输出两段各 32 字节，合计等于 ``KDF_DKLEN``。

    这里用 ``iters=1`` 只验结构，不验数值（数值由下面的向量对照负责）。
    """
    vault_key, auth_hash = derive_keys("any-password", bytes(KDF_SALT_LEN), iters=1)
    assert len(vault_key) == 32
    assert len(auth_hash) == 32
    assert len(vault_key) + len(auth_hash) == KDF_DKLEN


@pytest.mark.parametrize("vec", VECTORS, ids=IDS)
def test_derive_keys_reproduces_vector_fields(vec: dict) -> None:
    """4 条向量的 ``vaultKeyHex`` / ``authHashHex`` 必须逐字节复现。"""
    salt = from_hex(vec["saltHex"])
    vault_key, auth_hash = derive_keys(vec["masterPassword"], salt, vec["iters"])

    assert vault_key.hex() == vec["vaultKeyHex"].lower()
    assert auth_hash.hex() == vec["authHashHex"].lower()

    # 交叉验证：直接调 hashlib 拿完整 64 字节，确认切分顺序是 [:32] / [32:]，没有颠倒。
    dk = hashlib.pbkdf2_hmac(
        "sha256",
        vec["masterPassword"].encode("utf-8"),
        salt,
        vec["iters"],
        KDF_DKLEN,
    )
    assert len(dk) == 64
    assert dk[:32] == vault_key
    assert dk[32:] == auth_hash


@pytest.mark.parametrize("vec", VECTORS, ids=IDS)
def test_public_helpers_agree_with_derive_keys(vec: dict) -> None:
    """``auth_hash_hex`` / ``vault_key_bytes`` 两个便捷入口与 ``derive_keys`` 一致。"""
    salt = from_hex(vec["saltHex"])
    iters = vec["iters"]
    master = vec["masterPassword"]

    got_auth_hex = auth_hash_hex(master, salt, iters)
    assert got_auth_hex == vec["authHashHex"].lower()
    # authHash 是 64 个小写 hex 字符（docs/CONTRACTS.md 1.3）。
    assert len(got_auth_hex) == 64
    assert got_auth_hex == got_auth_hex.lower()

    assert vault_key_bytes(master, salt, iters) == from_hex(vec["vaultKeyHex"])


@pytest.mark.parametrize("vec", VECTORS, ids=IDS)
def test_wrong_master_password_yields_different_auth_hash(vec: dict) -> None:
    """主密码改一个字符 → ``authHash`` 必须完全不同（雪崩效应）。

    直接拿错误主密码的派生结果与**向量里已知的** ``authHashHex`` 比，
    不必再算一遍正确主密码。
    """
    wrong = vec["masterPassword"] + "-wrong"
    got = auth_hash_hex(wrong, from_hex(vec["saltHex"]), vec["iters"])
    assert got != vec["authHashHex"].lower()
