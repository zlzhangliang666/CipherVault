# 加密算法规格（冻结）

> **状态：v2.0 已冻结（单机版）。** 前端（TS/WebCrypto）与核心库（Python stdlib）必须逐字实现本文件。
> 验收基准：`packages/ciphervault-core/vectors.json`（跨语言测试向量）。
> v1.0 的「服务端零知识同步」相关描述已随 `backend/` 归档到分支 `archive/cloud-sync`。

**统一编码：所有二进制一律用十六进制小写字符串（hex），全项目统一。**

---

## 1. 密钥派生

```
dk = PBKDF2-HMAC-SHA256( password = UTF8(主密码), salt = kdfSalt(16B), iterations = kdfIters, dkLen = 64 )

vaultKey = dk[0:32]        // AES-GCM-256 密钥，仅存于渲染进程内存，绝不落盘
authHash = hex(dk[32:64])  // 单机版运行时不再使用，仅为跨语言向量兼容保留
```

- `kdfSalt`：创建保险箱时客户端生成，`crypto.getRandomValues(new Uint8Array(16))` / `os.urandom(16)`
- `kdfIters`：默认 **200000**，创建后不可变更（改主密码流程本版不做）
- 一次 PBKDF2 同时得到两段输出，二者互不干扰
- `kdfSalt` / `kdfIters` 与密文一起写入 `vault.cvault`（见 `docs/CONTRACTS.md`）；`vaultKey` 不落盘

> 单机版没有服务器，`authHash` 不参与任何校验；它仍然保留在规格与测试向量中，用来验证「同一份 PBKDF2 输出在不同语言下逐字节一致」。

---

## 2. 保险箱（整库）加解密

```
pt = UTF8(JSON.stringify(VaultDoc))          // 明文只在内存
iv = 12B 随机                                  // crypto.getRandomValues / os.urandom
ct = AES-GCM-256(key = vaultKey, iv, pt)      // WebCrypto 输出 = 密文 ‖ 16B 认证标签
落盘 = { format:"ciphervault/vault", formatVersion:1,
         kdf:{salt:hex(kdfSalt), iters:kdfIters}, iv:hex(iv), ct:hex(ct) }
```

- **只有渲染进程解密保险箱**；Electron 主进程与核心库都不解密。
- `iv` 每次写入都必须重新随机生成，禁止复用。
- 解密失败（标签不匹配，通常是主密码错误）→ 前端提示「主密码不正确或数据已损坏」。
- 落盘文件字段与校验规则以 `docs/CONTRACTS.md` 为准。

---

## 3. 钥匙卡载荷（跨语言必须逐位一致）

> 这是本项目唯一需要「浏览器 ↔ Python」双向兼容的算法，**必须严格实现**。
> 只使用 `hashlib` / `hmac` + WebCrypto 的 PBKDF2 / HMAC，**不依赖任何第三方加密库**。

### 3.1 加密

```
salt   = 16B 随机（测试向量中用固定值）
iv     = 16B 随机（测试向量中用固定值）
dk     = PBKDF2-HMAC-SHA256( UTF8(主密码), salt, kdfIters, dkLen = 64 )
ENC    = dk[0:32]                     // 密钥流密钥
MAC    = dk[32:64]                    // 完整性密钥
pt     = UTF8(条目密码)                // 注意：加密的是「条目密码」，密钥来自「主密码」

ks     = HMAC-SHA256(ENC, iv ‖ uint32be(counter))   // counter = 0,1,2,… 依次取，串接成密钥流
ct[i]  = pt[i] XOR ks[i]

tag    = HMAC-SHA256(MAC, iv ‖ ct)

载荷    = { saltHex, ivHex, ctHex, tagHex, iters }
```

- `iv` **16 字节**（不是保险箱用的 12 字节，勿混用）
- `uint32be(counter)`：4 字节大端无符号整数；密钥流按需生成，够长即可
- 空明文 ⇒ `ct` 为空串，`tag` 仍必须计算

### 3.2 解密

```
1. 先校验：tagExpected = HMAC-SHA256(MAC, iv ‖ ct)，与 tag 做**恒定时间**比较
   （Python: hmac.compare_digest；JS: 逐字节异或累加后判 0）
   不匹配 → 抛出「主密码不正确」
2. 再还原：pt[i] = ct[i] XOR ks[i]，UTF8 解码
```

> **顺序不能反**：必须先验 tag 再解密，避免对伪造数据做无用计算与信息泄露。

---

## 4. 趣味皮肤（编码密文，不影响安全性）

**作用对象**：密文的 hex 字符串（即 `ctHex`）。逐字符替换，得到「好看的显示串」。

> **硬性约束：`display` 必须且只能由 `ctHex` 编码得到。**
> 严禁把条目明文（或其 hex）交给 `encodeToken`，否则趣味显示会直接泄露密码。
> 条目保存时生成 `EntryKeycard { saltHex, ivHex, ctHex, tagHex, iters, display }`；
> 换皮肤只重算 `display`，`ctHex` / `tagHex` 不变。

### 4.1 常量（必须逐字照抄）

```
SEP = "·"                // U+00B7 中间点

POEMS = [
  "床前明月光", "疑是地上霜", "举头望明月", "低头思故乡",
  "春眠不觉晓", "处处闻啼鸟", "夜来风雨声", "花落知多少",
  "白日依山尽", "黄河入海流", "欲穷千里目", "更上一层楼",
  "锄禾日当午", "汗滴禾下土", "谁知盘中餐", "粒粒皆辛苦"
]                        // 恰好 16 句，互不相同
```

### 4.2 映射表（每个都必须是从 `0..15` 到显示串的双射）

| 名称 | hex 半字节 `n` | 显示串 |
|---|---|---|
| `letter` | n | `String.fromCharCode(65 + n)` / `chr(65 + n)` → `A`…`P` |
| `number` | n | `str(n + 10)` → `"10"`…`"25"` |
| `poem` | n | `POEMS[n]` |

反查规则：`letter` 取首字符减 65（须落在 0..15）；`number` 取整后减 10（须落在 0..15）；`poem` 查表取下标。任何越界 → 该段「无法还原」，解密失败。

### 4.3 编码 / 解码

```
encodeToken(ctHex, rules):
    for i in 0 .. len(ctHex)-1:
        n = int(ctHex[i], 16)
        out.push( 映射[ rules[i % len(rules)] ].encode(n) )
    return join(out, SEP)

decodeToken(display, rules):
    segs = split(display, SEP)
    hex  = ""
    for i in 0 .. len(segs)-1:
        v = 映射[ rules[i % len(rules)] ].decode(segs[i])
        if v < 0 或 > 15: 抛出「第 (i+1) 段无法还原」
        hex += hexdigit(v)
    return hex
```

### 4.4 内置皮肤

| 皮肤名 | rules |
|---|---|
| 字母皮肤 | `["letter"]` |
| 古诗皮肤 | `["poem"]` |
| 数字皮肤 | `["number"]` |
| 混合皮肤 | `["letter", "poem", "number"]` |

- 皮肤仅改变**显示形式**，安全性完全由第 1、2、3 节的真实加密保证。
- 皮肤是「外衣」，可随时更换；换皮肤只改 `display`，不动 `ctHex`。

---

## 5. 钥匙卡产物（两种，载荷相同）

| 产物 | 文件名 | 运行方式 |
|---|---|---|
| HTML | `keycard_<名称>.html` | 双击用浏览器打开，输入主密码 → 显示条目密码（WebCrypto 实现） |
| Python | `ciphervault_keycard_<名称>.py` | `python ciphervault_keycard_<名称>.py`，按提示输入主密码 |

**Python 钥匙卡硬性要求**

- **只允许** `hashlib`、`hmac`、`json`、`sys`、`getpass` 等标准库；**不得** import `cryptography` / `pycryptodome`
- 文件首行 `# -*- coding: utf-8 -*-`，并在 `main()` 内 `sys.stdout.reconfigure(encoding="utf-8")`（Windows 控制台必需）
- 载荷以 JSON 字面量内嵌在文件里，**无需外部依赖、无需联网、脱离本项目可运行**
- 必须提供可导入函数 `kc_decrypt(master_password, payload=None) -> str`（别名 `decrypt`），主密码错误时抛 `ValueError`，便于其它脚本调用
- 输出必须同时给出「原始密码」与「趣味皮肤显示串」

**HTML 钥匙卡硬性要求**

- 单文件、零外部依赖；必须能检测 `window.crypto?.subtle` 不可用时给出明确提示（`file://` 下现代浏览器可用）

---

## 6. 测试向量（`packages/ciphervault-core/vectors.json`）

固定 `salt` / `iv` 以得到**确定性**输出。格式：

```json
[
  {
    "name": "vec-01-mixed",
    "note": "混合皮肤、200000 次迭代",
    "masterPassword": "blue-Harbor-2026-quiet",
    "entryPassword": "S3cr3t-Entry-01!",
    "saltHex": "<32 hex>",
    "ivHex": "<32 hex>",
    "iters": 200000,
    "authHashHex": "<64 hex = dk[32:64]>",
    "vaultKeyHex": "<64 hex = dk[0:32]>",
    "ctHex": "<hex>",
    "tagHex": "<64 hex>",
    "display": "<由 ctHex + skin 生成的显示串>",
    "skin": { "name": "混合皮肤", "rules": ["letter", "poem", "number"], "poems": [ "…16 句…" ], "sep": "·" }
  }
]
```

**验收要求（A 与 C 都必须通过）**

1. 用 `masterPassword` 解 `ctHex`+`tagHex` → 必须得到 `entryPassword`
2. 用错误主密码解 → 必须被 tag 校验拒绝（抛错，而不是返回乱码）
3. 用 `saltHex`/`ivHex`/`entryPassword` 重新加密 → `ctHex`、`tagHex` **逐字节相同**
4. `encodeToken(ctHex, skin.rules)` → 必须等于 `display`；`decodeToken(display, …)` → 必须还原 `ctHex`
5. 用 `masterPassword` + `saltHex` + `iters` 派生 → `authHashHex`（`dk[32:64]`）与 `vaultKeyHex`（`dk[0:32]`）**逐字节相同**

> 仓库中已提交 4 条基准向量（`vec-01-mixed`、`vec-02-poem`、`vec-03-letter`、`vec-04-number`），
> 分别是混合 / 古诗 / 字母 / 数字皮肤，`saltHex` 与 `ivHex` 均为固定值以保证结果确定。

---

## 7. 参考实现要点

**Python（stdlib）**

```python
import hashlib, hmac
def derive(pw: str, salt: bytes, iters: int, dklen: int = 64) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", pw.encode("utf-8"), salt, iters, dklen)

def kc_encrypt(master_pw, entry_pw, salt, iv, iters):
    dk = derive(master_pw, salt, iters)
    enc, mac = dk[:32], dk[32:]
    ks, ctr, pt = b"", 0, entry_pw.encode("utf-8")
    while len(ks) < len(pt):
        ks += hmac.new(enc, iv + ctr.to_bytes(4, "big"), hashlib.sha256).digest()
        ctr += 1
    ct = bytes(a ^ b for a, b in zip(pt, ks))
    tag = hmac.new(mac, iv + ct, hashlib.sha256).digest()
    return ct, tag
```

**TypeScript（WebCrypto）**

```ts
async function deriveBits(pw: string, salt: Uint8Array, iters: number, len = 64) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: iters, hash: "SHA-256" }, base, len * 8);
  return new Uint8Array(bits);
}
async function hmac(keyBytes: Uint8Array, msg: Uint8Array) {
  const k = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, msg));
}
```

> 提示：WebCrypto 的 `HMAC` 用法与 Python `hmac.new(...).digest()` 结果完全一致；`PBKDF2` 的 `deriveBits` 与 `hashlib.pbkdf2_hmac` 完全一致。**不要**用 `deriveKey` 去算 `authHash`（`deriveKey` 不能导出原始字节）。

---

## 8. 安全注意事项

1. 所有涉及 `tag` 的比较必须**恒定时间**（`hmac.compare_digest` / 逐字节异或）。
2. 任何日志、错误上报、埋点都**不得**包含主密码、条目密码、`vaultKey`、`authHash` 原文。
3. 若实现「复制密码」功能，复制后应定时清空剪贴板（字段 `clipboardClearSec` 默认 30，本版尚未实现自动清空）。
4. `iv`、`salt` 一律用密码学随机源，禁止使用时间戳、`Math.random()`。
5. 解锁超时（默认 5 分钟）或手动锁定后，必须清除内存中的 `vaultKey` 与全部明文（`useSession.lock()` 同时调用 `vaultStore.clear()`）。
6. 渲染进程不得发起任何网络请求；Electron 必须保持 `contextIsolation:true`、`nodeIntegration:false`、`sandbox:true`，并阻止导航与新窗口。

**变更记录**

| 版本 | 日期 | 内容 | 负责人 |
|---|---|---|---|
| v1.0 | 2026-10-20 | 首次冻结（含常量全文与向量格式） | 负责人 |
| v2.0 | 2026-10-21 | 单机版：去掉服务端与 authHash 用途；补充 `vault.cvault` 文件格式、`display` 必须编码 `ctHex`、Python 钥匙卡 `kc_decrypt` 接口 | 负责人 |
