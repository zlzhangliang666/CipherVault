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

  return `# -*- coding: utf-8 -*-
"""CipherVault Keycard · ${name}

脱离本项目独立运行，无需联网、无需外部依赖。
运行方式：python ciphervault_keycard_${name}.py
"""
import hashlib
import hmac
import json
import sys
import getpass

PAYLOAD = ${p}

POEMS = ${poems}
SEP = "\\u00b7"

def decode_display(display, rules):
    segs = display.split(SEP)
    h = ""
    for i, seg in enumerate(segs):
        r = rules[i % len(rules)]
        if r == "letter":
            v = ord(seg[0]) - 65
        elif r == "number":
            v = int(seg) - 10
        else:
            v = POEMS.index(seg)
        if v < 0 or v > 15:
            raise ValueError(f"第 {i+1} 段无法还原")
        h += format(v, "x")
    return h


def main():
    sys.stdout.reconfigure(encoding="utf-8")

    print("\\\\n=== CipherVault 钥匙卡 ===")
    print(f"条目：{PAYLOAD.get('entryName', '${name}')}")
    print(f"趣味显示：${displayStr}\\\\n")

    master = getpass.getpass("请输入主密码：")
    if not master:
        print("错误：主密码不能为空")
        sys.exit(1)

    salt = bytes.fromhex(PAYLOAD["saltHex"])
    iv = bytes.fromhex(PAYLOAD["ivHex"])
    ct = bytes.fromhex(PAYLOAD["ctHex"])
    iters = PAYLOAD["iters"]

    dk = hashlib.pbkdf2_hmac("sha256", master.encode("utf-8"), salt, iters, 64)
    enc, mac = dk[:32], dk[32:]

    # verify tag
    expected = hmac.new(mac, iv + ct, hashlib.sha256).digest()
    if not hmac.compare_digest(expected, bytes.fromhex(PAYLOAD["tagHex"])):
        print("错误：主密码不正确")
        sys.exit(1)

    # decrypt
    ks, ctr = b"", 0
    while len(ks) < len(ct):
        ks += hmac.new(enc, iv + ctr.to_bytes(4, "big"), hashlib.sha256).digest()
        ctr += 1
    pt = bytes(a ^ b for a, b in zip(ct, ks))
    entry_pw = pt.decode("utf-8")

    print("\\\\n解密成功！")
    print(f"原始密码：{entry_pw}")
    print(f"趣味显示：{PAYLOAD.get('display', '')}")


if __name__ == "__main__":
    main()
`;
}