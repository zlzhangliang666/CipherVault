# -*- coding: utf-8 -*-
"""``stream`` 模块测试 —— 密钥流与 tag 的确定性。

对应任务书第 5.2 节对 ``tests/test_stream.py`` 的要求：

* 固定 key/iv 时，``keystream`` 每 32 字节块前缀等于
  ``HMAC-SHA256(key, iv + uint32be(counter))``；
* 空明文 ⇒ ``ct = b""``，但 tag 长度仍为 32；
* ``verify_tag`` 对篡改的 ct 返回 ``False``。

同时覆盖第 9.2 节「常见坑」第 4、5、7 条：counter 从 0 开始且为 4 字节大端、
tag 输入是 ``iv ‖ ct``（不是 ``iv ‖ pt``、也不是 ``ct ‖ iv``）、空明文仍算 tag。
"""

import hashlib
import hmac

import pytest

from ciphervault_core import (
    KEYCARD_IV_LEN,
    compute_tag,
    keystream,
    verify_tag,
    xor_stream,
)

# 固定测试数据：与向量无关，只验算法结构，因此不需要跑 PBKDF2。
ENC_KEY = bytes(range(32))
MAC_KEY = bytes(range(32, 64))
IV = bytes(range(160, 176))


def _hmac_sha256(key: bytes, msg: bytes) -> bytes:
    """测试内独立实现的 HMAC-SHA256，用来交叉验证 ``stream`` 的输出。"""
    return hmac.new(key, msg, hashlib.sha256).digest()


def test_keycard_iv_len_is_16_not_12() -> None:
    """钥匙卡 iv 是 16 字节；保险箱的 12 字节由 ``vault.VAULT_IV_LEN`` 单独表达。"""
    assert KEYCARD_IV_LEN == 16
    assert len(IV) == KEYCARD_IV_LEN


def test_keystream_blocks_match_hmac_with_uint32be_counter() -> None:
    """逐块核对：第 n 块 == ``HMAC-SHA256(ENC, iv ‖ n.to_bytes(4, "big"))``，counter 从 0 起。"""
    ks = keystream(ENC_KEY, IV, 96)
    assert len(ks) == 96
    for counter in range(3):
        expected_block = _hmac_sha256(ENC_KEY, IV + counter.to_bytes(4, "big"))
        assert ks[counter * 32 : (counter + 1) * 32] == expected_block


def test_keystream_single_block_prefix() -> None:
    """长度不足一块时，结果是第 0 块的**前缀**（而不是补零或抛错）。"""
    block0 = _hmac_sha256(ENC_KEY, IV + (0).to_bytes(4, "big"))
    assert keystream(ENC_KEY, IV, 7) == block0[:7]


def test_keystream_is_deterministic_and_length_exact() -> None:
    """同样的 key/iv/length 必须给出同样的密钥流；长度精确等于请求值。"""
    for length in (0, 1, 31, 32, 33, 100):
        first = keystream(ENC_KEY, IV, length)
        assert first == keystream(ENC_KEY, IV, length)
        assert len(first) == length
    # length <= 0 → 空串
    assert keystream(ENC_KEY, IV, 0) == b""
    assert keystream(ENC_KEY, IV, -5) == b""


def test_keystream_depends_on_key_and_iv() -> None:
    """换 key 或换 iv 都会得到完全不同的密钥流。"""
    base = keystream(ENC_KEY, IV, 64)
    assert keystream(MAC_KEY, IV, 64) != base
    other_iv = bytes(16)
    assert keystream(ENC_KEY, other_iv, 64) != base


def test_xor_stream_roundtrip_and_bytewise_semantics() -> None:
    """异或按**字节**进行，且加解密是同一个运算（自反）。"""
    pt = "S3cr3t-Entry-01!".encode("utf-8")
    ks = keystream(ENC_KEY, IV, len(pt))
    ct = xor_stream(pt, ks)
    assert ct != pt
    assert len(ct) == len(pt)
    assert xor_stream(ct, ks) == pt
    # 手工逐字节核对一次，确保不是按字符或其它粒度做的。
    assert ct == bytes(a ^ b for a, b in zip(pt, ks))


def test_xor_stream_rejects_short_keystream() -> None:
    """密钥流比数据短 → 抛 ``ValueError``，而不是静默截断。"""
    with pytest.raises(ValueError, match="密钥流长度不足"):
        xor_stream(b"0123456789", keystream(ENC_KEY, IV, 4))


def test_empty_plaintext_gives_empty_ct_but_full_tag() -> None:
    """空明文 ⇒ ``ct = b""``，但 tag **仍必须计算**且长度为 32。"""
    ct = xor_stream(b"", keystream(ENC_KEY, IV, 0))
    assert ct == b""
    tag = compute_tag(MAC_KEY, IV, ct)
    assert len(tag) == 32
    assert tag == _hmac_sha256(MAC_KEY, IV + b"")
    assert verify_tag(MAC_KEY, IV, ct, tag) is True


def test_tag_input_order_is_iv_then_ct() -> None:
    """``tag = HMAC(MAC, iv ‖ ct)``：顺序反了、或用明文，都必须得到不同的 tag。"""
    ct = b"\x16\xd7\xd4\x77\x72\x9b\x5d\xdc"
    tag = compute_tag(MAC_KEY, IV, ct)
    assert tag == _hmac_sha256(MAC_KEY, IV + ct)
    assert tag != _hmac_sha256(MAC_KEY, ct + IV)  # 不是 ct ‖ iv
    assert tag != _hmac_sha256(MAC_KEY, IV)  # 不是只喂 iv


def test_verify_tag_accepts_correct_and_rejects_tampering() -> None:
    """``verify_tag``：正确 tag 通过；篡改 ct、tag 或换 MAC 密钥都必须返回 ``False``。"""
    ct = xor_stream(b"correct-horse-battery", keystream(ENC_KEY, IV, 21))
    tag = compute_tag(MAC_KEY, IV, ct)

    assert verify_tag(MAC_KEY, IV, ct, tag) is True

    tampered = bytearray(ct)
    tampered[0] ^= 0x01
    assert verify_tag(MAC_KEY, IV, bytes(tampered), tag) is False

    bad_tag = bytearray(tag)
    bad_tag[-1] ^= 0x01
    assert verify_tag(MAC_KEY, IV, ct, bytes(bad_tag)) is False

    assert verify_tag(ENC_KEY, IV, ct, tag) is False
    assert verify_tag(MAC_KEY, bytes(16), ct, tag) is False
    # 截断的 tag 长度不符 → 同样拒绝
    assert verify_tag(MAC_KEY, IV, ct, tag[:16]) is False
