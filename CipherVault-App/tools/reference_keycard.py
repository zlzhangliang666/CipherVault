# -*- coding: utf-8 -*-
"""生成示例钥匙卡 —— 同时产出 ``.py`` 与 ``.html`` 两个版本，用于人工验收。

对应 ``docs/ALGORITHM.md`` 第 5 节：

========  ==============================  ==========================================
产物       文件名                           运行方式
========  ==============================  ==========================================
HTML      ``keycard_<名称>.html``          双击用浏览器打开，输入主密码 → 显示条目密码
Python    ``ciphervault_keycard_<名称>.py`` ``python ciphervault_keycard_<名称>.py``
========  ==============================  ==========================================

两种产物**载荷相同**，只是渲染方式不同；两者都是单文件、零外部依赖、脱离本项目可运行。

用法（在 ``CipherVault-App/`` 目录下执行）::

    # 演示卡：固定使用 vectors.json 里 vec-01-mixed 的输入，
    # 产出 ciphervault_keycard_demo.py 与 keycard_demo.html
    python tools/reference_keycard.py --demo

    # 自定义卡：随机生成 salt/iv，交互式输入主密码与条目密码
    python tools/reference_keycard.py --name github --skin 混合皮肤

    # 指定输出目录
    python tools/reference_keycard.py --demo --out-dir build

``--demo`` 的 ``ctHex`` / ``tagHex`` 与 ``vec-01-mixed`` 一致，因此可以直接用
``packages/ciphervault-core/vectors.json`` 交叉核对。非 ``--demo`` 模式用 ``os.urandom``
生成新的 salt / iv（``iv`` 禁止复用，``docs/ALGORITHM.md`` 第 8 节第 4 条）。

⚠️ 本文件**只用标准库**，刻意不 import ``ciphervault_core``：生成的卡片必须能独立运行，
所以这里独立实现一遍算法，同时也从另一个方向验证了算法的可复现性。
"""

import argparse
import getpass
import hashlib
import hmac
import json
import os
import re
import sys
from pathlib import Path

# --------------------------------------------------------------------------
# 冻结常量（逐字取自 docs/ALGORITHM.md 第 3、4 节）
# --------------------------------------------------------------------------

SEP = "\u00b7"

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

#: 四种内置皮肤（docs/ALGORITHM.md 4.4）。
SKINS = {
    "字母皮肤": ["letter"],
    "古诗皮肤": ["poem"],
    "数字皮肤": ["number"],
    "混合皮肤": ["letter", "poem", "number"],
}

SALT_LEN = 16  # KDF salt 与钥匙卡 salt 都是 16 字节
IV_LEN = 16  # 钥匙卡 iv 是 16 字节（保险箱是 12 字节，不可混用）
DK_LEN = 64
ITERS_DEFAULT = 200000

#: ``--demo`` 固定使用 vec-01-mixed 的输入（任务书第 5.2 节）。
DEMO = {
    "name": "demo",
    "masterPassword": "blue-Harbor-2026-quiet",
    "entryPassword": "S3cr3t-Entry-01!",
    "saltHex": "101112131415161718191a1b1c1d1e1f",
    "ivHex": "a0a1a2a3a4a5a6a7a8a9aaabacadaeaf",
    "iters": 200000,
    "skin": "混合皮肤",
}

#: 卡片名称只允许这些字符，避免名称里混进路径分隔符把文件写到别处。
_NAME_RE = re.compile(r"^[0-9A-Za-z_\-\u4e00-\u9fff]{1,32}$")


# --------------------------------------------------------------------------
# 算法（docs/ALGORITHM.md 第 3 节）
# --------------------------------------------------------------------------


def kc_encrypt(master_password, entry_password, salt, iv, iters=ITERS_DEFAULT):
    """加密一条条目密码，返回载荷字典（全小写 hex）。"""
    dk = hashlib.pbkdf2_hmac("sha256", master_password.encode("utf-8"), salt, iters, DK_LEN)
    enc_key, mac_key = dk[:32], dk[32:]

    pt = entry_password.encode("utf-8")
    ks, counter = b"", 0
    while len(ks) < len(pt):
        ks += hmac.new(enc_key, iv + counter.to_bytes(4, "big"), hashlib.sha256).digest()
        counter += 1
    ct = bytes(a ^ b for a, b in zip(pt, ks))
    tag = hmac.new(mac_key, iv + ct, hashlib.sha256).digest()

    return {
        "saltHex": salt.hex(),
        "ivHex": iv.hex(),
        "ctHex": ct.hex(),
        "tagHex": tag.hex(),
        "iters": iters,
    }


def encode_token(ct_hex, rules):
    """密文 hex → 趣味显示串（第 ``i`` 个半字节用 ``rules[i % len(rules)]``）。"""
    parts = []
    for i, ch in enumerate(ct_hex.lower()):
        n = int(ch, 16)
        rule = rules[i % len(rules)]
        if rule == "letter":
            parts.append(chr(65 + n))
        elif rule == "number":
            parts.append(str(n + 10))
        else:
            parts.append(POEMS[n])
    return SEP.join(parts)


def build_payload(name, master_password, entry_password, skin_name, salt, iv, iters):
    """算出载荷并附加展示用的 ``name`` / ``skin`` 字段。"""
    payload = kc_encrypt(master_password, entry_password, salt, iv, iters)
    payload["name"] = name
    payload["skin"] = {"name": skin_name, "rules": SKINS[skin_name]}
    # 把字段排成「标识 → 载荷 → 皮肤」的可读顺序。
    ordered = {
        "name": payload["name"],
        "saltHex": payload["saltHex"],
        "ivHex": payload["ivHex"],
        "ctHex": payload["ctHex"],
        "tagHex": payload["tagHex"],
        "iters": payload["iters"],
        "skin": payload["skin"],
    }
    return ordered


# --------------------------------------------------------------------------
# Python 卡片模板
# --------------------------------------------------------------------------

PY_TEMPLATE = r'''# -*- coding: utf-8 -*-
"""CipherVault 离线钥匙卡：@@NAME@@

由 ``CipherVault-App/tools/reference_keycard.py`` 生成。

运行方式（脱离本项目即可，只需 Python 3.11+，**零第三方依赖**）::

    python ciphervault_keycard_@@NAME@@.py

按提示输入主密码，即可还原出条目密码；同时给出「趣味皮肤显示串」。
载荷以 JSON 字面量内嵌在本文件里，无需外部文件、无需联网。

算法严格对应 ``docs/ALGORITHM.md`` 第 3、4 节：
``dk = PBKDF2-HMAC-SHA256(UTF8(主密码), salt, iters, 64)``，``ENC = dk[:32]``、``MAC = dk[32:]``；
``ks = HMAC-SHA256(ENC, iv ‖ uint32be(counter))``（counter 从 0 开始）；``ct = pt XOR ks``；
``tag = HMAC-SHA256(MAC, iv ‖ ct)``，解密时**先恒定时间验 tag，再解密**。

⚠️ 这张卡片只包含**密文**。没有主密码就无法还原；请像保管密码一样保管主密码。
"""

import getpass
import hashlib
import hmac
import json
import sys

#: 内嵌载荷（JSON 字面量）。@@SKIN_NAME@@，@@ITERS@@ 次 PBKDF2 迭代。
PAYLOAD = json.loads(r"""
@@PAYLOAD_JSON@@
""")

#: 显示串分隔符：U+00B7 中间点。
SEP = "\u00b7"

#: 16 句古诗，顺序即下标（docs/ALGORITHM.md 4.1）。
POEMS = @@POEMS_PY@@

IV_LEN = 16
TAG_LEN = 32


def derive(master_password, salt, iters):
    """PBKDF2-HMAC-SHA256 派生 64 字节，切成 ``(ENC, MAC)``。"""
    dk = hashlib.pbkdf2_hmac("sha256", master_password.encode("utf-8"), salt, iters, 64)
    return dk[:32], dk[32:]


def keystream(enc_key, iv, length):
    """按需生成 ``length`` 字节的 HMAC-SHA256 密钥流。"""
    if length <= 0:
        return b""
    ks, counter = bytearray(), 0
    while len(ks) < length:
        ks += hmac.new(enc_key, iv + counter.to_bytes(4, "big"), hashlib.sha256).digest()
        counter += 1
    return bytes(ks[:length])


def decrypt(master_password, payload):
    """**先验 tag、再解密**，返回条目密码明文。

    校验失败统一抛 ``ValueError("主密码不正确")``——固定文案，不泄露任何中间值。
    """
    salt = bytes.fromhex(payload["saltHex"])
    iv = bytes.fromhex(payload["ivHex"])
    ct = bytes.fromhex(payload["ctHex"])
    tag = bytes.fromhex(payload["tagHex"])
    iters = payload["iters"]

    if len(iv) != IV_LEN:
        raise ValueError("载荷损坏：ivHex 必须对应 16 字节")
    if len(tag) != TAG_LEN:
        raise ValueError("载荷损坏：tagHex 必须对应 32 字节")

    enc_key, mac_key = derive(master_password, salt, iters)

    expected = hmac.new(mac_key, iv + ct, hashlib.sha256).digest()
    if not hmac.compare_digest(expected, tag):  # 恒定时间比较，禁止用 ==
        raise ValueError("主密码不正确")

    ks = keystream(enc_key, iv, len(ct))
    return bytes(a ^ b for a, b in zip(ct, ks)).decode("utf-8")


def display_of(payload):
    """由 ``ctHex`` + ``skin.rules`` 算出趣味皮肤显示串。"""
    rules = payload["skin"]["rules"]
    parts = []
    for i, ch in enumerate(payload["ctHex"].lower()):
        n = int(ch, 16)
        rule = rules[i % len(rules)]
        if rule == "letter":
            parts.append(chr(65 + n))
        elif rule == "number":
            parts.append(str(n + 10))
        else:
            parts.append(POEMS[n])
    return SEP.join(parts)


def main():
    """交互式还原条目密码。返回退出码：0 成功、1 失败。"""
    # Windows 控制台必需：否则中文与「·」会是乱码。stdout / stderr 保持一致的 UTF-8。
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

    print("=" * 56)
    print("  CipherVault 离线钥匙卡：" + PAYLOAD.get("name", "未命名"))
    print("  皮肤：" + PAYLOAD["skin"]["name"])
    print("=" * 56)

    try:
        master_password = getpass.getpass("请输入主密码：")
    except (EOFError, KeyboardInterrupt):
        print("\n已取消。", file=sys.stderr)
        return 1

    try:
        entry_password = decrypt(master_password, PAYLOAD)
    except ValueError as exc:
        print("解密失败：" + str(exc), file=sys.stderr)
        return 1

    print()
    print("原始密码：" + entry_password)
    print("趣味皮肤显示串：" + display_of(PAYLOAD))
    print()
    print("提示：复制后请及时清空剪贴板。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
'''


# --------------------------------------------------------------------------
# HTML 卡片模板
# --------------------------------------------------------------------------

HTML_TEMPLATE = r'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CipherVault 钥匙卡 · @@NAME@@</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    padding: 24px; background: #0f172a; color: #e2e8f0;
    font-family: system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
  }
  .card {
    width: 100%; max-width: 560px; background: #1e293b; border: 1px solid #334155;
    border-radius: 16px; padding: 28px; box-shadow: 0 20px 45px rgba(0,0,0,.45);
  }
  h1 { margin: 0 0 4px; font-size: 20px; }
  .sub { margin: 0 0 20px; font-size: 13px; color: #94a3b8; }
  label { display: block; font-size: 13px; margin-bottom: 6px; color: #cbd5e1; }
  input[type=password], input[type=text] {
    width: 100%; padding: 11px 12px; border-radius: 10px; border: 1px solid #475569;
    background: #0f172a; color: #f1f5f9; font-size: 15px;
  }
  input:focus { outline: 2px solid #38bdf8; border-color: transparent; }
  button {
    margin-top: 14px; width: 100%; padding: 12px; border: 0; border-radius: 10px;
    background: #0ea5e9; color: #04263a; font-size: 15px; font-weight: 700; cursor: pointer;
  }
  button:hover { background: #38bdf8; }
  button:disabled { background: #475569; color: #94a3b8; cursor: not-allowed; }
  .out { margin-top: 20px; display: none; }
  .out.show { display: block; }
  .row { background: #0f172a; border: 1px solid #334155; border-radius: 10px; padding: 12px; margin-top: 10px; }
  .row .k { font-size: 12px; color: #94a3b8; margin-bottom: 6px; }
  .row .v { font-size: 17px; font-family: ui-monospace, Consolas, "Courier New", monospace; word-break: break-all; }
  .row .v.poem { font-family: inherit; letter-spacing: .5px; color: #fbbf24; }
  .err { margin-top: 16px; padding: 12px; border-radius: 10px; background: #450a0a;
         border: 1px solid #7f1d1d; color: #fecaca; font-size: 14px; display: none; }
  .err.show { display: block; }
  .warn { margin-bottom: 18px; padding: 12px; border-radius: 10px; background: #422006;
          border: 1px solid #854d0e; color: #fde68a; font-size: 13px; display: none; }
  .warn.show { display: block; }
  .meta { margin-top: 18px; font-size: 11px; color: #64748b; word-break: break-all; line-height: 1.7; }
</style>
</head>
<body>
<div class="card">
  <h1>🔐 CipherVault 离线钥匙卡</h1>
  <p class="sub">名称：@@NAME@@ ｜ 皮肤：@@SKIN_NAME@@ ｜ PBKDF2-HMAC-SHA256 @@ITERS@@ 次</p>

  <div class="warn" id="warn"></div>

  <label for="pw">主密码</label>
  <input type="password" id="pw" autocomplete="off" spellcheck="false" placeholder="输入主密码后点击解密">
  <button id="go">解密</button>

  <div class="err" id="err"></div>

  <div class="out" id="out">
    <div class="row"><div class="k">原始密码</div><div class="v" id="pw-out"></div></div>
    <div class="row"><div class="k">趣味皮肤显示串</div><div class="v poem" id="display-out"></div></div>
  </div>

  <div class="meta">
    本页面是单文件、零外部依赖的离线钥匙卡：所有计算都在你的浏览器里完成，不会联网。
    载荷只含密文，没有主密码就无法还原。<br>
    salt: @@SALT_HEX@@<br>iv: @@IV_HEX@@<br>tag: @@TAG_HEX@@
  </div>
</div>

<!-- 载荷以 JSON 字面量内嵌（type=application/json 不会被当作脚本执行） -->
<script type="application/json" id="payload">
@@PAYLOAD_JSON@@
</script>

<script>
"use strict";

// 冻结常量（docs/ALGORITHM.md 4.1）：SEP 是 U+00B7，POEMS 恰好 16 句。
const SEP = "\u00b7";
const POEMS = @@POEMS_JSON@@;
const PAYLOAD = JSON.parse(document.getElementById("payload").textContent);

const $ = (id) => document.getElementById(id);

function toHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
function fromHex(hex) {
  const s = hex.toLowerCase();
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function concat(a, b) {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}
// uint32be(counter)：4 字节大端无符号整数
function uint32be(n) {
  return new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
}
// 恒定时间比较：逐字节异或累加后判 0（禁止用 === 比较 tag）
function ctEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// 必须用 deriveBits 而不是 deriveKey —— deriveKey 无法导出原始字节，算不出 authHash。
async function deriveBits(pw, salt, iters, len) {
  const base = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: iters, hash: "SHA-256" }, base, len * 8);
  return new Uint8Array(bits);
}
async function hmacSha256(keyBytes, msg) {
  const key = await crypto.subtle.importKey(
    "raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, msg));
}
async function keystream(enc, iv, length) {
  const out = new Uint8Array(length);
  let offset = 0;
  let counter = 0;
  while (offset < length) {
    const block = await hmacSha256(enc, concat(iv, uint32be(counter)));
    const take = Math.min(block.length, length - offset);
    out.set(block.subarray(0, take), offset);
    offset += take;
    counter += 1;
  }
  return out;
}

async function decrypt(masterPassword, payload) {
  const salt = fromHex(payload.saltHex);
  const iv = fromHex(payload.ivHex);
  const ct = fromHex(payload.ctHex);
  const tag = fromHex(payload.tagHex);

  const dk = await deriveBits(masterPassword, salt, payload.iters, 64);
  const enc = dk.slice(0, 32);   // ENC = dk[0:32]
  const mac = dk.slice(32, 64);  // MAC = dk[32:64]

  // 第 1 步：先验 tag（顺序不能反）
  const expected = await hmacSha256(mac, concat(iv, ct));
  if (!ctEqual(expected, tag)) throw new Error("主密码不正确");

  // 第 2 步：再还原明文
  const ks = await keystream(enc, iv, ct.length);
  const pt = new Uint8Array(ct.length);
  for (let i = 0; i < ct.length; i++) pt[i] = ct[i] ^ ks[i];
  return new TextDecoder("utf-8", { fatal: true }).decode(pt);
}

function encodeToken(ctHex, rules) {
  const hex = ctHex.toLowerCase();
  const parts = [];
  for (let i = 0; i < hex.length; i++) {
    const n = parseInt(hex[i], 16);
    const rule = rules[i % rules.length];
    if (rule === "letter") parts.push(String.fromCharCode(65 + n));
    else if (rule === "number") parts.push(String(n + 10));
    else parts.push(POEMS[n]);
  }
  return parts.join(SEP);
}

function fail(message) {
  $("out").classList.remove("show");
  const err = $("err");
  err.textContent = message;
  err.classList.add("show");
}

async function run() {
  const pw = $("pw").value;
  if (!pw) { fail("请先输入主密码。"); return; }
  $("go").disabled = true;
  try {
    const entry = await decrypt(pw, PAYLOAD);
    $("err").classList.remove("show");
    $("pw-out").textContent = entry;
    $("display-out").textContent = encodeToken(PAYLOAD.ctHex, PAYLOAD.skin.rules);
    $("out").classList.add("show");
  } catch (e) {
    fail(e && e.message ? e.message : "解密失败");
  } finally {
    $("go").disabled = false;
    $("pw").value = "";
    $("pw").focus();
  }
}

// WebCrypto 只在安全上下文可用；不可用时给出明确提示而不是静默失败。
if (!(window.crypto && window.crypto.subtle)) {
  const warn = $("warn");
  warn.textContent = "当前浏览器环境不可用（window.crypto.subtle 缺失）。"
    + "请改用现代版 Chrome / Edge / Firefox 打开本文件，或通过 http(s):// 访问；"
    + "也可以改用同名的 .py 钥匙卡在命令行解密。";
  warn.classList.add("show");
  $("go").disabled = true;
  $("pw").disabled = true;
} else {
  $("go").addEventListener("click", run);
  $("pw").addEventListener("keydown", (e) => { if (e.key === "Enter") run(); });
  $("pw").focus();
}
</script>
</body>
</html>
'''


# --------------------------------------------------------------------------
# 生成逻辑
# --------------------------------------------------------------------------


def _validate_name(name):
    """校验卡片名称，防止路径穿越。"""
    if not _NAME_RE.match(name):
        raise ValueError(
            f"名称 {name!r} 不合法：只允许中英文、数字、下划线与连字符，长度 1-32"
        )
    return name


def _payload_json(payload):
    """把载荷序列化成适合内嵌进源码/HTML 的 JSON 文本。

    ``<`` 被转义成 ``\\u003c``，杜绝 ``</script>`` 提前闭合 HTML 里的 script 块。
    """
    return json.dumps(payload, ensure_ascii=False, indent=2).replace("<", "\\u003c")


def render_py(payload):
    """渲染 Python 卡片源码（文件名由调用方决定）。"""
    poems_py = "(\n" + "".join(f'    "{line}",\n' for line in POEMS) + ")"
    body = (
        PY_TEMPLATE.replace("@@NAME@@", payload["name"])
        .replace("@@SKIN_NAME@@", payload["skin"]["name"])
        .replace("@@ITERS@@", str(payload["iters"]))
        .replace("@@POEMS_PY@@", poems_py)
        .replace("@@PAYLOAD_JSON@@", _payload_json(payload))
    )
    # 统一 LF；Python 源码在任何平台都能正确解析。
    return body.replace("\r\n", "\n")


def render_html(payload):
    """渲染 HTML 卡片源码。"""
    poems_json = json.dumps(list(POEMS), ensure_ascii=False, indent=2)
    body = (
        HTML_TEMPLATE.replace("@@NAME@@", payload["name"])
        .replace("@@SKIN_NAME@@", payload["skin"]["name"])
        .replace("@@ITERS@@", str(payload["iters"]))
        .replace("@@SALT_HEX@@", payload["saltHex"])
        .replace("@@IV_HEX@@", payload["ivHex"])
        .replace("@@TAG_HEX@@", payload["tagHex"])
        .replace("@@POEMS_JSON@@", poems_json)
        .replace("@@PAYLOAD_JSON@@", _payload_json(payload))
    )
    return body.replace("\r\n", "\n")


def generate(name, master_password, entry_password, skin_name, salt, iv, iters, out_dir):
    """生成两种产物，返回 ``(py_path, html_path, payload)``。

    文件名严格遵循 ``docs/ALGORITHM.md`` 第 5 节：
    ``ciphervault_keycard_<名称>.py`` 与 ``keycard_<名称>.html``。
    """
    _validate_name(name)
    if skin_name not in SKINS:
        raise ValueError(f"未知皮肤 {skin_name!r}，可选：{'、'.join(SKINS)}")

    payload = build_payload(name, master_password, entry_password, skin_name, salt, iv, iters)
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)

    py_path = out / f"ciphervault_keycard_{name}.py"
    html_path = out / f"keycard_{name}.html"
    # newline="\n" 强制 LF，避免 Windows 上写出 CRLF 导致跨平台产物不一致。
    py_path.write_text(render_py(payload), encoding="utf-8", newline="\n")
    html_path.write_text(render_html(payload), encoding="utf-8", newline="\n")
    return py_path, html_path, payload


def _prompt_custom(args):
    """交互式收集自定义卡片的输入，返回 ``(name, master, entry, skin, salt, iv, iters)``。"""
    name = args.name or input("卡片名称（中英文/数字/_-，默认 my）：").strip() or "my"

    skin = args.skin
    if skin is None:
        names = list(SKINS)
        print("可选皮肤：" + "、".join(f"{i + 1}.{n}" for i, n in enumerate(names)))
        choice = input(f"选择皮肤 [1-{len(names)}，默认 {len(names)}]：").strip()
        skin = names[int(choice) - 1] if choice else names[-1]

    master = getpass.getpass("主密码：")
    if not master:
        raise ValueError("主密码不能为空")
    entry = getpass.getpass("条目密码：")
    confirm = getpass.getpass("再输入一次条目密码：")
    if entry != confirm:
        raise ValueError("两次输入的条目密码不一致，已取消（避免把打错的密码写进卡片）")

    # 非 --demo 模式一律用密码学随机源生成新的 salt / iv，禁止复用。
    return name, master, entry, skin, os.urandom(SALT_LEN), os.urandom(IV_LEN), args.iters


def main(argv=None):
    """入口。返回退出码：0 成功、1 失败、2 参数错误。"""
    # Windows 控制台默认可能是 GBK，输出中文与「·」前必须切到 UTF-8（stdout/stderr 一致）。
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(
        prog="reference_keycard.py",
        description="生成 CipherVault 示例钥匙卡（同时产出 .py 与 .html 两种版本）",
        epilog="示例：python tools/reference_keycard.py --demo",
    )
    parser.add_argument(
        "--demo",
        action="store_true",
        help=f"使用固定输入（{DEMO['name']}：{DEMO['skin']}），salt/iv 取自 vectors.json 的 "
        "vec-01-mixed，便于与基准向量交叉核对",
    )
    parser.add_argument("--name", help="卡片名称，决定输出文件名（默认 my；--demo 时为 demo）")
    parser.add_argument("--skin", choices=sorted(SKINS), help="趣味皮肤（默认 混合皮肤）")
    parser.add_argument(
        "--iters", type=int, default=ITERS_DEFAULT, help=f"PBKDF2 迭代次数（默认 {ITERS_DEFAULT}）"
    )
    parser.add_argument("--out-dir", default=".", help="输出目录（默认当前目录）")
    args = parser.parse_args(argv)

    if args.iters < 1:
        parser.error("--iters 必须是正整数")

    try:
        if args.demo:
            # --demo 固定使用 vec-01-mixed 的输入，产物可与 vectors.json 交叉核对。
            name = args.name or DEMO["name"]
            skin = args.skin or DEMO["skin"]
            master = DEMO["masterPassword"]
            entry = DEMO["entryPassword"]
            salt = bytes.fromhex(DEMO["saltHex"])
            iv = bytes.fromhex(DEMO["ivHex"])
            iters = args.iters
        else:
            name, master, entry, skin, salt, iv, iters = _prompt_custom(args)

        py_path, html_path, payload = generate(
            name, master, entry, skin, salt, iv, iters, args.out_dir
        )
    except (ValueError, EOFError, KeyboardInterrupt) as exc:
        print(f"生成失败：{exc}", file=sys.stderr)
        return 1

    print("已生成两种钥匙卡（载荷相同，仅渲染方式不同）：")
    print(f"  Python : {py_path}")
    print(f"  HTML   : {html_path}")
    print()
    print(f"皮肤     : {payload['skin']['name']}（rules = {payload['skin']['rules']}）")
    print(f"迭代次数 : {payload['iters']}")
    print(f"ctHex    : {payload['ctHex']}")
    print(f"tagHex   : {payload['tagHex']}")
    print(f"显示串   : {encode_token(payload['ctHex'], payload['skin']['rules'])}")
    print()
    print(f"人工验收：python {py_path.name}    （在 {py_path.parent} 下执行，输入主密码）")
    print(f"          双击 {html_path.name} 用浏览器打开")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
