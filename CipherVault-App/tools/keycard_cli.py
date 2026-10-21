# -*- coding: utf-8 -*-
"""CipherVault 离线钥匙卡解密脚本（单文件、零第三方依赖）。

这是「发给用户手里的钥匙卡」的同类实现：不需要安装本仓库的任何东西，
只要有 Python 3.11+，就能把一张钥匙卡载荷还原成条目密码。

用法（在 ``CipherVault-App/`` 目录下执行）::

    python tools/keycard_cli.py --help                 # 打印用法，退出码 0
    python tools/keycard_cli.py --demo                 # 用内嵌的示例载荷试跑
    python tools/keycard_cli.py keycard_payload.json   # 从文件读载荷
    type keycard_payload.json | python tools/keycard_cli.py -   # 从 stdin 读载荷

载荷字段（``skin`` 可选，用于生成趣味显示串）::

    { "saltHex": "...", "ivHex": "...", "ctHex": "...", "tagHex": "...", "iters": 200000,
      "skin": { "name": "混合皮肤", "rules": ["letter", "poem", "number"] } }

算法严格对应 ``docs/ALGORITHM.md`` 第 3、4 节：

* ``dk = PBKDF2-HMAC-SHA256(UTF8(主密码), salt(16B), iters, 64)``，``ENC = dk[:32]``、``MAC = dk[32:]``
* ``ks = HMAC-SHA256(ENC, iv(16B) ‖ uint32be(counter))``，counter 从 0 开始逐块串接
* ``tag = HMAC-SHA256(MAC, iv ‖ ct)``，**先验 tag（恒定时间）再解密**

安全约定：主密码只通过 ``getpass`` 交互式读取，**不接受命令行参数**；
解密失败统一输出固定文案「主密码不正确」，不回显任何期望值或密钥材料。

⚠️ 本文件刻意**不** import ``ciphervault_core``——它必须能脱离本项目单独运行。
"""

import argparse
import getpass
import hashlib
import hmac
import json
import sys

# --------------------------------------------------------------------------
# 冻结常量（逐字取自 docs/ALGORITHM.md 第 4 节）
# --------------------------------------------------------------------------

#: 显示串分隔符：U+00B7 中间点，不是 ASCII 句点。
SEP = "\u00b7"

#: 16 句古诗，顺序即下标。
POEMS = (
    "床前明月光",
    "疑是地上霜",
    "举头望明月",
    "低头思故乡",
    "春眠不觉晓",
    "处处闻啼鸟",
    "夜来风雨声",
    "花落知多少",
    "白日依山尽",
    "黄河入海流",
    "欲穷千里目",
    "更上一层楼",
    "锄禾日当午",
    "汗滴禾下土",
    "谁知盘中餐",
    "粒粒皆辛苦",
)

#: 长度常量：钥匙卡 salt / iv 都是 16 字节（保险箱 iv 是 12 字节，不可混用）。
SALT_LEN = 16
IV_LEN = 16
DK_LEN = 64
TAG_LEN = 32

#: ``--demo`` 用的示例载荷，取自 ``packages/ciphervault-core/vectors.json`` 的
#: ``vec-01-mixed``（主密码 ``blue-Harbor-2026-quiet``）。载荷本身不含任何密码明文。
DEMO_PAYLOAD = {
    "name": "demo",
    "saltHex": "101112131415161718191a1b1c1d1e1f",
    "ivHex": "a0a1a2a3a4a5a6a7a8a9aaabacadaeaf",
    "ctHex": "16d7d477729b5ddc3bf5fecf11e036d6",
    "tagHex": "68a7ec9b1b7ee889a58c0315dc76a009b185783d9960dbff61a0330c2e41b8bd",
    "iters": 200000,
    "skin": {"name": "混合皮肤", "rules": ["letter", "poem", "number"]},
}


# --------------------------------------------------------------------------
# 算法原语（docs/ALGORITHM.md 第 3 节）
# --------------------------------------------------------------------------


def _derive(master_password, salt, iters):
    """PBKDF2-HMAC-SHA256 派生 64 字节，切成 ``(ENC, MAC)``。"""
    dk = hashlib.pbkdf2_hmac("sha256", master_password.encode("utf-8"), salt, iters, DK_LEN)
    return dk[:32], dk[32:]


def _keystream(enc_key, iv, length):
    """按需生成 ``length`` 字节的 HMAC-SHA256 密钥流。"""
    if length <= 0:
        return b""
    ks = bytearray()
    counter = 0
    while len(ks) < length:
        ks += hmac.new(enc_key, iv + counter.to_bytes(4, "big"), hashlib.sha256).digest()
        counter += 1
    return bytes(ks[:length])


def _compute_tag(mac_key, iv, ct):
    """``tag = HMAC-SHA256(MAC, iv ‖ ct)``；空 ``ct`` 同样必须计算。"""
    return hmac.new(mac_key, iv + ct, hashlib.sha256).digest()


def kc_decrypt(master_password, payload):
    """先验 tag、再解密，返回条目密码明文。

    Raises:
        ValueError: 载荷字段缺失/非法，或 tag 校验不通过（固定文案「主密码不正确」）。
    """
    for field in ("saltHex", "ivHex", "ctHex", "tagHex", "iters"):
        if field not in payload:
            raise ValueError(f"载荷缺少字段：{field}")

    salt = bytes.fromhex(str(payload["saltHex"]).lower())
    iv = bytes.fromhex(str(payload["ivHex"]).lower())
    ct = bytes.fromhex(str(payload["ctHex"]).lower())
    tag = bytes.fromhex(str(payload["tagHex"]).lower())
    iters = payload["iters"]

    if len(salt) != SALT_LEN:
        raise ValueError(f"saltHex 必须对应 {SALT_LEN} 字节，收到 {len(salt)} 字节")
    if len(iv) != IV_LEN:
        raise ValueError(f"ivHex 必须对应 {IV_LEN} 字节，收到 {len(iv)} 字节")
    if len(tag) != TAG_LEN:
        raise ValueError(f"tagHex 必须对应 {TAG_LEN} 字节，收到 {len(tag)} 字节")
    if isinstance(iters, bool) or not isinstance(iters, int) or iters < 1:
        raise ValueError("iters 必须是正整数")

    enc_key, mac_key = _derive(master_password, salt, iters)

    # 第 1 步：恒定时间校验 tag。禁止用 ==（会引入时间侧信道）。
    if not hmac.compare_digest(_compute_tag(mac_key, iv, ct), tag):
        raise ValueError("主密码不正确")

    # 第 2 步：tag 通过后才还原明文。
    ks = _keystream(enc_key, iv, len(ct))
    return bytes(a ^ b for a, b in zip(ct, ks)).decode("utf-8")


# --------------------------------------------------------------------------
# 趣味皮肤（docs/ALGORITHM.md 第 4 节）
# --------------------------------------------------------------------------


def _decode_seg(rule, seg):
    """把一个显示串片段反查回半字节；无法识别时返回 -1。"""
    if rule == "letter":
        return ord(seg[0]) - 65 if seg else -1
    if rule == "number":
        try:
            return int(seg) - 10
        except (TypeError, ValueError):
            return -1
    if rule == "poem":
        return POEMS.index(seg) if seg in POEMS else -1
    raise ValueError(f"未知皮肤规则：{rule}")


def decode_token(display, rules):
    """趣味显示串 → 密文 hex。越界段抛「第 (i+1) 段无法还原」。"""
    if not rules:
        raise ValueError("rules 不能为空")
    if display == "":
        return ""
    out = []
    for i, seg in enumerate(display.split(SEP)):
        v = _decode_seg(rules[i % len(rules)], seg)
        if v < 0 or v > 15:
            raise ValueError(f"第 {i + 1} 段无法还原")
        out.append(f"{v:x}")
    return "".join(out)


def _encode_nibble(rule, n):
    """把一个半字节编码成显示串。"""
    if rule == "letter":
        return chr(65 + n)
    if rule == "number":
        return str(n + 10)
    if rule == "poem":
        return POEMS[n]
    raise ValueError(f"未知皮肤规则：{rule}")


def encode_token(ct_hex, rules):
    """密文 hex → 趣味显示串，第 ``i`` 个半字节用 ``rules[i % len(rules)]``。"""
    if not rules:
        raise ValueError("rules 不能为空")
    parts = []
    for i, ch in enumerate(ct_hex.lower()):
        if ch not in "0123456789abcdef":
            raise ValueError("ctHex 含非法字符")
        parts.append(_encode_nibble(rules[i % len(rules)], int(ch, 16)))
    return SEP.join(parts)


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------


def _read_stdin():
    """按 UTF-8 读取 stdin。

    ⚠️ Windows 上被重定向的 ``sys.stdin`` 默认用本地代码页（如 cp936）解码，
    会把载荷里的中文（皮肤名、诗句）解坏，因此直接读二进制再按 UTF-8 解码。
    ``utf-8-sig`` 同时兼容带 BOM 与不带 BOM 的 UTF-8。
    """
    buffer = getattr(sys.stdin, "buffer", None)
    if buffer is None:
        return sys.stdin.read()
    try:
        return buffer.read().decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ValueError(f"stdin 不是合法的 UTF-8：{exc}") from exc


def _load_payload(source):
    """从文件路径、``"-"``（stdin）或 ``dict`` 取得载荷字典。"""
    if isinstance(source, dict):
        return source
    if source == "-":
        raw, where = _read_stdin(), "stdin"
    else:
        try:
            with open(source, encoding="utf-8-sig") as fp:
                raw = fp.read()
        except OSError as exc:
            raise ValueError(f"无法读取载荷文件 {source}：{exc}") from exc
        where = source
    if not raw.strip():
        raise ValueError(f"{where} 为空：请提供钥匙卡载荷 JSON")
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"{where} 不是合法 JSON：{exc}") from exc
    if not isinstance(payload, dict):
        raise ValueError(f"{where} 的顶层必须是 JSON 对象（单个钥匙卡载荷）")
    return payload


def _report(payload, entry_password):
    """输出条目密码与趣味显示串（两者都必须给出）。"""
    if payload.get("name"):
        print(f"钥匙卡：{payload['name']}")
    print(f"原始密码：{entry_password}")
    skin = payload.get("skin") or {}
    rules = skin.get("rules")
    if not rules:
        print("趣味显示串：（载荷未包含 skin.rules，无法生成）")
        return
    try:
        display = encode_token(str(payload["ctHex"]), rules)
    except ValueError as exc:
        print(f"趣味显示串：（生成失败：{exc}）")
        return
    print(f"趣味显示串（{skin.get('name', '自定义皮肤')}）：{display}")


def main(argv=None):
    """入口。返回退出码：0 成功、1 载荷或主密码错误、2 参数错误。"""
    # Windows 控制台默认可能是 GBK，输出中文与「·」前必须切到 UTF-8（stdout/stderr 一致）。
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(
        prog="keycard_cli.py",
        description="CipherVault 离线钥匙卡解密（单文件、零第三方依赖）",
        epilog="主密码只在本地交互式输入，不会写进命令行参数、日志或网络请求。",
    )
    parser.add_argument(
        "payload",
        nargs="?",
        default=None,
        metavar="PATH",
        help='钥匙卡载荷 JSON 文件路径；用 "-" 表示从 stdin 读取',
    )
    parser.add_argument(
        "--demo",
        action="store_true",
        help="使用内嵌的示例载荷（取自 vectors.json 的 vec-01-mixed，主密码见 tools/README.md）",
    )
    args = parser.parse_args(argv)

    if args.demo and args.payload:
        parser.error("--demo 与位置参数 PATH 不能同时使用")
    if not args.demo and not args.payload:
        parser.error('请提供载荷 JSON 文件路径，或用 "-" 从 stdin 读取，或用 --demo 试跑')

    try:
        payload = DEMO_PAYLOAD if args.demo else _load_payload(args.payload)
    except ValueError as exc:
        print(f"错误：{exc}", file=sys.stderr)
        return 1

    try:
        master_password = getpass.getpass("请输入主密码：")
    except (EOFError, KeyboardInterrupt):
        print("\n已取消：主密码必须交互式输入。", file=sys.stderr)
        return 1

    try:
        entry_password = kc_decrypt(master_password, payload)
    except ValueError as exc:
        print(f"解密失败：{exc}", file=sys.stderr)
        return 1

    _report(payload, entry_password)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
