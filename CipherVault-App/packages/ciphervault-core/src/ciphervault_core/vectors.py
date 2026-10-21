"""跨语言测试向量的生成与校验 CLI —— ``docs/ALGORITHM.md`` 第 6 节。

``vectors.json`` 是前端（TS/WebCrypto）与核心库（Python stdlib）之间的**集成验收基准**：
固定 ``salt`` / ``iv`` 以得到确定性输出，两边算出的 ``ctHex`` / ``tagHex`` / ``display``
必须**逐字节相同**。

两种用法::

    # 校验：4 条向量全部通过则打印「4 条向量全部通过」并返回退出码 0，否则打印差异并返回 1
    python -m ciphervault_core.vectors --verify vectors.json

    # 生成：用内置的 4 条固定输入重算 ctHex/tagHex/display/authHashHex/vaultKeyHex 并写文件
    python -m ciphervault_core.vectors --write vectors.json

每条向量都会跑完 ``docs/ALGORITHM.md`` 第 6 节列出的 5 条验收要求：

1. 用 ``masterPassword`` 解 ``ctHex`` + ``tagHex`` → 必须得到 ``entryPassword``；
2. 用错误主密码解 → 必须被 tag 校验拒绝（抛错，而不是返回乱码）；
3. 用 ``saltHex`` / ``ivHex`` / ``entryPassword`` 重新加密 → ``ctHex``、``tagHex`` 逐字节相同；
4. ``encode_token(ctHex, skin.rules)`` == ``display``，且 ``decode_token(display, …)`` == ``ctHex``；
5. 用 ``masterPassword`` + ``saltHex`` + ``iters`` 派生 → ``authHashHex``、``vaultKeyHex`` 逐字节相同。

另外还会校验 ``skin.poems`` / ``skin.sep`` 与 :mod:`.skin` 里冻结的常量逐字一致。

★ ``--write`` **只用于本地回归验证**：它内置的固定输入逐字取自仓库里的基准文件，
因此输出应当与 ``packages/ciphervault-core/vectors.json`` 逐字节一致（``make vectors`` 因而是幂等的）。
**不要**拿 ``--write`` 的产物去「修正」基准文件——若二者不一致，先怀疑自己的实现
（hex 大小写、iv 长度、counter 编码、tag 输入顺序、UTF-8、迭代次数），确认是向量本身有误才上报负责人。
"""

import argparse
import json
import sys
from collections.abc import Mapping
from pathlib import Path
from typing import Any

from .hexutil import from_hex, to_hex
from .kdf import derive_keys
from .keycard import kc_decrypt, kc_encrypt
from .skin import POEMS, SEP, decode_token, encode_token


def _skin(name: str, rules: list[str]) -> dict[str, Any]:
    """构造向量里的 ``skin`` 对象；``poems`` / ``sep`` 一律取自冻结常量。"""
    return {"name": name, "rules": rules, "poems": list(POEMS), "sep": SEP}


#: ``--write`` 用的 4 条固定输入（``name``/``note``/``masterPassword``/``entryPassword``/
#: ``saltHex``/``ivHex``/``iters``/``skin`` 逐字取自仓库里的 ``vectors.json``）。
#: 其余字段（``authHashHex``/``vaultKeyHex``/``ctHex``/``tagHex``/``display``）全部由算法算出。
_FIXED_INPUTS: tuple[dict[str, Any], ...] = (
    {
        "name": "vec-01-mixed",
        "note": "混合皮肤（字母/古诗/数字循环）",
        "masterPassword": "blue-Harbor-2026-quiet",
        "entryPassword": "S3cr3t-Entry-01!",
        "saltHex": "101112131415161718191a1b1c1d1e1f",
        "ivHex": "a0a1a2a3a4a5a6a7a8a9aaabacadaeaf",
        "iters": 200000,
        "skin": _skin("混合皮肤", ["letter", "poem", "number"]),
    },
    {
        "name": "vec-02-poem",
        "note": "古诗皮肤",
        "masterPassword": "quiet-Meadow-2026-lantern",
        "entryPassword": "Abc123!@#",
        "saltHex": "202122232425262728292a2b2c2d2e2f",
        "ivHex": "b0b1b2b3b4b5b6b7b8b9babbbcbdbebf",
        "iters": 200000,
        "skin": _skin("古诗皮肤", ["poem"]),
    },
    {
        "name": "vec-03-letter",
        "note": "字母皮肤",
        "masterPassword": "amber-River-2026-candle",
        "entryPassword": "0f9A-kQ2!z",
        "saltHex": "303132333435363738393a3b3c3d3e3f",
        "ivHex": "c0c1c2c3c4c5c6c7c8c9cacbcccdcecf",
        "iters": 200000,
        "skin": _skin("字母皮肤", ["letter"]),
    },
    {
        "name": "vec-04-number",
        "note": "数字皮肤",
        "masterPassword": "silver-Pine-2026-orbit",
        "entryPassword": "Tr0ub4dor&3",
        "saltHex": "404142434445464748494a4b4c4d4e4f",
        "ivHex": "d0d1d2d3d4d5d6d7d8d9dadbdcdddedf",
        "iters": 200000,
        "skin": _skin("数字皮肤", ["number"]),
    },
)


def build_vector(inputs: Mapping[str, Any]) -> dict[str, Any]:
    """由一条固定输入算出完整向量（字段顺序与 ``vectors.json`` 一致）。

    Args:
        inputs: :data:`_FIXED_INPUTS` 中的一项。

    Returns:
        含 13 个字段的字典：``name``、``note``、``masterPassword``、``entryPassword``、
        ``saltHex``、``ivHex``、``iters``、``authHashHex``、``vaultKeyHex``、
        ``ctHex``、``tagHex``、``display``、``skin``。
    """
    master = inputs["masterPassword"]
    salt = from_hex(inputs["saltHex"])
    iv = from_hex(inputs["ivHex"])
    iters = inputs["iters"]
    rules = inputs["skin"]["rules"]

    vault_key, auth_hash = derive_keys(master, salt, iters)
    payload = kc_encrypt(master, inputs["entryPassword"], salt=salt, iv=iv, iters=iters)

    return {
        "name": inputs["name"],
        "note": inputs["note"],
        "masterPassword": master,
        "entryPassword": inputs["entryPassword"],
        "saltHex": inputs["saltHex"],
        "ivHex": inputs["ivHex"],
        "iters": iters,
        "authHashHex": to_hex(auth_hash),
        "vaultKeyHex": to_hex(vault_key),
        "ctHex": payload["ctHex"],
        "tagHex": payload["tagHex"],
        "display": encode_token(payload["ctHex"], rules),
        "skin": inputs["skin"],
    }


def _diff(problems: list[str], field: str, expected: Any, actual: Any) -> None:
    """把一处不一致追加进 ``problems``。

    只回显 hex / 显示串这类**已公开在向量文件里**的值；
    涉及密码明文的比较只报「是否一致」，不打印实际解出的内容。
    """
    problems.append(f"{field} 不一致：期望 {expected!r}，实际 {actual!r}")


def _check_vector(vec: Mapping[str, Any]) -> list[str]:
    """对单条向量跑完 5 条验收要求，返回问题列表（空列表即通过）。"""
    problems: list[str] = []
    name = vec.get("name", "<无名向量>")
    master = vec.get("masterPassword", "")
    rules = vec.get("skin", {}).get("rules", [])

    # ---- 前置：冻结常量一致性（POEMS / SEP 一个字都不能错）----
    if vec.get("skin", {}).get("poems") != list(POEMS):
        problems.append("skin.poems 与 skin.POEMS 常量不一致（16 句必须逐字相同）")
    if vec.get("skin", {}).get("sep") != SEP:
        problems.append(f"skin.sep 必须是 U+00B7 {SEP!r}")

    try:
        salt = from_hex(vec["saltHex"])
        iv = from_hex(vec["ivHex"])
        iters = vec["iters"]

        # ---- 要求 5：密钥派生（authHashHex = hex(dk[32:64])、vaultKeyHex = hex(dk[0:32])）----
        vault_key, auth_hash = derive_keys(master, salt, iters)
        if to_hex(vault_key) != str(vec["vaultKeyHex"]).lower():
            _diff(problems, "vaultKeyHex", vec["vaultKeyHex"], to_hex(vault_key))
        if to_hex(auth_hash) != str(vec["authHashHex"]).lower():
            _diff(problems, "authHashHex", vec["authHashHex"], to_hex(auth_hash))

        # ---- 要求 3：重新加密必须逐字节复现 ctHex / tagHex ----
        payload = kc_encrypt(master, vec["entryPassword"], salt=salt, iv=iv, iters=iters)
        if payload["ctHex"] != str(vec["ctHex"]).lower():
            _diff(problems, "ctHex", vec["ctHex"], payload["ctHex"])
        if payload["tagHex"] != str(vec["tagHex"]).lower():
            _diff(problems, "tagHex", vec["tagHex"], payload["tagHex"])

        # ---- 要求 1：用主密码解密必须得到 entryPassword ----
        got = kc_decrypt(master, vec)
        if got != vec["entryPassword"]:
            # 不打印解出的明文，只报长度差异，避免日志里出现密码。
            problems.append(
                f"解密结果与 entryPassword 不一致"
                f"（期望 {len(vec['entryPassword'])} 字符，实际 {len(got)} 字符）"
            )

        # ---- 要求 2：错误主密码必须被 tag 校验拒绝（抛错，而不是返回乱码）----
        try:
            kc_decrypt(master + "-wrong", vec)
        except ValueError:
            pass
        else:
            problems.append("错误主密码未被拒绝（应当抛 ValueError）")

        # ---- 要求 4：皮肤编码/解码往返 ----
        display = encode_token(str(vec["ctHex"]).lower(), rules)
        if display != vec["display"]:
            _diff(problems, "display", vec["display"], display)
        if decode_token(vec["display"], rules) != str(vec["ctHex"]).lower():
            _diff(problems, "decode_token(display)", str(vec["ctHex"]).lower(), "还原结果不同")
    except (KeyError, TypeError, ValueError) as exc:
        problems.append(f"校验过程抛出异常：{type(exc).__name__}: {exc}")

    if problems:
        print(f"[FAIL] {name}")
        for item in problems:
            print(f"    - {item}")
    else:
        print(f"[PASS] {name}  {vec.get('note', '')}")
    return problems


def verify_file(path: str | Path) -> bool:
    """校验一个向量文件里的**全部**向量。

    Args:
        path: ``vectors.json`` 路径。

    Returns:
        全部通过返回 ``True``；任一条不符返回 ``False``（并已把差异打印到 stdout）。
    """
    file_path = Path(path)
    try:
        vectors = json.loads(file_path.read_text(encoding="utf-8"))
    except OSError as exc:
        print(f"无法读取向量文件 {file_path}：{exc}")
        return False
    except json.JSONDecodeError as exc:
        print(f"向量文件 {file_path} 不是合法 JSON：{exc}")
        return False

    if not isinstance(vectors, list) or not vectors:
        print(f"向量文件 {file_path} 应当是一个非空 JSON 数组")
        return False
    bad_index = next(
        (i for i, vec in enumerate(vectors) if not isinstance(vec, dict)),
        None,
    )
    if bad_index is not None:
        print(f"向量文件 {file_path} 的第 {bad_index + 1} 条不是 JSON 对象")
        return False

    print(f"校验 {file_path}（{len(vectors)} 条向量，每条 {vectors[0].get('iters')} 次 PBKDF2）…")
    failed = 0
    for vec in vectors:
        if _check_vector(vec):
            failed += 1

    if failed:
        print(f"{failed}/{len(vectors)} 条向量未通过")
        return False
    print(f"{len(vectors)} 条向量全部通过")
    return True


def _write_file(path: str | Path) -> int:
    """用 :data:`_FIXED_INPUTS` 重新生成向量文件（本地回归用）。"""
    file_path = Path(path)
    vectors = [build_vector(inputs) for inputs in _FIXED_INPUTS]
    text = json.dumps(vectors, ensure_ascii=False, indent=2) + "\n"
    try:
        file_path.write_text(text, encoding="utf-8", newline="\n")
    except OSError as exc:
        print(f"无法写入 {file_path}：{exc}")
        return 1
    print(f"已生成 {len(vectors)} 条向量 → {file_path}")
    print("提示：该命令仅用于本地回归，请勿用其输出覆盖仓库里的基准 vectors.json。")
    return 0


def main(argv: list[str] | None = None) -> int:
    """CLI 入口。

    Args:
        argv: 命令行参数（不含程序名）；``None`` 表示取 ``sys.argv[1:]``。

    Returns:
        退出码：``--verify`` 全部通过为 0，否则 1；``--write`` 成功为 0，写失败为 1。
    """
    # Windows 控制台默认可能是 GBK，输出中文与「·」前必须切到 UTF-8（stdout/stderr 一致）。
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(
        prog="python -m ciphervault_core.vectors",
        description="CipherVault 跨语言测试向量：校验（--verify）或生成（--write）",
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument(
        "--verify",
        metavar="PATH",
        help="校验向量文件能否由本库逐字节复现；全部通过打印「N 条向量全部通过」并返回 0",
    )
    group.add_argument(
        "--write",
        metavar="PATH",
        help="用内置 4 条固定输入重新生成向量文件（仅供本地回归，勿覆盖仓库基准文件）",
    )
    args = parser.parse_args(argv)

    if args.verify:
        return 0 if verify_file(args.verify) else 1
    return _write_file(args.write)


if __name__ == "__main__":
    raise SystemExit(main())
