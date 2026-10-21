"""离线解密入口 —— 读钥匙卡载荷，输入主密码，输出条目密码与趣味显示串。

用法::

    # 从 JSON 文件读载荷
    python -m ciphervault_core.cli keycard_payload.json

    # 从 stdin 读载荷（"-" 或直接省略参数）
    type keycard_payload.json | python -m ciphervault_core.cli -

载荷字段与 :mod:`.keycard` 完全一致::

    { "saltHex": "...", "ivHex": "...", "ctHex": "...", "tagHex": "...", "iters": 200000,
      "skin": { "name": "混合皮肤", "rules": ["letter", "poem", "number"] } }   # skin 可选

其中 ``skin`` 是可选的展示信息：给了就顺便算出「趣味显示串」，没给就只输出条目密码。
多余的键会被忽略，所以 ``vectors.json`` 里的单条向量也可以直接当载荷喂进来。

安全约定：

* 主密码只通过 :func:`getpass.getpass` 交互式读取，**不接受命令行参数**，
  避免落进 shell 历史或进程列表（铁律 R1）；
* 解密失败统一输出固定文案「主密码不正确」，不回显任何期望值；
* 退出码：0 成功、1 失败、2 参数错误。
"""

import argparse
import getpass
import json
import sys
from pathlib import Path
from typing import Any

from .keycard import kc_decrypt
from .skin import encode_token


def _read_stdin() -> str:
    """按 UTF-8 读取 stdin 的全部内容。

    ⚠️ Windows 上被重定向的 ``sys.stdin`` 默认用**本地代码页**（如 cp936）解码，
    会把载荷里的中文（皮肤名、诗句）解成代理字符，随后打印时抛 ``UnicodeEncodeError``。
    因此这里绕过文本层，直接读二进制再按 UTF-8 解码。

    Raises:
        ValueError: 输入不是合法的 UTF-8。
    """
    buffer = getattr(sys.stdin, "buffer", None)
    if buffer is None:
        return sys.stdin.read()
    try:
        # utf-8-sig 同时兼容「带 BOM」与「不带 BOM」的 UTF-8
        # （PowerShell 5 的 Out-File -Encoding utf8 会写 BOM）。
        return buffer.read().decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ValueError(f"stdin 不是合法的 UTF-8：{exc}") from exc


def _load_payload(source: str) -> dict[str, Any]:
    """从文件或 stdin 读取并解析载荷 JSON。

    Args:
        source: 文件路径，或 ``"-"`` 表示 stdin。

    Returns:
        载荷字典。

    Raises:
        ValueError: 读不到、不是合法 JSON，或顶层不是 JSON 对象。
    """
    if source == "-":
        raw = _read_stdin()
        where = "stdin"
    else:
        path = Path(source)
        try:
            raw = path.read_text(encoding="utf-8-sig")
        except OSError as exc:
            raise ValueError(f"无法读取载荷文件 {path}：{exc}") from exc
        where = str(path)

    if not raw.strip():
        raise ValueError(f"{where} 为空：请提供钥匙卡载荷 JSON")
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"{where} 不是合法 JSON：{exc}") from exc
    if not isinstance(payload, dict):
        raise ValueError(f"{where} 的顶层必须是 JSON 对象（单个钥匙卡载荷）")
    return payload


def _display_of(payload: dict[str, Any]) -> tuple[str, str] | None:
    """由载荷里的 ``ctHex`` + ``skin.rules`` 算出趣味显示串。

    Returns:
        ``(皮肤名, 显示串)``；载荷没有 ``skin.rules`` 时返回 ``None``。
    """
    skin = payload.get("skin")
    if not isinstance(skin, dict):
        return None
    rules = skin.get("rules")
    if not rules:
        return None
    return str(skin.get("name", "自定义皮肤")), encode_token(str(payload["ctHex"]), rules)


def main(argv: list[str] | None = None) -> int:
    """CLI 入口。

    Args:
        argv: 命令行参数（不含程序名）；``None`` 表示取 ``sys.argv[1:]``。

    Returns:
        退出码：0 成功，1 载荷或主密码错误。
    """
    # Windows 控制台默认可能是 GBK，输出中文与「·」前必须切到 UTF-8（stdout/stderr 一致）。
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(
        prog="python -m ciphervault_core.cli",
        description="CipherVault 离线钥匙卡解密：读入载荷 JSON，输入主密码，输出条目密码与趣味显示串",
        epilog="主密码只在本地交互式输入，不会写进命令行参数、日志或网络请求。",
    )
    parser.add_argument(
        "payload",
        nargs="?",
        default="-",
        metavar="PATH",
        help='钥匙卡载荷 JSON 文件路径；用 "-" 或省略则从 stdin 读取（默认：-）',
    )
    args = parser.parse_args(argv)

    try:
        payload = _load_payload(args.payload)
    except ValueError as exc:
        print(f"错误：{exc}", file=sys.stderr)
        return 1

    try:
        master_password = getpass.getpass("请输入主密码：")
    except (EOFError, KeyboardInterrupt):
        # 非交互环境（stdin 已被载荷占用）或用户 Ctrl-C：不打印任何密码相关内容。
        print("\n已取消：主密码必须交互式输入。", file=sys.stderr)
        return 1

    try:
        entry_password = kc_decrypt(master_password, payload)
    except ValueError as exc:
        # kc_decrypt 的文案本身就是固定串（「主密码不正确」等），不含敏感值，可直接透出。
        print(f"解密失败：{exc}", file=sys.stderr)
        return 1

    print(f"条目密码：{entry_password}")
    display = _display_of(payload)
    if display is None:
        print("趣味显示串：（载荷未包含 skin.rules，无法生成）")
    else:
        print(f"趣味显示串（{display[0]}）：{display[1]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
