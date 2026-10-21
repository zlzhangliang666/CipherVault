# 任务书 C：加密核心库 + 离线钥匙卡 CLI + Docker / CI

> 仓库：https://github.com/zlzhangliang666/CipherVault ｜ 分支：`main`（三人直推 main）
> 你负责的目录：`CipherVault-App/packages/**`、`CipherVault-App/tools/**`、`CipherVault-App/docker/**`、`CipherVault-App/Makefile`、`CipherVault-App/docker-compose.yml`，以及**仓库根**的 `.github/workflows/ci.yml`（GitHub 只认仓库根的 workflows 目录）
> 权威规格（**只读，不许改**）：`docs/ALGORITHM.md`、`docs/CONTRACTS.md`、`docs/ARCHITECTURE.md`、`packages/ciphervault-core/vectors.json`
> 本文档中所有路径都写作**相对 `CipherVault-App/`** 的形式。

---

## 1. 任务概述与你的角色

你是三人中的**技术底座**：组员 A（前端 `frontend/`）用 WebCrypto 加密，组员 B（后端 `backend/`）只存密文，而你用**纯 Python 标准库**把 `docs/ALGORITHM.md` 里的算法落成可测试、可复现的代码，并提供**跨语言基准向量** `packages/ciphervault-core/vectors.json`——前端与你的密文必须**逐字节相同**，这是整个项目的集成验收基准。除此之外，你还要交付脱离本项目即可运行的**离线钥匙卡 CLI**、以及让整套系统一键跑起来的 **Docker 编排**与 **GitHub Actions CI**。

**一句话验收标准**：在 `CipherVault-App/packages/ciphervault-core/` 下 `pip install -e ".[dev]"` 后，`python -m ruff check .` 无 error、`python -m pytest -q` 全绿、`python -m ciphervault_core.vectors --verify vectors.json` 打印「4 条向量全部通过」且退出码为 0；推送后 GitHub Actions 的 `contracts` job 变绿。

---

## 2. 前置准备

1. 克隆或更新本仓库（仓库根目录**不是** `CipherVault-App/`，`CipherVault-App/` 是仓库内的子目录）：

   ```bash
   git clone https://github.com/zlzhangliang666/CipherVault.git
   cd CipherVault
   git pull --rebase origin main
   ```

2. 进入本次工作的根目录：

   ```bash
   cd CipherVault-App
   ```

3. 确认下列文件已就位（**若缺失，先停下并告知负责人，不要自己造一份**）：

   - `docs/ALGORITHM.md`（冻结的加密算法规格 v1.0，权威来源）
   - `docs/CONTRACTS.md`（冻结的接口契约 v1.0）
   - `docs/ARCHITECTURE.md`（架构、目录归属、里程碑）
   - `packages/ciphervault-core/vectors.json`（负责人已生成的 4 条跨语言基准向量，**只读**）
   - `Makefile`、`docker-compose.yml`、`docker/backend.Dockerfile`、`docker/frontend.Dockerfile`、`docker/nginx.conf`（负责人已写好，你负责**校验与维护**）
   - **仓库根**的 `.github/workflows/ci.yml`（同样由负责人写好，你负责**校验与维护**；注意它不在 `CipherVault-App/` 内）

4. 确认 Python 版本为 **3.11**：

   ```bash
   python --version    # 期望 Python 3.11.x
   ```

5. **先通读 `docs/ALGORITHM.md` 全文，再动手写任何一行代码。** 本任务书第 4 节已内嵌该文件第 1～6 节的**逐字原文**，但你在实现时仍应与原始文件比对；若二者出现任何不一致，**以 `docs/ALGORITHM.md` 为准**并立即上报负责人。

---

## 3. 项目背景与整体架构

CipherVault 是一个「既好玩又安全」的密码保险箱，来自同仓库 `mvp/` 下的单文件 HTML 原型，现在要升级为**可部署、可协作、可长期演进**的正式产品（位于仓库子目录 `CipherVault-App/`）。两个核心卖点必须保留：**强加密打底**（真实安全性）与**趣味皮肤外壳 + 离线钥匙卡**（好玩、可分享、可带走）。

**零知识信任边界**（对应 `docs/ARCHITECTURE.md` 第 2 节）：

```
        用户设备（可信）                         服务器（不可信）
┌──────────────────────────────┐        ┌──────────────────────────────┐
│  主密码                       │        │  users 表                     │
│   ├─ 派生 vaultKey (内存)     │        │   · email                     │
│   ├─ 派生 authHash ───────────┼──上传──▶│   · sha256(PEPPER+authHash)   │
│   └─ vaultKey 加密明文 ───────┼──上传──▶│   · kdfSalt / kdfIters        │
│                               │        │  vaults 表                    │
│  解密后的明文（仅内存）        │◀─下载──┼   · iv / ct（密文 blob）      │
└──────────────────────────────┘        └──────────────────────────────┘
```

**三条铁律**：

| # | 规则 | 原因 |
|---|---|---|
| R1 | 主密码、明文、`vaultKey` **绝不允许**出现在任何 HTTP 请求体 / URL / 日志中 | 服务器被攻破也不泄露密码 |
| R2 | 服务器只存 `authHash` 的再哈希（`sha256(PEPPER + authHash)`）与密文 blob | 数据库泄露不能直接登录，也不能解密 |
| R3 | 所有加密/解密逻辑只在 `frontend/` 与 `packages/ciphervault-core/` 中实现，且必须与 `docs/ALGORITHM.md` 完全一致 | 避免两套实现产生不兼容密文 |

**三人分工与你的位置**：

| 成员 | 负责 | 目录 |
|---|---|---|
| A | 前端：全部加密（TS/WebCrypto）、UI、钥匙卡生成、与后端同步 | `frontend/` |
| B | 后端：FastAPI 账号、登录校验、密文 blob 存储与版本控制 | `backend/` |
| **C（你）** | **加密核心库 + 跨语言基准向量 + 离线钥匙卡 CLI + Docker 编排 + CI** | `packages/`、`tools/`、`docker/`、`Makefile`、`docker-compose.yml`，以及仓库根的 `.github/workflows/ci.yml` |

**关键数据流**（你需理解，不必实现）：注册时前端派生 `vaultKey`/`authHash` 并上报 `authHash`（服务器再哈希落库）；登录时前端先取 `kdfSalt`/`kdfIters`，本地重算 `authHash` 换 JWT，再用同一主密码派生 `vaultKey` 解密拉回的密文。**保险箱（整库）加解密只在前端做**，后端与核心库都不解密——所以你的 `vault.py` 只做参数/长度校验与文档说明，不做真实 AES（见第 5 节）。

---

## 4. 加密算法速查（内嵌，权威；逐字摘自 `docs/ALGORITHM.md`）

> **统一编码：所有二进制一律用十六进制小写字符串（hex），全项目统一。**

### 4.1 密钥派生（原文第 1 节）

```
dk = PBKDF2-HMAC-SHA256( password = UTF8(主密码), salt = kdfSalt(16B), iterations = kdfIters, dkLen = 64 )

vaultKey = dk[0:32]        // AES-GCM-256 密钥，仅存于客户端内存，绝不上传
authHash = hex(dk[32:64])  // 64 个 hex 字符，用于登录校验，可上传
```

- `kdfSalt`：注册时客户端生成，`crypto.getRandomValues(new Uint8Array(16))` / `os.urandom(16)`
- `kdfIters`：默认 **200000**，注册后不可变更（改主密码流程本版不做）
- 一次 PBKDF2 同时得到「加密密钥」与「登录校验值」，二者由同一 64 字节输出切分而来，互不干扰

**服务器只存** `kdfSalt`、`kdfIters` 与 `sha256(PEPPER + authHash)`；**永不接触主密码与 vaultKey**。

### 4.2 保险箱（整库）加解密（原文第 2 节）

```
pt = UTF8(JSON.stringify(VaultDoc))          // 明文只在内存
iv = 12B 随机                                  // crypto.getRandomValues / os.urandom
ct = AES-GCM-256(key = vaultKey, iv, pt)      // WebCrypto 输出 = 密文 ‖ 16B 认证标签
上传 = { iv: hex(iv), ct: hex(ct), baseVersion }
```

- **只有前端解密保险箱**；后端与核心库都不解密（后端只见密文 blob）。
- `iv` 每次上传都必须重新随机生成，禁止复用。
- 解密失败（标签不匹配，通常是主密码错误）→ 前端提示「主密码不正确或数据已损坏」。

### 4.3 钥匙卡载荷（跨语言必须逐位一致；原文第 3 节）

> 这是本项目唯一需要「浏览器 ↔ Python」双向兼容的算法，**必须严格实现**。
> 只使用 `hashlib` / `hmac` + WebCrypto 的 PBKDF2 / HMAC，**不依赖任何第三方加密库**。

**3.1 加密**

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

**3.2 解密**

```
1. 先校验：tagExpected = HMAC-SHA256(MAC, iv ‖ ct)，与 tag 做**恒定时间**比较
   （Python: hmac.compare_digest；JS: 逐字节异或累加后判 0）
   不匹配 → 抛出「主密码不正确」
2. 再还原：pt[i] = ct[i] XOR ks[i]，UTF8 解码
```

> **顺序不能反**：必须先验 tag 再解密，避免对伪造数据做无用计算与信息泄露。

### 4.4 趣味皮肤（编码密文，不影响安全性；原文第 4 节）

**作用对象**：密文的 hex 字符串（即 `ctHex`）。逐字符替换，得到「好看的显示串」。

**4.1 常量（必须逐字照抄）**

```
SEP = "·"                // U+00B7 中间点

POEMS = [
  "床前明月光", "疑是地上霜", "举头望明月", "低头思故乡",
  "春眠不觉晓", "处处闻啼鸟", "夜来风雨声", "花落知多少",
  "白日依山尽", "黄河入海流", "欲穷千里目", "更上一层楼",
  "锄禾日当午", "汗滴禾下土", "谁知盘中餐", "粒粒皆辛苦"
]                        // 恰好 16 句，互不相同
```

**4.2 映射表（每个都必须是从 `0..15` 到显示串的双射）**

| 名称 | hex 半字节 `n` | 显示串 |
|---|---|---|
| `letter` | n | `String.fromCharCode(65 + n)` / `chr(65 + n)` → `A`…`P` |
| `number` | n | `str(n + 10)` → `"10"`…`"25"` |
| `poem` | n | `POEMS[n]` |

反查规则：`letter` 取首字符减 65（须落在 0..15）；`number` 取整后减 10（须落在 0..15）；`poem` 查表取下标。任何越界 → 该段「无法还原」，解密失败。

**4.3 编码 / 解码**

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

**4.4 内置皮肤**

| 皮肤名 | rules |
|---|---|
| 字母皮肤 | `["letter"]` |
| 古诗皮肤 | `["poem"]` |
| 数字皮肤 | `["number"]` |
| 混合皮肤 | `["letter", "poem", "number"]` |

- 皮肤仅改变**显示形式**，安全性完全由第 1、2、3 节的真实加密保证。
- 皮肤是「外衣」，可随时更换；换皮肤只改 `display`，不动 `ctHex`。

### 4.5 钥匙卡产物（两种，载荷相同；原文第 5 节）

| 产物 | 文件名 | 运行方式 |
|---|---|---|
| HTML | `keycard_<名称>.html` | 双击用浏览器打开，输入主密码 → 显示条目密码（WebCrypto 实现） |
| Python | `ciphervault_keycard_<名称>.py` | `python ciphervault_keycard_<名称>.py`，按提示输入主密码 |

**Python 钥匙卡硬性要求**

- **只允许** `hashlib`、`hmac`、`json`、`sys`、`getpass` 等标准库；**不得** import `cryptography` / `pycryptodome`
- 文件首行 `# -*- coding: utf-8 -*-`，并在 `main()` 内 `sys.stdout.reconfigure(encoding="utf-8")`（Windows 控制台必需）
- 载荷以 JSON 字面量内嵌在文件里，**无需外部依赖、无需联网、脱离本项目可运行**
- 输出必须同时给出「原始密码」与「趣味皮肤显示串」

**HTML 钥匙卡硬性要求**

- 单文件、零外部依赖；必须能检测 `window.crypto?.subtle` 不可用时给出明确提示（`file://` 下现代浏览器可用）

### 4.6 测试向量（`packages/ciphervault-core/vectors.json`；原文第 6 节）

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

### 4.7 仓库中 `vectors.json` 的实际字段（**以文件实际内容为准**）

已提交的 4 条向量是 `vec-01-mixed`、`vec-02-poem`、`vec-03-letter`、`vec-04-number`，每条 `iters` 均为 `200000`，每条都带 `poems` 全文（16 句）与 `sep = "·"`。**除上面格式中的字段外，实际文件每条还额外包含 `authHashHex`（`hex(dk[32:64])`）与 `vaultKeyHex`（`hex(dk[0:32])`）**，`test_kdf.py` 必须对照这两个字段。完整字段名为：`name`、`note`、`masterPassword`、`entryPassword`、`saltHex`、`ivHex`、`iters`、`authHashHex`、`vaultKeyHex`、`ctHex`、`tagHex`、`display`、`skin{ name, rules, poems, sep }`。

> `vectors.json` 由负责人提交，**你只能校验与复现，不得修改其内容**（连格式化、字段顺序都不许动）。

### 4.8 参考实现语义（对应原文第 7 节）

- Python：`hashlib.pbkdf2_hmac("sha256", pw.encode("utf-8"), salt, iters, 64)`；`hmac.new(key, msg, hashlib.sha256).digest()`；密钥流用 `while len(ks) < len(pt)` 逐块追加。
- 与 WebCrypto 等价：`HMAC` 的 `sign` 与 `hmac.new(...).digest()` 完全一致，`PBKDF2` 的 `deriveBits` 与 `hashlib.pbkdf2_hmac` 完全一致。
- **不要**用 `deriveKey` 去算 `authHash`（`deriveKey` 不能导出原始字节）——这条是给组员 A 的提醒，也解释了为什么向量必须用 `deriveBits` 那一套。

---

## 5. 你的交付清单（精确到目录与文件名）

### 5.1 目标目录树

```
CipherVault-App/
├─ packages/ciphervault-core/
│  ├─ pyproject.toml
│  ├─ README.md
│  ├─ src/ciphervault_core/
│  │  ├─ __init__.py
│  │  ├─ hexutil.py
│  │  ├─ kdf.py
│  │  ├─ vault.py
│  │  ├─ stream.py
│  │  ├─ skin.py
│  │  ├─ keycard.py
│  │  ├─ vectors.py
│  │  └─ cli.py
│  ├─ tests/
│  │  ├─ test_kdf.py
│  │  ├─ test_stream.py
│  │  ├─ test_skin.py
│  │  ├─ test_keycard.py
│  │  └─ test_vectors.py
│  └─ vectors.json          ← 已存在，只读
├─ tools/
│  ├─ keycard_cli.py
│  ├─ reference_keycard.py
│  └─ README.md
├─ docker/
│  ├─ backend.Dockerfile    ← 已存在，校验
│  ├─ frontend.Dockerfile   ← 已存在，校验
│  └─ nginx.conf            ← 已存在，校验
├─ Makefile                 ← 已存在，校验
└─ docker-compose.yml       ← 已存在，校验

仓库根（不在 CipherVault-App/ 内）
└─ .github/workflows/ci.yml ← 已存在，校验（GitHub 只认仓库根的 workflows 目录）
```

### 5.2 逐文件职责表

| 文件 | 做什么 | 导出什么（公共符号） | 依赖谁 |
|---|---|---|---|
| `packages/ciphervault-core/pyproject.toml` | 包配置：`[project]` 名 `ciphervault-core`、`requires-python = ">=3.11"`、`license`、`readme = "README.md"`；`dependencies = []`（**仅标准库**）；`[project.optional-dependencies] dev = ["pytest==8.3.3", "ruff==0.6.9"]`；`[build-system] requires = ["hatchling"]` + `[tool.hatch.build.targets.wheel] packages = ["src/ciphervault_core"]`；`[tool.pytest.ini_options] testpaths = ["tests"]`；`[tool.ruff] line-length = 100, target-version = "py311"` | — | 无 |
| `packages/ciphervault-core/README.md` | 算法说明（引用 `docs/ALGORITHM.md`）、安装方法、**CLI 用法**（`vectors` 与 `cli` 两个入口）、如何被 CI（`core` 与 `contracts` job）使用 | — | `docs/ALGORITHM.md` |
| `src/ciphervault_core/__init__.py` | 汇总导出公共 API 与常量 | `derive_keys`、`auth_hash_hex`、`vault_key_bytes`、`keystream`、`xor_stream`、`compute_tag`、`verify_tag`、`SEP`、`POEMS`、`XF`、`encode_token`、`decode_token`、`kc_encrypt`、`kc_decrypt`、`KDF_DKLEN`、`KDF_ITERS_DEFAULT`、`KDF_SALT_LEN`、`KEYCARD_IV_LEN`、`VAULT_IV_LEN` | `kdf`、`stream`、`skin`、`keycard`、`vault` |
| `src/ciphervault_core/hexutil.py` | hex ↔ bytes 工具：小写输出、非法长度/非法字符抛 `ValueError` | `to_hex(b: bytes) -> str`、`from_hex(s: str) -> bytes` | 无 |
| `src/ciphervault_core/kdf.py` | 第 1 节：`hashlib.pbkdf2_hmac("sha256", pw.encode("utf-8"), salt, iters, 64)`，切分 `vaultKey = dk[:32]`、`authHash = dk[32:64]`；常量 `KDF_DKLEN = 64`、`KDF_SALT_LEN = 16`、`KDF_ITERS_DEFAULT = 200000` | `derive_keys(master_password, salt, iters=KDF_ITERS_DEFAULT) -> (vault_key: bytes, auth_hash: bytes)`、`auth_hash_hex(...) -> str`、`vault_key_bytes(...) -> bytes` | `hashlib` |
| `src/ciphervault_core/vault.py` | 第 2 节：**★ Python 侧只做文档与参数校验，不做真实 AES**（保险箱解密由前端负责）；校验 `iv` 为 12 字节 hex（24 字符）、`ct` 为合法 hex、`baseVersion` 为非负整数；常量 `VAULT_IV_LEN = 12`、`VAULT_TAG_LEN = 16` | `VAULT_IV_LEN`、`VAULT_TAG_LEN`、`validate_vault_blob(iv_hex, ct_hex) -> None`、`validate_put_request(base_version, iv_hex, ct_hex) -> None` | `hexutil` |
| `src/ciphervault_core/stream.py` | 第 3 节：`HMAC-SHA256` 密钥流 + tag 计算/恒定时间校验；`uint32be(counter)`；`KEYCARD_IV_LEN = 16` | `KEYCARD_IV_LEN`、`keystream(enc_key, iv, length) -> bytes`、`xor_stream(pt, ks) -> bytes`、`compute_tag(mac_key, iv, ct) -> bytes`、`verify_tag(mac_key, iv, ct, tag) -> bool`（内部 `hmac.compare_digest`） | `hashlib`、`hmac` |
| `src/ciphervault_core/skin.py` | 第 4 节：`SEP = "·"`、`POEMS`（16 句全文）、映射表 `XF`（`letter`/`number`/`poem` 的 encode/decode）、`encode_token` / `decode_token`（`rules` 按 `i % len(rules)` 循环；越界抛「第 (i+1) 段无法还原」） | `SEP`、`POEMS`、`XF`、`encode_token(ct_hex, rules) -> str`、`decode_token(display, rules) -> str` | 无 |
| `src/ciphervault_core/keycard.py` | **★ 钥匙卡载荷的加密与解密**：`kc_encrypt` / `kc_decrypt`，**可注入固定 salt/iv 以复现向量**；解密时**先验 tag 再解密**；载荷字段为 `saltHex`/`ivHex`/`ctHex`/`tagHex`/`iters` | `kc_encrypt(master_password, entry_password, salt=None, iv=None, iters=KDF_ITERS_DEFAULT) -> dict`、`kc_decrypt(master_password, payload) -> str`（tag 不匹配抛 `ValueError("主密码不正确")`） | `kdf`、`stream`、`hexutil`、`os`、`secrets` |
| `src/ciphervault_core/vectors.py` | **★ 向量生成与校验 CLI**：`python -m ciphervault_core.vectors --verify vectors.json`（打印「4 条向量全部通过」、退出码 0；任一条不符则打印差异并 `sys.exit(1)`）、`python -m ciphervault_core.vectors --write vectors.json`；`--write` 内置 4 条用例的**固定输入**（`name`/`masterPassword`/`entryPassword`/`saltHex`/`ivHex`/`iters`/`skin`，逐字取自现有 `vectors.json`），`ctHex`/`tagHex`/`display`/`authHashHex`/`vaultKeyHex` 全部由算法计算得出；只用于本地回归，**不要把重新生成的同名向量覆盖仓库里的基准文件** | `main(argv=None) -> int`、`verify_file(path) -> bool` | `keycard`、`skin`、`kdf`、`json`、`argparse` |
| `src/ciphervault_core/cli.py` | **离线解密入口**：读取钥匙卡载荷（JSON 文件或 stdin，字段同 `keycard.py`）→ 输入主密码 → 输出**条目密码**与**趣味显示串**（用 `skin` 的 `encode_token(ctHex, rules)`，`rules` 取自载荷中 `skin.rules`） | `main(argv=None) -> int` | `keycard`、`skin`、`getpass`、`json`、`argparse` |
| `tests/test_kdf.py` | **★ 对照 `vectors.json` 里的 `authHashHex` / `vaultKeyHex`**：对 4 条向量各自用 `masterPassword` + `saltHex` + `iters` 派生 64 字节，断言 `hex(dk[32:64]) == authHashHex`、`hex(dk[:32]) == vaultKeyHex`；并断言错误主密码得到不同 `authHash` | — | `vectors.json` |
| `tests/test_stream.py` | **★ 密钥流与 tag 的确定性**：固定 key/iv 时 `keystream` 每 32 字节块前缀等于 `HMAC-SHA256(key, iv + uint32be(counter))`；空明文 ⇒ `ct = b""` 但 tag 长度 32；`verify_tag` 对篡改 ct 返回 `False` | — | `stream` |
| `tests/test_skin.py` | **★ 逐字对照 `POEMS`/`SEP` 与 encode/decode 往返**：断言 `POEMS` 长度 16、互不相同、与文件（及 `vectors.json[*].skin.poems`）逐字一致；`SEP == "\u00b7"`；对每条向量的 `ctHex` 用其 `skin.rules` 编码 == `display`，再由 `display` 解码 == `ctHex`；越界段抛错 | — | — |
| `tests/test_keycard.py` | **★ 用向量里的 `masterPassword` 解出 `entryPassword`；错误主密码必须被拒**：对 4 条向量调用 `kc_decrypt(masterPassword, payload)` 断言 == `entryPassword`；把主密码改一个字符后断言抛 `ValueError`（而不是返回乱码） | — | — |
| `tests/test_vectors.py` | **★ 4 条向量全部往返通过，且逐字节复现 `ctHex`/`tagHex`/`display`**：用向量里的 `saltHex`/`ivHex`/`entryPassword`/`masterPassword` 调 `kc_encrypt(..., salt, iv, iters)`，断言 `ctHex`、`tagHex` 与向量**逐字节相同**（即便对方 hex 用大写，也必须先统一小写再比较字节）；`encode_token(ctHex, skin.rules)` 断言 == `display` | — | — |
| `packages/ciphervault-core/vectors.json` | **★ 已存在，由负责人提交；你只能校验与复现，不得修改** | — | — |
| `tools/keycard_cli.py` | stdlib-only 的**离线解密脚本**（给用户手里的钥匙卡同类实现，可直接运行）：读取内嵌/外部载荷 JSON，提示输入主密码，输出条目密码与趣味显示串；同样要求 `# -*- coding: utf-8 -*-` + `sys.stdout.reconfigure(encoding="utf-8")`，**单文件零依赖** | — | 仅标准库 |
| `tools/reference_keycard.py` | 生成示例钥匙卡：**同时产出 `.py` 与 `.html` 两个版本**，用于人工验收；`--demo` 固定使用 `vec-01-mixed` 的输入（主密码 `blue-Harbor-2026-quiet`、条目密码 `S3cr3t-Entry-01!`、混合皮肤、其 `saltHex`/`ivHex`/`iters`），产出 `ciphervault_keycard_demo.py` 与 `keycard_demo.html`（命名严格遵循 `docs/ALGORITHM.md` 第 5 节），因此其 `ctHex`/`tagHex` 应与 `vec-01-mixed` 一致；非 `--demo` 模式用 `os.urandom` 生成新 salt/iv | — | 仅标准库 |
| `tools/README.md` | 两个工具的用法（命令行、输入输出、示例） | — | — |
| 仓库根的 `.github/workflows/ci.yml` | **已存在，C 负责校验**其 5 个 job：`detect`（探测 `packages/ciphervault-core/pyproject.toml`、`backend/pyproject.toml`、`frontend/package.json` 是否存在，输出 `core`/`backend`/`frontend` 三个 flag）、`core`（跑 ruff + pytest）、`backend`（跑 ruff + pytest）、`frontend`（`npm ci` + lint + test + build）、`contracts`（跨语言一致性，执行 `python -m ciphervault_core.vectors --verify vectors.json`）。后 4 个都以 `needs.detect` + flag 为条件，因此**目录尚未创建时会自动跳过，不会出现红叉**。你的核心库合并后 `core` 与 `contracts` 应自动开始变绿 | — | — |
| `Makefile` | **已存在，C 负责校验** targets 是否可用（`install-core`、`test-core`、`lint`、`vectors`、`docker-up` 等；相对路径基于 `CipherVault-App/`） | — | — |
| `docker-compose.yml` | **已存在，C 负责校验**：`api`(:8000) 与 `web`(:5173→80)、`volumes: vaultdata`、`web` 依赖 `api` 健康、`VITE_API_BASE=/api/v1` | — | — |
| `docker/backend.Dockerfile` | **已存在，C 负责校验**：`python:3.11-slim`、COPY `backend/pyproject.toml` 后 `pip install`、再 COPY 源码、`CMD uvicorn app.main:app --host 0.0.0.0 --port 8000` | — | — |
| `docker/frontend.Dockerfile` | **已存在，C 负责校验**：`node:20-alpine` 构建（`npm ci` + `npm run build`，注入 `ARG VITE_API_BASE`）→ `nginx:alpine` 托管 `dist` 与 `docker/nginx.conf` | — | — |
| `docker/nginx.conf` | **已存在，C 负责校验**：`/` 回退 `index.html`、`/api/` 反代 `http://api:8000`、gzip 开启 | — | — |

---

## 6. 技术栈与依赖

- **Python**：**3.11**（`requires-python = ">=3.11"`，CI 使用 `python-version: "3.11"`）。
- **加密实现只允许 Python 标准库**：`hashlib`、`hmac`、`secrets`、`os`、`json`、`base64` 均可用。其中：
  - 密钥派生只用 `hashlib.pbkdf2_hmac("sha256", ...)`
  - HMAC 只用 `hmac.new(..., hashlib.sha256).digest()`
  - 随机源只用 `os.urandom` / `secrets.token_bytes`
  - **禁止** `cryptography`、`pycryptodome`、`nacl` 以及任何第三方加密库（`dependencies = []`，运行时零第三方依赖）。
- **开发依赖**：仅 **pytest `8.3.3`** 与 **ruff `0.6.9`**（写在 `[project.optional-dependencies] dev` 里，运行时 `dependencies = []`）。
- **部署**：**Docker + docker compose**。`web` 用 **nginx** 托管前端静态资源并反向代理 `/api/` 到 `api`（后端 FastAPI，容器内 8000）；CI 用 **GitHub Actions**（`.github/workflows/ci.yml`），四个 job 各自独立。

---

## 7. 必须通过的自测与验收标准

### 7.1 核心库（在 `packages/ciphervault-core/` 目录下执行）

```bash
cd packages/ciphervault-core
pip install -e ".[dev]"
python -m ruff check .                       # 期望：无 error（0 退出码）
python -m pytest -q                          # 期望：全绿（0 failed）
python -m ciphervault_core.vectors --verify vectors.json
```

- 最后一条命令**必须**打印「**4 条向量全部通过**」**并且退出码为 0**（可加 `echo $?` / `echo %ERRORLEVEL%` 复核）。
- **逐字节复现**：用向量里的 `saltHex` / `ivHex` / `entryPassword` / `masterPassword` 重新加密，`ctHex`、`tagHex` 必须与向量**完全相同**（**不是「大致一致」**，是逐字节相同）。`tests/test_vectors.py` 已覆盖此断言。
- `pytest` 会反复做 200000 次 PBKDF2，运行几秒钟属正常，不要为提速而降低迭代次数。

### 7.2 离线钥匙卡工具（在 `CipherVault-App/` 目录下执行）

```bash
python tools/reference_keycard.py --demo
```

- 期望：生成 `ciphervault_keycard_demo.py` 与 `keycard_demo.html` 两个文件。
- **把生成的 `.py` 在本地用 Python 真实跑一遍**（`python ciphervault_keycard_demo.py`），输入向量里的主密码，**必须打印出正确的条目密码**；在 Windows 控制台下中文显示不得乱码。

```bash
python tools/keycard_cli.py --help          # 期望：打印用法，退出码 0
```

### 7.3 Docker 一键启动（在 `CipherVault-App/` 目录下执行）

```bash
docker compose up --build
```

期望：

- `http://localhost:5173` 能打开前端页面；
- `http://localhost:8000/api/v1/health` 返回 `{"status":"ok","version":"0.1.0"}`（`status` 为 `ok`）。

> `docker compose up` 需要组员 A 的 `frontend/`（含 `package-lock.json`）与组员 B 的 `backend/` 就位；若尚未合并，可在本地仅**校验 Dockerfile / nginx.conf / docker-compose.yml 的语法与路径**（`docker compose config`），并把结论写进你的提交说明里。

### 7.4 CI

推送后到 GitHub Actions 页面确认：

- **`contracts` job 必须变绿**（它每次推送都会跑，执行 `python -m ciphervault_core.vectors --verify vectors.json`）；
- `core` job 在你的 `packages/`、`tools/` 变更触发时也要变绿。

---

## 8. 上传到 GitHub 的步骤

> 本仓库根目录是 `CipherVault/`（即 `CipherVault-App/` 的**上一级**）。无论从仓库根还是从 `CipherVault-App/` 执行 git 命令都可以，注意 `git add` 的路径前缀要与之匹配。

1. 先看状态与差异：

   ```bash
   git status --short
   git diff
   ```

2. 只添加你负责的文件（**不要**用 `git add -A` / `git add .`，避免误提交他人目录）：

   ```bash
   # 在 CipherVault-App/ 下执行（路径相对当前目录）
   git add packages/ tools/ docker/ Makefile docker-compose.yml
   # CI 工作流在【仓库根】的 .github/，不在 CipherVault-App/ 内
   git add ../.github/workflows/ci.yml
   ```

   > `packages/ciphervault-core/vectors.json` 是负责人提交的基准文件，本次**原样一并提交、不修改内容**。

3. 提交（提交信息规范：核心库用 `feat(core): ...`，CI 用 `ci: ...`，部署用 `chore(deploy): ...`）：

   ```bash
   git commit -m "feat(core): 实现 PBKDF2/HMAC 钥匙卡算法、皮肤编码与向量校验 CLI"
   git commit -m "chore(deploy): 新增离线钥匙卡工具与 Docker 编排校验"
   ```

4. 推送：

   ```bash
   git push origin main
   ```

5. **若 push 被拒**（远端有新提交），先变基再推：

   ```bash
   git pull --rebase origin main
   git push origin main
   ```

   变基时**只解决你自己文件里的冲突**；若冲突出现在 `docs/`、`frontend/`、`backend/` 或 `vectors.json`，**不要自行修改这些文件**，停下来联系负责人。

---

## 9. 禁止事项与常见坑

### 9.1 硬约束（必须遵守）

- 只允许改动 `packages/**`、`tools/**`、`docker/**`、`Makefile`、`docker-compose.yml`，以及**仓库根**的 `.github/workflows/ci.yml`；**禁止**改动 `docs/`、`frontend/`、`backend/`、仓库根其它文件，以及 `packages/ciphervault-core/vectors.json` 的内容。
- **`vectors.json` 是集成验收基准**：如果它和你的实现不一致，**先怀疑自己的实现**，逐字节排查（hex 大小写、`iv` 长度、counter 编码、tag 输入顺序、UTF-8 编码、迭代次数）；确认是向量本身有误才上报负责人，**绝不许擅自改向量或改算法去「对齐」自己**。
- 所有 tag 比较**必须**用 `hmac.compare_digest`（恒定时间），不得用 `==`。
- 生成的 `.py` 钥匙卡必须是**单文件、零第三方依赖、脱离本项目可运行**，并在 Windows 控制台能正确输出中文（首行 `# -*- coding: utf-8 -*-` + 在 `main()` 内 `sys.stdout.reconfigure(encoding="utf-8")`）。
- 不得在日志 / 异常信息里输出明文密码、主密码、`vaultKey`、`authHash` 原文（异常文案用「主密码不正确」这类固定串）。
- 提交信息规范：`feat(core): ...` / `ci: ...` / `chore(deploy): ...`。

### 9.2 常见坑（逐条对照自查）

1. **`iv` 长度**：钥匙卡用 **16 字节**（32 hex 字符），保险箱用 **12 字节**（24 hex 字符），**两者不可混用**。
2. **`salt` 长度**：KDF salt 与钥匙卡 salt 都是 **16 字节**；`pbkdf2_hmac` 的 `dklen` 是 **64**。
3. **切分顺序**：`ENC = dk[:32]`、`MAC = dk[32:]`（不是反过来）；`vaultKey = dk[:32]`、`authHash = hex(dk[32:64])`。
4. **counter 编码**：`uint32be(counter)` = `counter.to_bytes(4, "big")`；从 `0` 开始；密钥流按需拼接，长度够用即可。
5. **tag 输入**：`tag = HMAC(MAC, iv ‖ ct)`，**不是** `iv ‖ pt`，也**不是** `ct ‖ iv`。
6. **解密顺序**：**先验 tag，再解密**；顺序反了会带来信息泄露风险，也会让「错误主密码被拒」的测试失败。
7. **空明文**：`ct` 为空串时**仍必须计算 tag**（`HMAC(MAC, iv ‖ b"")`），不能跳过。
8. **hex 大小写**：全项目统一**小写**；比较前可先 `str.lower()` 归一化，但输出必须小写。
9. **`SEP` 是 U+00B7**（`·`），不是 ASCII 句点 `.`；`POEMS` 恰好 16 句且互不相同，一个字都不能错。
10. **`number` 映射是两位字符串**：`str(n + 10)` → `"10"`..`"25"`；解码时先 `int()` 再减 10，并校验落在 `0..15`，非法段抛「第 (i+1) 段无法还原」。
11. **`letter` 解码**只取首字符 `ord(ch) - 65`；`poem` 解码是查表取下标（`SEP` 不会出现在诗句里，可安全 split）。
12. **`rules` 循环**：第 `i` 个半字节用 `rules[i % len(rules)]`；`decode_token` 的分段数与 `ctHex` 长度必须一致。
13. **UTF-8 编码**：`password.encode("utf-8")`，密钥流异或按**字节**操作，不要按字符。
14. **`dependencies = []`**：运行时**零**第三方依赖；`pytest`/`ruff` 只在 `[dev]` 里。CI 的 `contracts` job 也会执行 `pip install -e ".[dev]"`，所以 dev 依赖必须可安装。
15. **`vectors.json` 只读**：`--write` 只用于本地回归验证，**不要**把 `--write` 的输出覆盖仓库里的基准文件。
16. **路径前缀**：CI 与 Dockerfile 里大量使用 `CipherVault-App/...` 前缀（因为仓库根是 `CipherVault/`），校验时留意 `working-directory` 与 `COPY` 路径是否自洽。

---

## 10. 完成后的自检清单

- [ ] `docs/ALGORITHM.md` 第 1～6 节已逐字核对，未自行发明/改动任何算法参数（迭代次数、POEMS 诗句、SEP、iv/salt 长度、tag 规则）。
- [ ] `packages/ciphervault-core/pyproject.toml` 中 `dependencies = []`，dev 依赖**只有** pytest 与 ruff。
- [ ] `src/ciphervault_core/` 下 9 个模块文件全部存在且职责与第 5.2 节一致（`__init__`、`hexutil`、`kdf`、`vault`、`stream`、`skin`、`keycard`、`vectors`、`cli`）。
- [ ] `vault.py` **只做文档与参数校验，不实现真实 AES**（已明示保险箱解密由前端负责）。
- [ ] `keycard.py` 的 `kc_decrypt` **先验 tag 再解密**，且 tag 用 `hmac.compare_digest` 比较。
- [ ] `tests/` 下 5 个测试文件全部存在：`test_kdf.py`、`test_stream.py`、`test_skin.py`、`test_keycard.py`、`test_vectors.py`。
- [ ] `pip install -e ".[dev]"` 成功；`python -m ruff check .` 无 error。
- [ ] `python -m pytest -q` 全绿。
- [ ] `python -m ciphervault_core.vectors --verify vectors.json` 打印「4 条向量全部通过」且**退出码为 0**。
- [ ] 逐字节复现通过：用 `saltHex`/`ivHex`/`entryPassword`/`masterPassword` 重算的 `ctHex`、`tagHex` 与 `vectors.json` **完全相同**（含大小写归一化后比对）。
- [ ] 4 条向量的 `authHashHex`、`vaultKeyHex` 均被 `test_kdf.py` 断言通过。
- [ ] `tools/keycard_cli.py`、`tools/reference_keycard.py`、`tools/README.md` 已就位；两个脚本均为**单文件、零第三方依赖**。
- [ ] `python tools/reference_keycard.py --demo` 生成了 `ciphervault_keycard_demo.py` 与 `keycard_demo.html`；把生成的 `.py` 真实跑通并打印出正确条目密码，Windows 控制台中文不乱码。
- [ ] `docker/backend.Dockerfile`、`docker/frontend.Dockerfile`、`docker/nginx.conf`、`docker-compose.yml` 已校验（可用 `docker compose config` 校验语法）。
- [ ] 仓库根 `.github/workflows/ci.yml` 的 5 个 job（`detect`/`core`/`backend`/`frontend`/`contracts`）与 `detect` 的存在性探测逻辑已校验。
- [ ] `Makefile` 的 targets 已校验可用（`install-core`、`test-core`、`lint`、`vectors`、`docker-up` 等）。
- [ ] 未改动 `docs/`、`frontend/`、`backend/`，未改动 `packages/ciphervault-core/vectors.json` 内容。
- [ ] 日志/异常中不含明文密码、主密码、`vaultKey`、`authHash`。
- [ ] 提交信息符合 `feat(core): ...` / `ci: ...` / `chore(deploy): ...` 规范。
- [ ] 已 `git push origin main`，且 GitHub Actions 的 `contracts` job 变绿。
- [ ] 已向负责人回报：向量校验结果、复现结论、CI 状态，以及任何未能自验的部分（例如 `frontend/`/`backend/` 尚未就位导致 Docker 端到端未跑）。

---

**变更记录**

| 版本 | 日期 | 内容 | 负责人 |
|---|---|---|---|
| v1.0 | 2026-10-20 | 首次下发（含算法第 1～6 节内嵌原文） | 负责人 |
