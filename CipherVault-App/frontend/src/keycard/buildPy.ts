import type { KeycardPayload } from '../crypto/stream';

export function buildKeycardPy(
  payload: KeycardPayload,
  name: string,
  displayStr: string,
): string {
  const p = JSON.stringify(payload, null, 2);
  const poems = JSON.stringify([
    '床前明月光', '疑是地上霜', '举头望明月', '低头思故乡',
    '春眠不觉晓', '处处闻啼鸟', '夜来风雨声', '花落知多少',
    '白日依山尽', '黄河入海流', '欲穷千里目', '更上一层楼',
    '锄禾日当午', '汗滴禾下土', '谁知盘中餐', '粒粒皆辛苦',
  ]);
  const safeName = name.replace(/[`$\\{}]/g, '_');

  return `# -*- coding: utf-8 -*-
"""CipherVault Keycard · ${safeName}

脱离本项目独立运行，无需联网、无需第三方依赖（仅用 Python 标准库）。
运行方式：python ciphervault_keycard_${safeName}.py

也可以被其它程序引用：

    from ciphervault_keycard import kc_decrypt, PAYLOAD
    password = kc_decrypt("你的主密码", PAYLOAD)
"""
import hashlib
import hmac
import json
import sys
import getpass

PAYLOAD = ${p}

POEMS = ${poems}
SEP = "\\u00b7"
RULES = PAYLOAD.get("rules") or ["letter"]
CUSTOM = PAYLOAD.get("custom") or []


def decode_display(display, rules=None):
    rules = rules or RULES
    segs = display.split(SEP)
    h = ""
    for i, seg in enumerate(segs):
        r = rules[i % len(rules)]
        if r == "letter":
            v = ord(seg[0]) - 65
        elif r == "number":
            v = int(seg) - 10
        elif r == "custom":
            v = CUSTOM.index(seg) if seg in CUSTOM else -1
        else:
            v = POEMS.index(seg) if seg in POEMS else -1
        if v < 0 or v > 15:
            raise ValueError("第 %d 段无法还原" % (i + 1))
        h += format(v, "x")
    return h


def kc_decrypt(master_password, payload=None):
    """用主密码解出原始密码；主密码错误时抛 ValueError。"""
    data = payload if payload is not None else PAYLOAD
    salt = bytes.fromhex(data["saltHex"])
    iv = bytes.fromhex(data["ivHex"])
    ct = bytes.fromhex(data["ctHex"])
    iters = int(data["iters"])

    dk = hashlib.pbkdf2_hmac("sha256", master_password.encode("utf-8"), salt, iters, 64)
    enc, mac = dk[:32], dk[32:]

    expected = hmac.new(mac, iv + ct, hashlib.sha256).digest()
    if not hmac.compare_digest(expected, bytes.fromhex(data["tagHex"])):
        raise ValueError("主密码不正确")

    ks, ctr = b"", 0
    while len(ks) < len(ct):
        ks += hmac.new(enc, iv + ctr.to_bytes(4, "big"), hashlib.sha256).digest()
        ctr += 1
    return bytes(a ^ b for a, b in zip(ct, ks)).decode("utf-8")


# 便于其它脚本以 decrypt(...) 的别名调用
decrypt = kc_decrypt


def main():
    sys.stdout.reconfigure(encoding="utf-8")

    print("=== CipherVault 钥匙卡 ===")
    print("条目：" + str(PAYLOAD.get("entryName") or ${JSON.stringify(safeName)}))
    print("趣味显示：" + ${JSON.stringify(displayStr)})
    print("")

    master = getpass.getpass("请输入主密码：")
    if not master:
        print("错误：主密码不能为空")
        sys.exit(1)

    try:
        entry_pw = kc_decrypt(master)
    except ValueError as e:
        print("错误：" + str(e))
        sys.exit(1)

    print("解密成功！")
    print("原始密码：" + entry_pw)
    print("趣味显示：" + str(PAYLOAD.get("display", "")))


if __name__ == "__main__":
    main()
`;
}
