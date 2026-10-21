# -*- coding: utf-8 -*-
"""``vectors`` 模块测试 —— 4 条向量全部往返通过，且逐字节复现 ``ctHex``/``tagHex``/``display``。

对应任务书第 5.2 节对 ``tests/test_vectors.py`` 的要求，以及第 7.1 节的验收标准：

* **逐字节复现**：用向量里的 ``saltHex`` / ``ivHex`` / ``entryPassword`` / ``masterPassword``
  调 ``kc_encrypt(...)``，``ctHex``、``tagHex`` 必须与向量**完全相同**
  （即便对方 hex 用大写，也先统一小写再按字节比较，**不是「大致一致」**）；
* ``encode_token(ctHex, skin.rules)`` == ``display``；
* ``python -m ciphervault_core.vectors --verify vectors.json`` 退出码为 0。
"""

import json
from pathlib import Path

import pytest

from ciphervault_core import decode_token, encode_token, from_hex, kc_decrypt, kc_encrypt
from ciphervault_core.vectors import _FIXED_INPUTS, build_vector, main, verify_file

VECTORS_PATH = Path(__file__).resolve().parents[1] / "vectors.json"
VECTORS = json.loads(VECTORS_PATH.read_text(encoding="utf-8"))
IDS = [vec["name"] for vec in VECTORS]

#: ``vectors.json`` 每条向量的完整字段顺序（任务书第 4.7 节）。
FIELD_ORDER = [
    "name",
    "note",
    "masterPassword",
    "entryPassword",
    "saltHex",
    "ivHex",
    "iters",
    "authHashHex",
    "vaultKeyHex",
    "ctHex",
    "tagHex",
    "display",
    "skin",
]


def test_baseline_file_has_four_vectors_with_expected_names() -> None:
    """基准文件恰好 4 条向量，名称与任务书第 4.7 节一致。"""
    assert len(VECTORS) == 4
    assert IDS == ["vec-01-mixed", "vec-02-poem", "vec-03-letter", "vec-04-number"]


@pytest.mark.parametrize("vec", VECTORS, ids=IDS)
def test_every_vector_carries_the_full_field_set(vec: dict) -> None:
    """每条向量的字段名与顺序都必须与冻结格式一致（含 KDF 两个派生字段）。"""
    assert list(vec) == FIELD_ORDER
    assert list(vec["skin"]) == ["name", "rules", "poems", "sep"]
    assert vec["iters"] == 200000
    assert len(vec["saltHex"]) == 32  # 16 字节
    assert len(vec["ivHex"]) == 32  # 16 字节（不是保险箱的 24）
    assert len(vec["tagHex"]) == 64  # 32 字节
    assert len(vec["authHashHex"]) == 64
    assert len(vec["vaultKeyHex"]) == 64


@pytest.mark.parametrize("vec", VECTORS, ids=IDS)
def test_reencryption_reproduces_ct_and_tag_byte_for_byte(vec: dict) -> None:
    """★ 核心断言：重新加密的 ``ctHex``/``tagHex`` 与基准**逐字节相同**。"""
    payload = kc_encrypt(
        vec["masterPassword"],
        vec["entryPassword"],
        salt=from_hex(vec["saltHex"]),
        iv=from_hex(vec["ivHex"]),
        iters=vec["iters"],
    )

    # 先按 hex 字符串比（统一小写），再按 bytes 比一次，杜绝「大小写蒙对」的假通过。
    assert payload["ctHex"] == vec["ctHex"].lower()
    assert payload["tagHex"] == vec["tagHex"].lower()
    assert from_hex(payload["ctHex"]) == from_hex(vec["ctHex"])
    assert from_hex(payload["tagHex"]) == from_hex(vec["tagHex"])


@pytest.mark.parametrize("vec", VECTORS, ids=IDS)
def test_vector_roundtrip(vec: dict) -> None:
    """往返：加密结果能解回 ``entryPassword``，基准载荷本身也能解回 ``entryPassword``。"""
    payload = kc_encrypt(
        vec["masterPassword"],
        vec["entryPassword"],
        salt=from_hex(vec["saltHex"]),
        iv=from_hex(vec["ivHex"]),
        iters=vec["iters"],
    )
    assert kc_decrypt(vec["masterPassword"], payload) == vec["entryPassword"]
    assert kc_decrypt(vec["masterPassword"], vec) == vec["entryPassword"]


@pytest.mark.parametrize("vec", VECTORS, ids=IDS)
def test_display_is_reproduced_and_reversible(vec: dict) -> None:
    """``encode_token(ctHex, skin.rules)`` == ``display``，且 ``display`` 能解回 ``ctHex``。"""
    rules = vec["skin"]["rules"]
    ct_hex = vec["ctHex"].lower()

    assert encode_token(ct_hex, rules) == vec["display"]
    assert decode_token(vec["display"], rules) == ct_hex
    # 皮肤是外衣：换一套 rules 只改显示串，不改 ctHex。
    for other in (["letter"], ["poem"], ["number"], ["letter", "poem", "number"]):
        assert decode_token(encode_token(ct_hex, other), other) == ct_hex


def test_builtin_skins_cover_all_four_vectors() -> None:
    """4 条向量分别覆盖混合 / 古诗 / 字母 / 数字四种内置皮肤。"""
    assert [vec["skin"]["name"] for vec in VECTORS] == ["混合皮肤", "古诗皮肤", "字母皮肤", "数字皮肤"]
    assert [vec["skin"]["rules"] for vec in VECTORS] == [
        ["letter", "poem", "number"],
        ["poem"],
        ["letter"],
        ["number"],
    ]


@pytest.mark.parametrize("vec", VECTORS, ids=IDS)
def test_build_vector_reproduces_the_committed_entry(vec: dict) -> None:
    """``--write`` 用的内置固定输入必须能算出与基准文件完全相同的向量。

    这条断言保证 ``make vectors``（即 ``--write vectors.json``）是**幂等**的：
    重新生成不会改动负责人提交的基准文件。
    """
    inputs = next(item for item in _FIXED_INPUTS if item["name"] == vec["name"])
    rebuilt = build_vector(inputs)

    assert list(rebuilt) == FIELD_ORDER
    assert rebuilt == vec


def test_verify_file_accepts_the_baseline(capsys: pytest.CaptureFixture) -> None:
    """``verify_file`` 对仓库基准文件返回 ``True``，并打印「4 条向量全部通过」。"""
    assert verify_file(VECTORS_PATH) is True
    assert "4 条向量全部通过" in capsys.readouterr().out


def test_main_verify_exits_zero(capsys: pytest.CaptureFixture) -> None:
    """CLI：``--verify vectors.json`` 退出码必须为 0（CI 的 ``contracts`` job 依赖此点）。"""
    assert main(["--verify", str(VECTORS_PATH)]) == 0
    assert "4 条向量全部通过" in capsys.readouterr().out


def test_main_verify_exits_one_on_mismatch(
    tmp_path: Path,
    capsys: pytest.CaptureFixture,
) -> None:
    """篡改任一字段后 ``--verify`` 必须打印差异并以退出码 1 失败。"""
    broken = json.loads(json.dumps(VECTORS))
    broken[0]["ctHex"] = "00" * (len(broken[0]["ctHex"]) // 2)
    broken_path = tmp_path / "broken.json"
    broken_path.write_text(json.dumps(broken, ensure_ascii=False), encoding="utf-8")

    assert main(["--verify", str(broken_path)]) == 1
    out = capsys.readouterr().out
    assert "[FAIL] vec-01-mixed" in out
    assert "4 条向量全部通过" not in out


def test_main_verify_exits_one_on_bad_file(tmp_path: Path) -> None:
    """向量文件不存在或不是 JSON 数组时，``--verify`` 也必须以 1 失败（而不是抛栈）。"""
    assert main(["--verify", str(tmp_path / "missing.json")]) == 1

    not_json = tmp_path / "not-json.json"
    not_json.write_text("{ 这不是 JSON", encoding="utf-8")
    assert main(["--verify", str(not_json)]) == 1

    empty_array = tmp_path / "empty.json"
    empty_array.write_text("[]", encoding="utf-8")
    assert main(["--verify", str(empty_array)]) == 1


def test_main_write_regenerates_the_same_content(tmp_path: Path) -> None:
    """``--write`` 到临时目录：产物必须能通过 ``--verify``，且内容与基准文件一致。

    故意写到 ``tmp_path``——**绝不**覆盖仓库里的基准 ``vectors.json``
    （任务书第 9.2 节第 15 条）。
    """
    out_path = tmp_path / "vectors.json"
    assert main(["--write", str(out_path)]) == 0
    assert out_path.is_file()

    assert main(["--verify", str(out_path)]) == 0
    assert json.loads(out_path.read_text(encoding="utf-8")) == VECTORS

    # 基准文件本身必须原封不动（只读约束）。
    assert json.loads(VECTORS_PATH.read_text(encoding="utf-8")) == VECTORS


def test_main_requires_exactly_one_mode() -> None:
    """``--verify`` 与 ``--write`` 互斥且必选其一，否则 argparse 以退出码 2 报错。"""
    with pytest.raises(SystemExit) as excinfo:
        main([])
    assert excinfo.value.code == 2

    with pytest.raises(SystemExit):
        main(["--verify", str(VECTORS_PATH), "--write", "out.json"])
