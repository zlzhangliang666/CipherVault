# tools/ — 离线钥匙卡工具

两个**单文件、零第三方依赖**的 Python 脚本，只用标准库（`hashlib` / `hmac` / `json` /
`sys` / `getpass` / `os` / `argparse` / `re` / `pathlib`），拷到任何有 Python 3.11+ 的机器上都能直接跑，
**不需要**安装 `ciphervault-core`，也不需要联网。

| 脚本 | 作用 |
|---|---|
| [`reference_keycard.py`](reference_keycard.py) | **生成**钥匙卡：一次产出 `.py` 与 `.html` 两个版本 |
| [`keycard_cli.py`](keycard_cli.py) | **解密**钥匙卡：读入载荷 JSON，输出条目密码与趣味显示串 |

两者都严格实现 [`docs/ALGORITHM.md`](../docs/ALGORITHM.md) 第 3、4 节，
因此产物可与 [`packages/ciphervault-core/vectors.json`](../packages/ciphervault-core/vectors.json) 交叉核对。

> 以下命令都在 `CipherVault-App/` 目录下执行。

---

## 1. `reference_keycard.py` — 生成钥匙卡

产物文件名严格遵循 `docs/ALGORITHM.md` 第 5 节：

| 产物 | 文件名 | 运行方式 |
|---|---|---|
| HTML | `keycard_<名称>.html` | 双击用浏览器打开，输入主密码 → 显示条目密码（WebCrypto 实现） |
| Python | `ciphervault_keycard_<名称>.py` | `python ciphervault_keycard_<名称>.py`，按提示输入主密码 |

两种产物**载荷相同**，只是渲染方式不同。

### 命令行

```bash
python tools/reference_keycard.py --help

# 演示卡：固定使用 vectors.json 里 vec-01-mixed 的输入
#   主密码 blue-Harbor-2026-quiet、条目密码 S3cr3t-Entry-01!、混合皮肤、
#   其 saltHex / ivHex / iters(200000)
# 产出 ciphervault_keycard_demo.py 与 keycard_demo.html
python tools/reference_keycard.py --demo

# 自定义卡：salt / iv 用 os.urandom 现场随机生成，主密码与条目密码交互式输入
python tools/reference_keycard.py --name github --skin 混合皮肤

# 指定输出目录（默认当前目录）
python tools/reference_keycard.py --demo --out-dir build
```

| 参数 | 说明 |
|---|---|
| `--demo` | 用 `vec-01-mixed` 的固定输入生成演示卡，便于与基准向量逐字节核对 |
| `--name` | 卡片名称，决定输出文件名（默认 `my`；`--demo` 时为 `demo`）。只允许中英文、数字、`_`、`-`，长度 1-32 |
| `--skin` | `字母皮肤` / `古诗皮肤` / `数字皮肤` / `混合皮肤`（默认 `混合皮肤`） |
| `--iters` | PBKDF2 迭代次数（默认 `200000`；**不要**为了快而调低） |
| `--out-dir` | 输出目录（默认 `.`） |

### 输出示例

```
已生成两种钥匙卡（载荷相同，仅渲染方式不同）：
  Python : ciphervault_keycard_demo.py
  HTML   : keycard_demo.html

皮肤     : 混合皮肤（rules = ['letter', 'poem', 'number']）
迭代次数 : 200000
ctHex    : 16d7d477729b5ddc3bf5fecf11e036d6
tagHex   : 68a7ec9b1b7ee889a58c0315dc76a009b185783d9960dbff61a0330c2e41b8bd
显示串   : B·夜来风雨声·23·H·汗滴禾下土·14·…

人工验收：python ciphervault_keycard_demo.py    （在 . 下执行，输入主密码）
          双击 keycard_demo.html 用浏览器打开
```

退出码：`0` 成功、`1` 生成失败（名称非法、两次输入的条目密码不一致等）、`2` 参数错误。

### 人工验收（`--demo`）

```bash
python tools/reference_keycard.py --demo
python ciphervault_keycard_demo.py
# 输入 blue-Harbor-2026-quiet，必须打印：
#   原始密码：S3cr3t-Entry-01!
#   趣味皮肤显示串：B·夜来风雨声·23·…
# 输入错误主密码，必须打印「解密失败：主密码不正确」并返回退出码 1
```

在 Windows 控制台下中文与 `·` **不得乱码**：生成的 `.py` 首行是 `# -*- coding: utf-8 -*-`，
且 `main()` 内调用 `sys.stdout.reconfigure(encoding="utf-8")`（`stderr` 同样切到 UTF-8）。

### 生成物的硬性约束（已内置）

- **Python 卡片**：只用 `hashlib` / `hmac` / `json` / `sys` / `getpass`，**不得** import
  `cryptography` / `pycryptodome`；载荷以 JSON 字面量内嵌，脱离本项目可运行；
  输出同时给出「原始密码」与「趣味皮肤显示串」；解密**先恒定时间验 tag（`hmac.compare_digest`）再解密**。
- **HTML 卡片**：单文件、零外部依赖（无任何外链 `src` / `href`）；用 WebCrypto 的
  `PBKDF2 deriveBits` + `HMAC sign`；启动即检测 `window.crypto?.subtle`，不可用时给出明确提示
  而不是静默失败；tag 用「逐字节异或累加后判 0」做恒定时间比较。

> 生成的卡片文件落在 `--out-dir`（默认当前目录），**不属于源码**，验收后请自行删除，不要提交进仓库。

---

## 2. `keycard_cli.py` — 离线解密

给「手里只有一份载荷 JSON」的场景用：不生成卡片，直接把载荷还原成条目密码。

### 命令行

```bash
python tools/keycard_cli.py --help                 # 打印用法，退出码 0

# 内嵌载荷（取自 vectors.json 的 vec-01-mixed），开箱即试
python tools/keycard_cli.py --demo

# 从文件读载荷
python tools/keycard_cli.py keycard_payload.json

# 从 stdin 读载荷
type keycard_payload.json | python tools/keycard_cli.py -
```

| 参数 | 说明 |
|---|---|
| `PATH` | 钥匙卡载荷 JSON 文件路径；`-` 表示 stdin。与 `--demo` 互斥，二者必须给一个 |
| `--demo` | 使用脚本内嵌的示例载荷（`vec-01-mixed`，主密码 `blue-Harbor-2026-quiet`） |

### 输入：载荷 JSON

```json
{
  "name": "demo",
  "saltHex": "101112131415161718191a1b1c1d1e1f",
  "ivHex":   "a0a1a2a3a4a5a6a7a8a9aaabacadaeaf",
  "ctHex":   "16d7d477729b5ddc3bf5fecf11e036d6",
  "tagHex":  "68a7ec9b1b7ee889a58c0315dc76a009b185783d9960dbff61a0330c2e41b8bd",
  "iters":   200000,
  "skin":    { "name": "混合皮肤", "rules": ["letter", "poem", "number"] }
}
```

`skin` 可选：给了就顺便算出趣味显示串，没给则只输出条目密码。
多余的键会被忽略，所以 `vectors.json` 里的单条向量也能直接当载荷喂进来。

### 输出示例

```
钥匙卡：demo
原始密码：S3cr3t-Entry-01!
趣味显示串（混合皮肤）：B·夜来风雨声·23·H·汗滴禾下土·14·…
```

主密码错误时（stderr）：

```
解密失败：主密码不正确
```

退出码：`0` 成功、`1` 载荷或主密码错误、`2` 参数错误。

---

## 3. 安全约定

- **主密码只通过 `getpass` 交互式读取，不接受命令行参数**，避免落进 shell 历史或进程列表
  （铁律 R1：主密码、明文、`vaultKey` 绝不允许出现在任何 HTTP 请求体 / URL / 日志中）。
- 解密失败一律输出**固定文案**「主密码不正确」，不回显期望值、实际值或任何密钥材料。
- tag 比较必须**恒定时间**：Python 侧 `hmac.compare_digest`，JS 侧逐字节异或累加后判 0，禁止 `==` / `===`。
- 解密顺序**先验 tag、再解密**，顺序不能反。
- 生成新卡片时 `salt` / `iv` 一律用 `os.urandom`，禁止复用、禁止时间戳或 `Math.random()`。
- 卡片里只有**密文**，可以分享；主密码必须走另一条渠道。

---

## 4. 与核心库的关系

| | `tools/`（本目录） | `packages/ciphervault-core/` |
|---|---|---|
| 依赖 | 只用标准库，**不 import** `ciphervault_core` | 只用标准库，可 `pip install -e .` |
| 定位 | 脱离本项目即可运行的交付物 | 可测试的库 + 跨语言基准向量校验 CLI |
| 算法 | 各自独立实现同一份 `docs/ALGORITHM.md` | 同左 |

两边**故意**各写一遍算法：核心库有完整的单元测试守着，工具则证明「同一份规格能被独立实现
并得到逐字节相同的结果」。任何一边偏离规格，`--demo` 产物的 `ctHex` / `tagHex` 就会与
`vec-01-mixed` 不一致，立刻暴露。

想直接用库而不是脚本，见
[`packages/ciphervault-core/README.md`](../packages/ciphervault-core/README.md) 的
`python -m ciphervault_core.cli` 与 `python -m ciphervault_core.vectors` 两个入口。
