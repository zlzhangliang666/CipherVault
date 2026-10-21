# -*- coding: utf-8 -*-
"""``skin`` 模块测试 —— 逐字对照 ``POEMS`` / ``SEP`` 与 encode/decode 往返。

对应任务书第 5.2 节对 ``tests/test_skin.py`` 的要求：

* 断言 ``POEMS`` 长度 16、互不相同、与冻结文档及 ``vectors.json[*].skin.poems`` 逐字一致；
* ``SEP == "\\u00b7"``；
* 对每条向量的 ``ctHex`` 用其 ``skin.rules`` 编码 == ``display``，再由 ``display`` 解码 == ``ctHex``；
* 越界段抛错。

同时覆盖第 9.2 节「常见坑」第 9、10、11、12 条。
"""

import json
from pathlib import Path

import pytest

from ciphervault_core import POEMS, SEP, XF, decode_token, encode_token

VECTORS_PATH = Path(__file__).resolve().parents[1] / "vectors.json"
VECTORS = json.loads(VECTORS_PATH.read_text(encoding="utf-8"))
IDS = [vec["name"] for vec in VECTORS]

# docs/ALGORITHM.md 在仓库里的位置（相对本测试文件向上三级到 CipherVault-App/）。
ALGORITHM_PATH = Path(__file__).resolve().parents[3] / "docs" / "ALGORITHM.md"

RULE_NAMES = ("letter", "number", "poem")


# --------------------------------------------------------------------------
# 冻结常量
# --------------------------------------------------------------------------
def test_sep_is_middle_dot_u00b7() -> None:
    """``SEP`` 必须是 U+00B7 中间点，**不是** ASCII 句点。"""
    assert SEP == "\u00b7"
    assert SEP == "·"
    assert SEP != "."
    assert ord(SEP) == 0xB7


def test_poems_has_16_distinct_lines() -> None:
    """``POEMS`` 恰好 16 句、互不相同（否则 poem 映射就不是双射）。"""
    assert len(POEMS) == 16
    assert len(set(POEMS)) == 16
    assert all(isinstance(line, str) and line for line in POEMS)


def test_poems_match_frozen_document() -> None:
    """逐字对照 ``docs/ALGORITHM.md``：16 句诗与 ``SEP`` 常量都必须原文出现。"""
    if not ALGORITHM_PATH.is_file():
        pytest.skip(f"未找到冻结文档 {ALGORITHM_PATH}（本包被单独安装时可跳过）")
    text = ALGORITHM_PATH.read_text(encoding="utf-8")
    for line in POEMS:
        assert line in text, f"docs/ALGORITHM.md 中找不到诗句：{line}"
    assert f'SEP = "{SEP}"' in text


@pytest.mark.parametrize("vec", VECTORS, ids=IDS)
def test_poems_match_vectors_json(vec: dict) -> None:
    """每条向量的 ``skin.poems`` / ``skin.sep`` 必须与本包常量逐字一致。"""
    assert vec["skin"]["poems"] == list(POEMS)
    assert vec["skin"]["sep"] == SEP


def test_poems_first_and_last_lines() -> None:
    """抽查首尾与中间几句，防止整体顺序被调换（下标即映射值）。"""
    assert POEMS[0] == "床前明月光"
    assert POEMS[5] == "处处闻啼鸟"
    assert POEMS[9] == "黄河入海流"
    assert POEMS[15] == "粒粒皆辛苦"


# --------------------------------------------------------------------------
# 映射表 XF
# --------------------------------------------------------------------------
def test_xf_exposes_exactly_three_rules() -> None:
    """``XF`` 恰好提供 ``letter`` / ``number`` / ``poem`` 三个规则，各带 encode/decode。"""
    assert set(XF) == set(RULE_NAMES)
    for name in RULE_NAMES:
        assert callable(XF[name].encode)
        assert callable(XF[name].decode)


@pytest.mark.parametrize("rule", RULE_NAMES)
def test_each_rule_is_a_bijection_on_nibbles(rule: str) -> None:
    """三个映射都必须是 ``0..15`` 到显示串的**双射**，且 decode(encode(n)) == n。"""
    encoded = [XF[rule].encode(n) for n in range(16)]
    assert len(set(encoded)) == 16, f"{rule} 不是单射"
    for n in range(16):
        assert XF[rule].decode(encoded[n]) == n, f"{rule} 在 n={n} 处往返失败"


def test_letter_mapping_is_uppercase_a_to_p() -> None:
    """``letter``：``n`` → ``chr(65 + n)``，即 ``A``…``P``；解码取**首字符**减 65。"""
    assert [XF["letter"].encode(n) for n in range(16)] == list("ABCDEFGHIJKLMNOP")
    assert XF["letter"].decode("A") == 0
    assert XF["letter"].decode("P") == 15
    # 越界值不在这里抛错，而是返回越界数字交给 decode_token 统一判定
    assert XF["letter"].decode("Q") == 16
    assert XF["letter"].decode("@") == -1
    assert XF["letter"].decode("") == -1


def test_number_mapping_is_two_digit_10_to_25() -> None:
    """``number``：``n`` → ``str(n + 10)``，即两位字符串 ``"10"``…``"25"``。"""
    assert [XF["number"].encode(n) for n in range(16)] == [str(i) for i in range(10, 26)]
    assert XF["number"].decode("10") == 0
    assert XF["number"].decode("25") == 15
    assert XF["number"].decode("26") == 16  # 越界，由 decode_token 拒绝
    assert XF["number"].decode("诗") == -1  # 非数字 → 无法还原


def test_poem_mapping_uses_poems_index() -> None:
    """``poem``：``n`` → ``POEMS[n]``；解码是查表取下标，查不到返回 -1。"""
    assert [XF["poem"].encode(n) for n in range(16)] == list(POEMS)
    assert XF["poem"].decode("床前明月光") == 0
    assert XF["poem"].decode("粒粒皆辛苦") == 15
    assert XF["poem"].decode("不存在的一句") == -1


def test_encode_rejects_out_of_range_nibble() -> None:
    """编码侧入参必须落在 0..15。"""
    for name in RULE_NAMES:
        with pytest.raises(ValueError):
            XF[name].encode(16)
        with pytest.raises(ValueError):
            XF[name].encode(-1)


# --------------------------------------------------------------------------
# encode_token / decode_token
# --------------------------------------------------------------------------
def test_rules_cycle_by_index_modulo() -> None:
    """第 ``i`` 个半字节使用 ``rules[i % len(rules)]``（混合皮肤三种规则循环）。"""
    rules = ["letter", "poem", "number"]
    # n = 0,1,2 → letter(0)="A"、poem(1)="疑是地上霜"、number(2)="12"
    assert encode_token("012", rules) == f"A{SEP}疑是地上霜{SEP}12"
    # 第 4 个字符回到 letter
    assert encode_token("0003", rules).split(SEP)[3] == "D"


@pytest.mark.parametrize("vec", VECTORS, ids=IDS)
def test_encode_matches_vector_display(vec: dict) -> None:
    """对每条向量：``encode_token(ctHex, skin.rules)`` 必须 == ``display``。"""
    rules = vec["skin"]["rules"]
    assert encode_token(vec["ctHex"], rules) == vec["display"]


@pytest.mark.parametrize("vec", VECTORS, ids=IDS)
def test_decode_restores_vector_ct_hex(vec: dict) -> None:
    """对每条向量：``decode_token(display, skin.rules)`` 必须还原 ``ctHex``。"""
    rules = vec["skin"]["rules"]
    assert decode_token(vec["display"], rules) == vec["ctHex"].lower()


@pytest.mark.parametrize("vec", VECTORS, ids=IDS)
def test_segment_count_equals_hex_length(vec: dict) -> None:
    """分段数必须等于 ``ctHex`` 长度（每个半字节一段）。"""
    assert len(vec["display"].split(SEP)) == len(vec["ctHex"])


def test_display_of_vec01_starts_with_expected_triplet() -> None:
    """抽验 vec-01-mixed 的前三段，确认混合皮肤的循环顺序没被写反。"""
    mixed = next(vec for vec in VECTORS if vec["name"] == "vec-01-mixed")
    segs = mixed["display"].split(SEP)
    assert segs[0] == "B"  # ctHex[0] = '1' → letter(1) = 'B'
    assert segs[1] == "夜来风雨声"  # ctHex[1] = '6' → poem(6)
    assert segs[2] == "23"  # ctHex[2] = 'd' = 13 → number(13) = '23'


def test_roundtrip_for_all_single_rules() -> None:
    """三种单一皮肤各自 encode→decode 往返一致。"""
    ct_hex = "0123456789abcdeffedcba9876543210"
    for rules in (["letter"], ["poem"], ["number"], ["letter", "poem", "number"]):
        display = encode_token(ct_hex, rules)
        assert decode_token(display, rules) == ct_hex


def test_empty_ct_hex_roundtrips_to_empty_display() -> None:
    """空密文（空条目密码场景）：``encode`` 得 ``""``，``decode`` 也必须还原 ``""``。"""
    for rules in (["letter"], ["poem"], ["number"], ["letter", "poem", "number"]):
        assert encode_token("", rules) == ""
        assert decode_token("", rules) == ""


def test_uppercase_hex_input_is_normalized() -> None:
    """``encode_token`` 接受大写 hex 输入，输出仍是同一份显示串（全项目统一小写）。"""
    assert encode_token("ABCDEF", ["letter"]) == encode_token("abcdef", ["letter"])
    assert decode_token(encode_token("ABCDEF", ["letter"]), ["letter"]) == "abcdef"


def test_decode_reports_1_based_segment_index() -> None:
    """越界段必须抛「第 (i+1) 段无法还原」，段号从 1 开始。"""
    with pytest.raises(ValueError, match=r"第 1 段无法还原"):
        decode_token("Q", ["letter"])  # 'Q' → 16，越界
    with pytest.raises(ValueError, match=r"第 2 段无法还原"):
        decode_token(f"A{SEP}Q", ["letter"])
    with pytest.raises(ValueError, match=r"第 3 段无法还原"):
        decode_token(f"10{SEP}11{SEP}26", ["number"])  # 26 → 16，越界
    with pytest.raises(ValueError, match=r"第 1 段无法还原"):
        decode_token("床前明月光光", ["poem"])  # 查不到 → -1


def test_wrong_rules_cannot_restore() -> None:
    """用错皮肤解码（字母皮肤编码、数字皮肤解码）必须失败，而不是给出错误 hex。"""
    display = encode_token("0f", ["letter"])  # "A·P"
    with pytest.raises(ValueError, match="无法还原"):
        decode_token(display, ["number"])


def test_encode_rejects_bad_rules_and_bad_hex() -> None:
    """``rules`` 为空或含未知规则名、``ct_hex`` 含非法字符，都必须抛 ``ValueError``。"""
    with pytest.raises(ValueError, match="rules 不能为空"):
        encode_token("00", [])
    with pytest.raises(ValueError, match="rules 不能为空"):
        decode_token("A", [])
    with pytest.raises(ValueError, match="未知皮肤规则"):
        encode_token("00", ["emoji"])
    with pytest.raises(ValueError, match="未知皮肤规则"):
        decode_token("A", ["emoji"])
    with pytest.raises(ValueError, match="ctHex 含非法字符"):
        encode_token("0g", ["letter"])
