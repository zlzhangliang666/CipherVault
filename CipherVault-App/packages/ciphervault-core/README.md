# ciphervault-core

CipherVault 的**加密核心库**：用纯 Python 标准库实现 [`docs/ALGORITHM.md`](../../docs/ALGORITHM.md)
（冻结的算法规格 v1.0），并提供**跨语言基准向量** [`vectors.json`](vectors.json) 的校验 CLI。

前端（组员 A，TS/WebCrypto）算出的密文必须与本库**逐字节相同**——这是整个项目的集成验收基准。

> **运行时零第三方依赖**（`dependencies = []`）。加密只用 `hashlib` / `hmac` / `secrets`，
> **禁止** `cryptography`、`pycryptodome`、`nacl`。开发期只额外需要 `pytest` 与 `ruff`。

---

## 1. 算法概览

权威来源是 [`docs/ALGORITHM.md`](../../docs/ALGORITHM.md)，本库逐节对应实现；
下表只作导航，**若二者有任何出入，以 `docs/ALGORITHM.md` 为准**。

**统一编码：所有二进制一律用十六进制小写字符串（hex），全项目统一，不用 base64。**

| 规格章节 | 内容 | 本库模块 |
|---|---|---|
| §1 密钥派生 | `dk = PBKDF2-HMAC-SHA256(UTF8(主密码), kdfSalt(16B), kdfIters, 64)`；`vaultKey = dk[0:32]`、`authHash = hex(dk[32:64])` | [`kdf.py`](src/ciphervault_core/kdf.py) |
| §2 保险箱加解密 | `iv` 12B 随机 + `AES-GCM-256(vaultKey)`。**只有前端解密**，后端与核心库都不解密 | [`vault.py`](src/ciphervault_core/vault.py)（★ 只做文档与参数校验，**不实现真实 AES**） |
| §3 钥匙卡载荷 | `ENC = dk[0:32]`、`MAC = dk[32:64]`；`ks = HMAC-SHA256(ENC, iv ‖ uint32be(counter))`；`ct = pt XOR ks`；`tag = HMAC-SHA256(MAC, iv ‖ ct)`。`iv` **16 字节** | [`stream.py`](src/ciphervault_core/stream.py)（原语）、[`keycard.py`](src/ciphervault_core/keycard.py)（载荷级） |
| §4 趣味皮肤 | `SEP = "·"`(U+00B7)、`POEMS` 16 句、`letter`/`number`/`poem` 三个双射映射，按 `i % len(rules)` 循环编码 `ctHex` | [`skin.py`](src/ciphervault_core/skin.py) |
| §5 钥匙卡产物 | `keycard_<名称>.html` 与 `ciphervault_keycard_<名称>.py` 两种，载荷相同 | [`../../tools/reference_keycard.py`](../../tools/reference_keycard.py) |
| §6 测试向量 | 固定 `salt`/`iv` 得到确定性输出，4 条基准向量 | [`vectors.py`](src/ciphervault_core/vectors.py)、[`vectors.json`](vectors.json) |

另有一个 hex 工具模块 [`hexutil.py`](src/ciphervault_core/hexutil.py)：`to_hex` 保证输出小写，
`from_hex` 对「奇数长度 / 非法字符」抛 `ValueError`，且异常信息**不回显 hex 内容**。

### 安全铁律

来自 [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md)：

| # | 规则 |
|---|---|
| R1 | 主密码、明文、`vaultKey` **绝不允许**出现在任何 HTTP 请求体 / URL / 日志中 |
| R2 | 服务器只存 `sha256(PEPPER + authHash)` 与密文 blob |
| R3 | 所有加密/解密逻辑只在 `frontend/` 与本包中实现，且必须与 `docs/ALGORITHM.md` 完全一致 |

因此本库所有异常文案都是**固定串**（例如主密码错误统一为「主密码不正确」），
不携带期望值、实际值或任何密钥材料；tag 比较一律走 `hmac.compare_digest`（恒定时间），**禁止用 `==`**。

---

## 2. 目录结构

```
packages/ciphervault-core/
├─ pyproject.toml              包配置（hatchling 构建、dev 依赖只有 pytest/ruff）
├─ README.md                   本文件
├─ vectors.json                ★ 跨语言基准向量（负责人提交，只读，不得修改）
├─ src/ciphervault_core/
│  ├─ __init__.py              汇总导出公共 API 与常量
│  ├─ hexutil.py               hex ↔ bytes
│  ├─ kdf.py                   §1 PBKDF2 密钥派生
│  ├─ vault.py                 §2 保险箱 blob 校验（无真实 AES）
│  ├─ stream.py                §3 HMAC 密钥流 + tag
│  ├─ skin.py                  §4 SEP / POEMS / XF / encode_token / decode_token
│  ├─ keycard.py               §3 kc_encrypt / kc_decrypt
│  ├─ vectors.py               §6 向量生成与校验 CLI
│  └─ cli.py                   离线解密 CLI
└─ tests/
   ├─ test_kdf.py              对照 authHashHex / vaultKeyHex
   ├─ test_stream.py           密钥流与 tag 的确定性
   ├─ test_skin.py             POEMS / SEP 逐字对照与往返
   ├─ test_keycard.py          向量解密 + 错误主密码必须被拒
   └─ test_vectors.py          逐字节复现 ctHex / tagHex / display
```

---

## 3. 安装

需要 **Python 3.11+**（CI 使用 3.11）。以下命令都在本目录 `packages/ciphervault-core/` 下执行。

```bash
pip install -e ".[dev]"        # 开发安装：本包 + pytest 8.3.3 + ruff 0.6.9
pip install -e .               # 仅运行本包（零第三方依赖）
```

在 `CipherVault-App/` 目录下也可以用 Makefile：

```bash
make install-core              # 等价于 cd packages/ciphervault-core && python -m pip install -e ".[dev]"
```

---

## 4. 自测

```bash
python -m ruff check .                                  # 期望：无 error，退出码 0
python -m pytest -q                                     # 期望：全绿，0 failed
python -m ciphervault_core.vectors --verify vectors.json # 期望：打印「4 条向量全部通过」，退出码 0
```

> `pytest` 会反复做 200000 次 PBKDF2，运行几秒钟属正常——**不要为提速而降低迭代次数**。
> 复核退出码：Linux/macOS 用 `echo $?`，Windows cmd 用 `echo %ERRORLEVEL%`。

---

## 5. CLI 用法

本包提供两个命令行入口，都用 `python -m` 方式调用。

### 5.1 `python -m ciphervault_core.vectors` — 向量校验 / 生成

CI 的 `contracts` job 就跑这条命令。

```bash
# 校验：4 条向量全部通过 → 打印「4 条向量全部通过」+ 退出码 0；任一条不符 → 打印差异 + 退出码 1
python -m ciphervault_core.vectors --verify vectors.json

# 生成：用内置 4 条固定输入重算 ctHex/tagHex/display/authHashHex/vaultKeyHex
python -m ciphervault_core.vectors --write  /tmp/vectors.json
```

`--verify` 对每条向量跑完 `docs/ALGORITHM.md` §6 的 5 条验收要求：

1. 用 `masterPassword` 解 `ctHex`+`tagHex` → 必须得到 `entryPassword`；
2. 用错误主密码解 → 必须被 tag 校验拒绝（抛错，而不是返回乱码）；
3. 用 `saltHex`/`ivHex`/`entryPassword` 重新加密 → `ctHex`、`tagHex` **逐字节相同**；
4. `encode_token(ctHex, skin.rules)` == `display`，且 `decode_token(display, …)` == `ctHex`；
5. 用 `masterPassword`+`saltHex`+`iters` 派生 → `authHashHex`、`vaultKeyHex` **逐字节相同**。

另外还会校验 `skin.poems` / `skin.sep` 与 `skin.py` 里冻结的常量逐字一致。

输出示例：

```
校验 vectors.json（4 条向量，每条 200000 次 PBKDF2）…
[PASS] vec-01-mixed  混合皮肤（字母/古诗/数字循环）
[PASS] vec-02-poem  古诗皮肤
[PASS] vec-03-letter  字母皮肤
[PASS] vec-04-number  数字皮肤
4 条向量全部通过
```

> ⚠️ `--write` **只用于本地回归验证**。它内置的固定输入逐字取自仓库基准文件，
> 因此产物与 `vectors.json` 内容一致（`make vectors` 是幂等的）。
> **不要**用 `--write` 的输出去「修正」基准文件——若二者不一致，先怀疑自己的实现
> （hex 大小写、`iv` 长度、counter 编码、tag 输入顺序、UTF-8、迭代次数），
> 确认是向量本身有误才上报负责人。

### 5.2 `python -m ciphervault_core.cli` — 离线解密

读入一份钥匙卡载荷 JSON，交互式输入主密码，输出**条目密码**与**趣味显示串**。

```bash
# 从文件读载荷
python -m ciphervault_core.cli keycard_payload.json

# 从 stdin 读载荷（"-" 或省略参数）
type keycard_payload.json | python -m ciphervault_core.cli -

# 直接拿 vectors.json 里的一条向量当载荷也可以（多余字段会被忽略）
python -c "import json;print(json.dumps(json.load(open('vectors.json',encoding='utf-8'))[0]))" > one.json
python -m ciphervault_core.cli one.json
```

载荷字段（`skin` 可选，用于生成趣味显示串）：

```json
{
  "saltHex": "101112131415161718191a1b1c1d1e1f",
  "ivHex":   "a0a1a2a3a4a5a6a7a8a9aaabacadaeaf",
  "ctHex":   "16d7d477729b5ddc3bf5fecf11e036d6",
  "tagHex":  "68a7ec9b1b7ee889a58c0315dc76a009b185783d9960dbff61a0330c2e41b8bd",
  "iters":   200000,
  "skin":    { "name": "混合皮肤", "rules": ["letter", "poem", "number"] }
}
```

输出示例：

```
请输入主密码：
条目密码：S3cr3t-Entry-01!
趣味显示串（混合皮肤）：B·夜来风雨声·23·H·汗滴禾下土·14·…
```

主密码只通过 `getpass` 交互式读取，**不接受命令行参数**，避免落进 shell 历史或进程列表。
退出码：`0` 成功、`1` 载荷或主密码错误、`2` 参数错误。

> 想要**脱离本项目即可运行**的钥匙卡（单文件、零依赖），见
> [`tools/reference_keycard.py`](../../tools/reference_keycard.py)（生成 `.py` / `.html` 两种卡片）
> 与 [`tools/keycard_cli.py`](../../tools/keycard_cli.py)（单文件离线解密脚本）。

---

## 6. Python API

```python
from ciphervault_core import (
    derive_keys, auth_hash_hex, vault_key_bytes,          # §1 密钥派生
    keystream, xor_stream, compute_tag, verify_tag,       # §3 密钥流与 tag
    SEP, POEMS, XF, encode_token, decode_token,           # §4 趣味皮肤
    kc_encrypt, kc_decrypt,                               # §3 钥匙卡载荷
    validate_vault_blob, validate_put_request,            # §2 blob 校验（无 AES）
    KDF_DKLEN, KDF_ITERS_DEFAULT, KDF_SALT_LEN,
    KEYCARD_IV_LEN, VAULT_IV_LEN,
)
```

```python
# 注册：派生 vaultKey（只留内存）与 authHash（上传给服务器再哈希落库）
salt = bytes.fromhex("101112131415161718191a1b1c1d1e1f")
vault_key, auth_hash = derive_keys("blue-Harbor-2026-quiet", salt)
assert auth_hash_hex("blue-Harbor-2026-quiet", salt) == auth_hash.hex()

# 导出一张离线钥匙卡
payload = kc_encrypt("blue-Harbor-2026-quiet", "S3cr3t-Entry-01!")
print(encode_token(payload["ctHex"], ["letter", "poem", "number"]))

# 日后用同一主密码还原
assert kc_decrypt("blue-Harbor-2026-quiet", payload) == "S3cr3t-Entry-01!"
```

**两个长度常量千万别混用**：钥匙卡 `iv` 是 `KEYCARD_IV_LEN = 16` 字节（32 hex），
保险箱 `iv` 是 `VAULT_IV_LEN = 12` 字节（24 hex）；两者 `salt` 都是 16 字节。

---

## 7. CI 如何使用本包

工作流在**仓库根**的 [`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml)
（GitHub 只认仓库根的 `workflows/` 目录）。它的 `detect` job 会探测
`CipherVault-App/packages/ciphervault-core/pyproject.toml` 是否存在，据此输出 `core` flag；
后 4 个 job 都以 `needs.detect` + flag 为条件，所以目录尚未创建时会自动跳过、不会出现红叉。

| job | 触发条件 | 对本包做什么 |
|---|---|---|
| `core` | `core == '1'`，且 `packages/`、`tools/` 有变更 | `pip install -e ".[dev]"` → `python -m ruff check .` → `python -m pytest -q` |
| `contracts` | `core == '1'`（**每次推送都跑**） | `pip install -e ".[dev]"` → `python -m ciphervault_core.vectors --verify vectors.json` |

`contracts` 是跨语言一致性的守门人：只要本库或前端任何一方偏离了 `docs/ALGORITHM.md`，
逐字节复现就会失败、job 变红。

---

## 8. 常见坑（改动本包前请逐条自查）

摘自任务书第 9.2 节，全部已被 `tests/` 覆盖：

1. `iv` 长度：钥匙卡 **16** 字节、保险箱 **12** 字节，不可混用；
2. `salt` 16 字节，`pbkdf2_hmac` 的 `dklen` 是 **64**；
3. 切分顺序：`ENC = dk[:32]`、`MAC = dk[32:]`（不是反过来）；
4. `uint32be(counter)` = `counter.to_bytes(4, "big")`，counter 从 **0** 开始；
5. `tag = HMAC(MAC, iv ‖ ct)`，**不是** `iv ‖ pt`，也**不是** `ct ‖ iv`；
6. 解密**先验 tag，再解密**；
7. 空明文 ⇒ `ct` 为空串，但 tag **仍必须计算**；
8. hex 全项目统一**小写**（解析可容忍大写，输出必须小写）；
9. `SEP` 是 U+00B7 `·`，不是 ASCII 句点；`POEMS` 恰好 16 句、互不相同；
10. `number` 映射是两位字符串 `"10"`…`"25"`；
11. `letter` 解码只取首字符 `ord(ch) - 65`；`poem` 解码查表取下标；
12. 第 `i` 个半字节用 `rules[i % len(rules)]`；
13. 密码按 UTF-8 编码，异或按**字节**操作；
14. 运行时 `dependencies = []`；`pytest`/`ruff` 只在 `[dev]` 里；
15. `vectors.json` 只读，不得修改其内容（连格式化、字段顺序都不许动）。
