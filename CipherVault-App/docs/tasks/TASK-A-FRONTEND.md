# 任务书 A：前端（Frontend）

> 项目：CipherVault ｜ 角色：组员 A（前端负责人）
> 状态：v1.0 ｜ 适用工作目录：`CipherVault-App/`
> 本任务书由项目负责人签发。**本文件自包含**，你无需参考任何其他资料即可开工；但 `docs/CONTRACTS.md`、`docs/ALGORITHM.md` 是**冻结的权威来源**，若本文件与其冲突，以 docs/ 为准并立即向负责人报告。

---

## 1. 任务概述与你的角色

你是 CipherVault 正式产品的**前端负责人（组员 A）**。原型已经完成（仓库根 `mvp/` 下的单文件 HTML），现在要把它升级为可交付、可协作、可长期演进的正式产品，前端代码全部放在 `CipherVault-App/frontend/`。

你负责**全部前端工作**，且**本项目所有加解密都发生在前端**：React 18 + TypeScript + Vite 构建的 SPA，用浏览器原生 `window.crypto.subtle` 实现全部加密算法规格，负责 UI/交互、钥匙卡生成、以及与后端 API 的注册/登录/同步。

**交付物**：一套可在 `CipherVault-App/frontend/` 下 `npm install && npm run build` 通过的前端工程（含全部源码与测试），已提交并推送到 `origin/main`。

**验收标准（一句话）**：`npm install`、`npm run lint`、`npm run test -- --run`、`npm run build` 全部通过，且 `vectors.test.ts` 与 `packages/ciphervault-core/vectors.json` 逐字节一致；手动跑通「首次设置主密码 → 新增条目 → 看到趣味密文 → 下载 HTML/Python 钥匙卡 → 重新解锁数据仍在 → 与后端注册/登录/同步成功」。

---

## 2. 前置准备

在开始写代码前，**按顺序执行**以下步骤（命令可直接复制）：

```bash
# 1. 进入已克隆的仓库根目录（若尚未克隆，先克隆）
#    若本地没有仓库：
git clone https://github.com/zlzhangliang666/CipherVault.git
cd CipherVault

# 2. 若本地已有仓库，先更新到最新（尤其确保拿到最新的 docs/ 与 vectors.json）
git fetch origin
git pull --rebase origin main

# 3. 进入前端工作目录（你在本目录内工作）
cd CipherVault-App

# 4. 确认冻结的契约与算法文件已就位
#    应有且仅有以下文件：
#      docs/CONTRACTS.md        接口契约（冻结 v1.0）
#      docs/ALGORITHM.md        加密算法规格（冻结 v1.0）
#      docs/ARCHITECTURE.md     架构与安全模型
#    以及跨语言测试向量（你的 vectors.test.ts 依赖它）：
#      packages/ciphervault-core/vectors.json
ls docs packages/ciphervault-core
```

**就位检查清单**：

- 当前分支为 `main`，且 `git status` 干净。
- `docs/CONTRACTS.md`、`docs/ALGORITHM.md`、`packages/ciphervault-core/vectors.json` 三者都存在。
- 你**只能**在 `CipherVault-App/frontend/` 下创建/修改文件（见第 10 节）。

---

## 3. 项目背景与整体架构

### 3.1 产品目标

把「密码保险箱」做成**可部署、可多人协作、可长期演进**的正式产品，同时保留原型两大卖点：

1. **强加密打底**（真实安全性）
2. **趣味皮肤外壳 + 离线钥匙卡**（好玩、可分享、可带走）

### 3.2 组件与职责

| 组件 | 技术 | 职责 | 与你的关系 |
|---|---|---|---|
| `frontend/` | React 18 + TypeScript + Vite + zustand | **全部加密**、UI、钥匙卡生成、与后端同步 | **你负责** |
| `backend/` | Python 3.11 + FastAPI + SQLAlchemy + SQLite + JWT | 账号、登录校验、密文 blob 存储与版本控制 | 只读，调用其 API |
| `packages/ciphervault-core/` | Python 3.11（纯标准库） | 算法规格落地、跨语言测试向量、离线解密 CLI | 只读，用其 `vectors.json` |
| `docker/` + `docker-compose.yml` | Docker | 一键起前后端 | 只读 |
| `.github/workflows/ci.yml` | GitHub Actions | 三组件各自独立 CI | 只读 |

### 3.3 零知识安全模型：信任边界

前端承担**全部加密**。主密码、明文、`vaultKey` 永不离开用户设备。

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

**三条铁律**

| # | 规则 | 原因 |
|---|---|---|
| R1 | 主密码、明文、`vaultKey` **绝不允许**出现在任何 HTTP 请求体 / URL / 日志中 | 服务器被攻破也不泄露密码 |
| R2 | 服务器只存 `authHash` 的再哈希（`sha256(PEPPER + authHash)`）与密文 blob | 数据库泄露不能直接登录，也不能解密 |
| R3 | 所有加密/解密逻辑只在 `frontend/` 与 `packages/ciphervault-core/` 中实现，且必须与 `docs/ALGORITHM.md` 完全一致 | 避免两套实现产生不兼容密文 |

### 3.4 关键数据流（你要实现的部分）

**注册**
1. 前端生成随机 `kdfSalt`(16B)，由主密码派生 `dk`(64B) → `vaultKey`、`authHash`
2. 上报 `{email, authHash, kdfSalt, kdfIters}`；服务器存 `authHash` 的再哈希
3. 前端用 `vaultKey` 加密空保险箱，`PUT /vault` 首次写入

**登录**
1. 前端 `GET /auth/kdf?email=` 取回 `kdfSalt`/`kdfIters`
2. 本地重新派生 `authHash` → `POST /auth/login` → 拿到 JWT
3. 本地用同一主密码派生 `vaultKey`，`GET /vault` 拉密文并在内存中解密

**同步**
- 客户端把整库加密成一个 blob 上传，`baseVersion` 做乐观并发控制，冲突返回 `409`，前端提示用户选择保留哪一份。

**钥匙卡**
- 前端用「主密码」派生密钥，加密「条目密码」，生成 `keycard_<名称>.html` 与 `ciphervault_keycard_<名称>.py`。
- 两者都用同一套 `PBKDF2 + HMAC-SHA256 流加密 + HMAC 校验`，可互相验证、且可脱离本项目运行。

---

## 4. 接口契约速查（内嵌，权威）

> 以下内容**原文照抄**自 `docs/CONTRACTS.md`（v1.0 已冻结）。**禁止**增删字段、改名端点、变更编码方式。

### 4.0 通用约定

| 项 | 约定 |
|---|---|
| Base URL | `/api/v1` |
| 内容类型 | `application/json; charset=utf-8` |
| 字段命名 | **一律 camelCase** |
| 二进制编码 | **一律十六进制小写字符串（hex）**，全项目统一，不用 base64 |
| 认证 | `Authorization: Bearer <jwt>` |
| 时间 | ISO8601 UTC，例 `2026-10-20T12:00:00Z` |
| 错误格式 | `{"error":{"code":"<CODE>","message":"<人类可读>","detail":{...}}}` |
| 版本 | 响应头 `X-API-Version: 1` |

**统一错误码**

| code | HTTP | 含义 |
|---|---|---|
| `USER_NOT_FOUND` | 404 | 预登录查不到邮箱 |
| `EMAIL_EXISTS` | 409 | 邮箱已注册 |
| `INVALID_CREDENTIALS` | 401 | authHash 不匹配 |
| `UNAUTHORIZED` | 401 | token 缺失/过期/无效 |
| `VAULT_EMPTY` | 404 | 该用户还没有保险箱 |
| `VERSION_CONFLICT` | 409 | 乐观并发冲突，`detail.currentVersion` 给出服务端当前版本 |
| `VALIDATION_ERROR` | 422 | 请求体校验失败，`detail.fields` 给出字段错误 |

### 4.1 六个端点（原文）

**1.1 `GET /api/v1/health`** — 无需认证。

```json
// 200
{ "status": "ok", "version": "0.1.0" }
```

**1.2 `GET /api/v1/auth/kdf?email=<email>` — 预登录（取盐）**

前端必须先拿到 `kdfSalt` 才能在本地派生 `authHash`。

```json
// 200
{ "kdfSalt": "a1b2c3d4e5f60718293a4b5c6d7e8f90", "kdfIters": 200000 }

// 404
{ "error": { "code": "USER_NOT_FOUND", "message": "用户不存在" } }
```

- `kdfSalt`：hex，16 字节 → 32 个 hex 字符
- `kdfIters`：整数

**1.3 `POST /api/v1/auth/register`**

```json
// 请求
{
  "email": "alice@example.com",
  "authHash": "<hex, 32 字节 → 64 字符>",
  "kdfSalt": "<hex, 16 字节 → 32 字符>",
  "kdfIters": 200000
}

// 201
{ "userId": "9f1c2a7b3d4e5f60718293a4b5c6d7e8" }

// 409
{ "error": { "code": "EMAIL_EXISTS", "message": "该邮箱已注册" } }
```

- 服务器对 `authHash` 再做一次 `sha256(PEPPER + authHash)` 后落库，**不存原文**。
- `email` 统一小写去空格后存储。

**1.4 `POST /api/v1/auth/login`**

```json
// 请求
{ "email": "alice@example.com", "authHash": "<hex, 64 字符>" }

// 200
{ "token": "<jwt>", "userId": "9f1c...", "expiresIn": 86400 }

// 401
{ "error": { "code": "INVALID_CREDENTIALS", "message": "邮箱或主密码不正确" } }
```

**1.5 `GET /api/v1/vault` — 拉取密文**（需要 Bearer）

```json
// 200
{ "version": 3, "iv": "<hex, 12 字节 → 24 字符>", "ct": "<hex>", "updatedAt": "2026-10-20T12:00:00Z" }

// 404
{ "error": { "code": "VAULT_EMPTY", "message": "尚未创建保险箱" } }
```

**1.6 `PUT /api/v1/vault` — 上传密文（乐观并发）**

```json
// 请求
{ "baseVersion": 3, "iv": "<hex, 24 字符>", "ct": "<hex>" }

// 200（version 自增）
{ "version": 4, "updatedAt": "2026-10-20T12:05:00Z" }

// 409
{ "error": { "code": "VERSION_CONFLICT", "message": "版本冲突", "detail": { "currentVersion": 5 } } }
```

- 首次写入：`baseVersion = 0`，服务端从 `version = 1` 开始。
- `baseVersion` 与库中 `version` 不一致即返回 409，不做自动合并。

### 4.2 数据模型（原文）

```sql
CREATE TABLE users (
  id         TEXT    PRIMARY KEY,              -- uuid4 hex
  email      TEXT    NOT NULL UNIQUE,          -- 小写
  auth_hash  TEXT    NOT NULL,                 -- hex( sha256( PEPPER + authHashHex ) )
  kdf_salt   TEXT    NOT NULL,                 -- hex, 16B
  kdf_iters  INTEGER NOT NULL,                 -- 默认 200000
  created_at TEXT    NOT NULL                  -- ISO8601 UTC
);

CREATE TABLE vaults (
  user_id    TEXT    PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  version    INTEGER NOT NULL DEFAULT 1,
  iv         TEXT    NOT NULL,                 -- hex, 12B
  ct         TEXT    NOT NULL,                 -- hex
  updated_at TEXT    NOT NULL
);
```

### 4.3 `frontend/src/api/client.ts` 必须实现的函数签名与 TS 接口（原文照抄）

```ts
export interface KdfResponse { kdfSalt: string; kdfIters: number }
export interface RegisterRequest { email: string; authHash: string; kdfSalt: string; kdfIters: number }
export interface RegisterResponse { userId: string }
export interface LoginResponse { token: string; userId: string; expiresIn: number }
export interface VaultBlob { version: number; iv: string; ct: string; updatedAt: string }
export interface VaultPutRequest { baseVersion: number; iv: string; ct: string }
export interface ApiErrorBody { error: { code: string; message: string; detail?: unknown } }

export function health(): Promise<{ status: string; version: string }>
export function getKdf(email: string): Promise<KdfResponse>
export function register(req: RegisterRequest): Promise<RegisterResponse>
export function login(email: string, authHash: string): Promise<LoginResponse>
export function getVault(token: string): Promise<VaultBlob | null>   // 404 → null
export function putVault(token: string, req: VaultPutRequest): Promise<{ version: number; updatedAt: string }>
```

**约定**

- `getVault` 遇到 `404 VAULT_EMPTY` 返回 `null`，其它错误抛 `ApiError`。
- 所有非 2xx 统一抛 `ApiError { code, message, status, detail }`。
- `VITE_API_BASE` 环境变量提供 base（默认 `http://localhost:8000/api/v1`；容器内为 `/api/v1`）。

### 4.4 内部数据形状（前后端各自内存中使用，**不经过网络**）

```ts
interface Entry {
  id: string; name: string; account: string; password: string;
  category: string; notes: string; fav: boolean; ts: number;
  skin: { name: string; rules: Array<'letter' | 'number' | 'poem'> };
}
interface VaultDoc {
  entries: Entry[];
  categories: string[];
  settings: { autoLockMin: number; clipboardClearSec: number };
}
```

> `VaultDoc` 序列化后由 `vaultKey` 加密，**只有密文上云**。

---

## 5. 加密算法速查（内嵌，权威）

> 以下内容**原文照抄**自 `docs/ALGORITHM.md`（v1.0 已冻结）。
> **统一编码：所有二进制一律用十六进制小写字符串（hex），全项目统一。**
> 你**不得**自行发明、改动或「优化」任何字段名、常量、算法参数。必须使用浏览器原生 `window.crypto.subtle`，**禁止引入任何加密库**。

### 5.1 密钥派生（第 1 节）

```
dk = PBKDF2-HMAC-SHA256( password = UTF8(主密码), salt = kdfSalt(16B), iterations = kdfIters, dkLen = 64 )

vaultKey = dk[0:32]        // AES-GCM-256 密钥，仅存于客户端内存，绝不上传
authHash = hex(dk[32:64])  // 64 个 hex 字符，用于登录校验，可上传
```

- `kdfSalt`：注册时客户端生成，`crypto.getRandomValues(new Uint8Array(16))`
- `kdfIters`：默认 **200000**，注册后不可变更（改主密码流程本版不做）
- 一次 PBKDF2 同时得到「加密密钥」与「登录校验值」，二者由同一 64 字节输出切分而来，互不干扰
- **服务器只存** `kdfSalt`、`kdfIters` 与 `sha256(PEPPER + authHash)`；**永不接触主密码与 vaultKey**

### 5.2 保险箱（整库）加解密（第 2 节）

```
pt = UTF8(JSON.stringify(VaultDoc))          // 明文只在内存
iv = 12B 随机                                  // crypto.getRandomValues
ct = AES-GCM-256(key = vaultKey, iv, pt)      // WebCrypto 输出 = 密文 ‖ 16B 认证标签
上传 = { iv: hex(iv), ct: hex(ct), baseVersion }
```

- **只有前端解密保险箱**；后端与核心库都不解密（后端只见密文 blob）。
- `iv` 每次上传都必须重新随机生成，禁止复用。
- 解密失败（标签不匹配，通常是主密码错误）→ 前端提示「主密码不正确或数据已损坏」。

### 5.3 钥匙卡载荷（第 3 节，跨语言必须逐位一致）

> 这是本项目唯一需要「浏览器 ↔ Python」双向兼容的算法，**必须严格实现**。
> 只使用 WebCrypto 的 PBKDF2 / HMAC，**不依赖任何第三方加密库**。

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
   （JS: 逐字节异或累加后判 0）
   不匹配 → 抛出「主密码不正确」
2. 再还原：pt[i] = ct[i] XOR ks[i]，UTF8 解码
```

> **顺序不能反**：必须先验 tag 再解密，避免对伪造数据做无用计算与信息泄露。

### 5.4 趣味皮肤（第 4 节，逐字照抄，不改一字）

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
| `letter` | n | `String.fromCharCode(65 + n)` → `A`…`P` |
| `number` | n | `String(n + 10)` → `"10"`…`"25"` |
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

### 5.5 钥匙卡两种产物（第 5 节）

| 产物 | 文件名 | 运行方式 |
|---|---|---|
| HTML | `keycard_<名称>.html` | 双击用浏览器打开，输入主密码 → 显示条目密码（WebCrypto 实现） |
| Python | `ciphervault_keycard_<名称>.py` | `python ciphervault_keycard_<名称>.py`，按提示输入主密码 |

**Python 钥匙卡硬性要求（你的 `buildPy.ts` 必须生成满足这些要求的源码）**

- **只允许** `hashlib`、`hmac`、`json`、`sys`、`getpass` 等标准库；**不得** import `cryptography` / `pycryptodome`
- 文件首行 `# -*- coding: utf-8 -*-`，并在 `main()` 内 `sys.stdout.reconfigure(encoding="utf-8")`（Windows 控制台必需）
- 载荷以 JSON 字面量内嵌在文件里，**无需外部依赖、无需联网、脱离本项目可运行**
- 输出必须同时给出「原始密码」与「趣味皮肤显示串」

**HTML 钥匙卡硬性要求（你的 `buildHtml.ts` 必须生成满足这些要求的文件）**

- 单文件、零外部依赖；必须能检测 `window.crypto?.subtle` 不可用时给出明确提示（`file://` 下现代浏览器可用）

### 5.6 测试向量（`packages/ciphervault-core/vectors.json`）

固定 `salt` / `iv` 以得到**确定性**输出。文件共 4 条向量，字段为：`name`、`note`、`masterPassword`、`entryPassword`、`saltHex`、`ivHex`、`iters`、`authHashHex`、`vaultKeyHex`、`ctHex`、`tagHex`、`display`、`skin{name, rules, poems, sep}`。

| name | skin.rules | masterPassword | entryPassword | saltHex | ivHex |
|---|---|---|---|---|---|
| `vec-01-mixed` | `["letter","poem","number"]` | `blue-Harbor-2026-quiet` | `S3cr3t-Entry-01!` | `101112131415161718191a1b1c1d1e1f` | `a0a1a2a3a4a5a6a7a8a9aaabacadaeaf` |
| `vec-02-poem` | `["poem"]` | `quiet-Meadow-2026-lantern` | `Abc123!@#` | `202122232425262728292a2b2c2d2e2f` | `b0b1b2b3b4b5b6b7b8b9babbbcbdbebf` |
| `vec-03-letter` | `["letter"]` | `amber-River-2026-candle` | `0f9A-kQ2!z` | `303132333435363738393a3b3c3d3e3f` | `c0c1c2c3c4c5c6c7c8c9cacbcccdcecf` |
| `vec-04-number` | `["number"]` | `silver-Pine-2026-orbit` | `Tr0ub4dor&3` | `404142434445464748494a4b4c4d4e4f` | `d0d1d2d3d4d5d6d7d8d9dadbdcdddedf` |

上表仅便于你速查；**`ctHex`、`tagHex`、`authHashHex`、`vaultKeyHex`、`display` 一律以 `packages/ciphervault-core/vectors.json` 文件内容为准**，测试代码必须直接 `JSON.parse` 该文件，不得手抄。

> 注意：向量里的 `display` 使用 UTF-8 明文中的中间点 `·`（U+00B7），分隔符常量 `SEP = "·"` 必须与你实现的完全一致。

**验收要求**

1. 用 `masterPassword` 解 `ctHex`+`tagHex` → 必须得到 `entryPassword`
2. 用错误主密码解 → 必须被 tag 校验拒绝（抛错，而不是返回乱码）
3. 用 `saltHex`/`ivHex`/`entryPassword` 重新加密 → `ctHex`、`tagHex` **逐字节相同**
4. `encodeToken(ctHex, skin.rules)` → 必须等于 `display`；`decodeToken(display, …)` → 必须还原 `ctHex`

### 5.7 参考实现要点（原文）

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

## 6. 你的交付清单（精确到目录与文件名）

**工作根目录**：`CipherVault-App/`。下列路径**均相对于 `CipherVault-App/`**。一个都不能少、也不要多加。

```
CipherVault-App/frontend/
├─ package.json              依赖与 scripts（dev/build/lint/test）
├─ package-lock.json         由 npm install 生成，必须提交
├─ vite.config.ts            Vite 配置 + vitest 配置
├─ tsconfig.json / tsconfig.node.json
├─ index.html
├─ .env.example              VITE_API_BASE=http://localhost:8000/api/v1
├─ README.md                 前端如何启动/构建/测试
└─ src/
   ├─ main.tsx               挂载入口
   ├─ App.tsx                路由与整体壳层（引导→解锁→主界面）
   ├─ styles/tokens.css      浅色设计系统的 CSS 变量（颜色/间距/圆角/阴影/字号）
   ├─ styles/global.css      全局样式重置与基础排版
   ├─ lib/id.ts              生成条目 id
   ├─ lib/hex.ts             hex ↔ Uint8Array、hex ↔ 字符串互转等工具
   ├─ crypto/kdf.ts          第1节密钥派生：PBKDF2 派生 vaultKey 与 authHash
   ├─ crypto/vault.ts        第2节：AES-GCM-256 整库加解密
   ├─ crypto/stream.ts       第3节：HMAC-SHA256 密钥流 + tag 校验（钥匙卡载荷）
   ├─ crypto/skin.ts         第4节：趣味皮肤 encodeToken / decodeToken / XF / POEMS / SEP
   ├─ crypto/strength.ts     密码强度评分（长度/字符集/重复度）
   ├─ crypto/generator.ts    内置密码生成器
   ├─ crypto/vectors.test.ts ★ 读取 ../../../packages/ciphervault-core/vectors.json 做跨语言一致性测试
   ├─ keycard/buildHtml.ts   生成单文件 HTML 钥匙卡（零外部依赖）
   ├─ keycard/buildPy.ts     生成 stdlib-only 的 Python 钥匙卡 .py 源码
   ├─ api/client.ts          严格实现契约里的 6 个函数
   ├─ api/types.ts           契约里的 TS 接口类型
   ├─ state/session.ts       主密码/token/vaultKey 的内存态与会话
   ├─ state/vaultStore.ts    zustand：条目增删改查、分类、设置、自动锁定
   ├─ pages/Onboarding.tsx   ★ 首次进入用**通俗语言**解释「主密码是什么」再让用户设置
   ├─ pages/Unlock.tsx       输入主密码解锁
   ├─ pages/Vault.tsx        条目列表/搜索/排序/收藏/分类
   ├─ pages/Settings.tsx     自动锁定分钟数、剪贴板清空秒数、备份导入导出、修改服务地址
   ├─ pages/Help.tsx         使用说明与安全说明
   ├─ components/Sidebar.tsx        分类导航
   ├─ components/Toolbar.tsx       搜索/排序/新建
   ├─ components/EntryCard.tsx     列表项
   ├─ components/EntryDrawer.tsx   条目详情与编辑
   ├─ components/CipherKeycard.tsx ★ 展示「趣味密文显示串」+ 下载 HTML/Python 钥匙卡
   ├─ components/StrengthMeter.tsx 强度条
   ├─ components/Toast.tsx / Modal.tsx / ConfirmDialog.tsx
   └─ src/tests/ skin.test.ts / vault.test.ts / api.test.ts
```

**逐文件职责表**

| 文件（相对 `CipherVault-App/frontend/`） | 做什么 | 导出什么 | 依赖哪个文件 |
|---|---|---|---|
| `package.json` | 依赖与 scripts（`dev`/`build`/`lint`/`test`） | — | — |
| `package-lock.json` | `npm install` 自动生成，必须提交 | — | — |
| `vite.config.ts` | Vite + vitest 配置（environment: jsdom，setupFiles 如需要） | `defineConfig` 默认导出 | `package.json` 依赖 |
| `tsconfig.json` / `tsconfig.node.json` | TS 编译选项（strict、jsx react-jsx、moduleResolution bundler） | — | — |
| `index.html` | Vite HTML 入口，挂载 `#root` | — | `src/main.tsx` |
| `.env.example` | 环境变量样例 | — | — |
| `README.md` | 前端启动/构建/测试说明 | — | — |
| `src/main.tsx` | 把 `App` 挂载到 `#root`，引入全局与 token 样式、字体栈 | — | `App.tsx`、`styles/*.css` |
| `src/App.tsx` | 路由与整体壳层：引导 → 解锁 → 主界面；未解锁不得渲染保险箱 | `App`（默认） | `session.ts`、`pages/*` |
| `src/styles/tokens.css` | **浅色**设计系统 CSS 变量：颜色/间距/圆角/阴影/字号 | CSS 变量 | 无 |
| `src/styles/global.css` | 全局样式重置与基础排版；**本地字体栈，禁止外网 CDN 字体** | — | `tokens.css` |
| `src/lib/id.ts` | 生成条目 id | `newId()` | 无（用 `crypto.getRandomValues`，**禁止** `Math.random`） |
| `src/lib/hex.ts` | hex ↔ `Uint8Array`、hex ↔ 字符串、`uint32be` 等工具 | `hexToBytes`、`bytesToHex`、`concatBytes`、`uint32be` 等 | 无 |
| `src/crypto/kdf.ts` | 第 1 节：PBKDF2-HMAC-SHA256 派生 64B，切出 `vaultKey`(0:32) 与 `authHash`=hex(32:64) | `deriveVaultKey`、`deriveAuthHash`/`deriveDk`、`randomSalt16()` | `lib/hex.ts` |
| `src/crypto/vault.ts` | 第 2 节：AES-GCM-256 整库加解密，`iv` 12B 随机，输出含 16B tag 的密文 | `encryptVault(vaultKey, doc)`、`decryptVault(vaultKey, ivHex, ctHex)` | `lib/hex.ts` |
| `src/crypto/stream.ts` | 第 3 节：HMAC-SHA256 密钥流 + tag 恒定时间校验（钥匙卡载荷） | `keycardEncrypt`、`keycardDecrypt`、`constantTimeEqual` | `crypto/kdf.ts`、`lib/hex.ts` |
| `src/crypto/skin.ts` | 第 4 节：趣味皮肤；含常量 `SEP`、`POEMS`、映射表 `XF` | `SEP`、`POEMS`、`XF`、`encodeToken`、`decodeToken` | `lib/hex.ts` |
| `src/crypto/strength.ts` | 密码强度评分（长度/字符集/重复度） | `scorePassword(pw): { score: 0..4, label: string }` | 无 |
| `src/crypto/generator.ts` | 内置密码生成器（可选字符集、长度，用 `crypto.getRandomValues`） | `generatePassword(opts)` | 无 |
| `src/crypto/vectors.test.ts` ★ | 读 `../../../packages/ciphervault-core/vectors.json` 做 4 条向量的跨语言一致性测试 | 测试用例 | `stream.ts`、`kdf.ts`、`skin.ts` |
| `src/keycard/buildHtml.ts` | 生成单文件 HTML 钥匙卡，内嵌载荷与 WebCrypto 解密逻辑 | `buildKeycardHtml(payload, name, display)` | `crypto/stream.ts` 载荷类型 |
| `src/keycard/buildPy.ts` | 生成 stdlib-only 的 `.py` 源码（含载荷 JSON 字面量、`# -*- coding: utf-8 -*-`、`reconfigure`） | `buildKeycardPy(payload, name, display)` | `crypto/stream.ts` 载荷类型 |
| `src/api/client.ts` | **严格**实现契约 4.3 的 6 个函数，`VITE_API_BASE` 作为 base | `health`、`getKdf`、`register`、`login`、`getVault`、`putVault`、`ApiError` | `api/types.ts` |
| `src/api/types.ts` | 契约里的 TS 接口类型 | `KdfResponse`、`RegisterRequest`、`RegisterResponse`、`LoginResponse`、`VaultBlob`、`VaultPutRequest`、`ApiErrorBody` | 无 |
| `src/state/session.ts` | 主密码/token/vaultKey 的**内存态**与会话管理（锁定即清除） | `useSession`（zustand store 或模块单例） | 无 |
| `src/state/vaultStore.ts` | zustand：条目增删改查、分类、设置、自动锁定、同步（`baseVersion` 乐观并发） | `useVaultStore` | `api/client.ts`、`crypto/vault.ts`、`state/session.ts` |
| `src/pages/Onboarding.tsx` ★ | 首次进入用**通俗语言**解释「主密码是什么」（唯一、不可找回、决定一切），再让用户设置并确认 | `Onboarding` | `crypto/kdf.ts`、`state/*` |
| `src/pages/Unlock.tsx` | 输入主密码解锁：`getKdf` → 本地派生 `authHash` → `login` → 派生 `vaultKey` → `getVault` → 解密 | `Unlock` | `api/client.ts`、`crypto/kdf.ts`、`state/*` |
| `src/pages/Vault.tsx` | 条目列表/搜索/排序/收藏/分类 | `Vault` | `components/*`、`state/vaultStore.ts` |
| `src/pages/Settings.tsx` | 自动锁定分钟数、剪贴板清空秒数、备份导入导出、修改服务地址 | `Settings` | `state/vaultStore.ts`、`api/client.ts` |
| `src/pages/Help.tsx` | 使用说明与安全说明 | `Help` | 无 |
| `src/components/Sidebar.tsx` | 分类导航 | `Sidebar` | `state/vaultStore.ts` |
| `src/components/Toolbar.tsx` | 搜索/排序/新建 | `Toolbar` | 无 |
| `src/components/EntryCard.tsx` | 列表项 | `EntryCard` | `api/types.ts` 的 `Entry` |
| `src/components/EntryDrawer.tsx` | 条目详情与编辑 | `EntryDrawer` | `crypto/strength.ts`、`state/vaultStore.ts` |
| `src/components/CipherKeycard.tsx` ★ | 展示「趣味密文显示串」+ 下载 HTML/Python 钥匙卡 | `CipherKeycard` | `crypto/skin.ts`、`crypto/stream.ts`、`keycard/buildHtml.ts`、`keycard/buildPy.ts` |
| `src/components/StrengthMeter.tsx` | 强度条 | `StrengthMeter` | `crypto/strength.ts` |
| `src/components/Toast.tsx` / `Modal.tsx` / `ConfirmDialog.tsx` | 轻提示 / 模态 / 确认框 | `Toast`、`Modal`、`ConfirmDialog` | 无 |
| `src/tests/skin.test.ts` | 皮肤 encode/decode 往返、越界报错 | 测试用例 | `crypto/skin.ts` |
| `src/tests/vault.test.ts` | AES-GCM 加解密往返、错误密钥报错 | 测试用例 | `crypto/vault.ts` |
| `src/tests/api.test.ts` | 用 mock fetch 覆盖 6 端点与错误码（尤其 `404 VAULT_EMPTY → null`） | 测试用例 | `api/client.ts` |

> ★ 标为关键文件，验收时必须存在且行为正确。

---

## 7. 技术栈与依赖

| 项 | 版本 / 要求 |
|---|---|
| React | **18.3** |
| TypeScript | **5.4** |
| Vite | **5** |
| 状态管理 | `zustand` **4.5** |
| 测试 | `vitest` **1.5**（配 `jsdom`、`@testing-library/react`） |
| 代码检查 | ESLint **8** |

**硬性约束**

- **不得引入任何加密库**（`crypto-js`、`tweetnacl`、`node-forge` 等一律禁止）——必须使用浏览器原生 `window.crypto.subtle`。
- **不得依赖外网 CDN 字体**，字体使用本地可用字体栈。
- 样式用**浅色**设计系统（`styles/tokens.css` 定义 CSS 变量），不引入 CSS 框架也可，若引入需说明理由。

---

## 8. 必须通过的自测与验收标准

以下命令**在 `CipherVault-App/frontend/` 下执行**，可直接复制：

```bash
cd CipherVault-App/frontend

# 1) 安装依赖（成功即生成 package-lock.json，必须提交）
npm install

# 2) 代码检查：无 error
npm run lint

# 3) 单元测试：全绿
npm run test -- --run

# 4) 构建：成功产出 dist/
npm run build
```

**期望结果**

| 命令 | 期望 |
|---|---|
| `npm install` | 成功，生成 `package-lock.json` |
| `npm run lint` | **无 error** |
| `npm run test -- --run` | **全绿**（所有用例通过） |
| `npm run build` | 成功产出 `dist/` |

**`vectors.test.ts` 至少断言以下 4 条**（对应 5.6 与 `packages/ciphervault-core/vectors.json` 的 4 条向量）：

1. 用向量里的 `masterPassword` 解 `ctHex` + `tagHex` → 必须得到 `entryPassword`。
2. 用**错误**主密码解 → 必须被 tag 校验**拒绝**（抛错，而非返回乱码）。
3. 用固定 `saltHex` / `ivHex` 重新加密 `entryPassword` → 得到的 `ctHex`、`tagHex` 与向量**逐字节相同**。
4. `encodeToken(ctHex, skin.rules)` 等于向量里的 `display`；`decodeToken(display, skin.rules)` 还原回 `ctHex`。

**手动验收（必须全部走通）**

- [ ] 首次进入 → 用通俗语言解释「主密码是什么」→ 设置主密码 → 完成引导。
- [ ] 新增一条密码 → 能在详情里看到**趣味密文显示串**（皮肤切换会变显示、不变 `ctHex`）。
- [ ] 下载 HTML 钥匙卡与 Python 钥匙卡：HTML 双击可打开、输入主密码能还原条目密码；`.py` 用 `python ciphervault_keycard_<名称>.py` 能独立还原。
- [ ] 锁定后重新用主密码解锁 → 数据仍在。
- [ ] 与后端注册 / 登录 / 同步成功（`VITE_API_BASE=http://localhost:8000/api/v1`）。

---

## 9. 上传到 GitHub 的步骤

```bash
# 在仓库根目录（含 CipherVault-App/ 的那一层）执行
git status
git add CipherVault-App/frontend

# 提交信息规范：feat(frontend): ... 或 fix(frontend): ...
git commit -m "feat(frontend): 完成 CipherVault 前端（加密/UI/钥匙卡/同步）"

# 推送
git push origin main

# 若 push 被拒（远端有新提交），先变基再推
git pull --rebase origin main
git push origin main
```

**提交规范**

- 新功能：`feat(frontend): <简述>`
- 修复：`fix(frontend): <简述>`
- **只 add `CipherVault-App/frontend/` 下的文件**，不要 `git add -A`，避免误提交其它目录或敏感文件。
- 提交前确认 `git status` 里没有临时文件、`node_modules/`（应被 `.gitignore` 忽略）、`dist/`（构建产物不提交）。

---

## 10. 禁止事项与常见坑

**硬约束**

- 只允许改动 `CipherVault-App/frontend/**`，**禁止**修改 `docs/`、`packages/`、`backend/`、`docker/`、根目录任何文件。
- **主密码、明文、`vaultKey` 绝不发往服务器**；不得把它打印到 console 或写进 localStorage。
- `vaultKey` 仅在内存中保留，锁定/超时后清除。
- localStorage 只允许存放非敏感的 UI 偏好；保险箱数据一律以密文 blob 通过后端存取。
- 所有 `iv` / `salt` 必须来自 `crypto.getRandomValues`，**禁止** `Math.random()`。
- tag 比较必须**恒定时间**（逐字节异或累加后判 0）。
- 提交信息规范：`feat(frontend): ...` / `fix(frontend): ...`。
- 若 `packages/ciphervault-core/vectors.json` 与你的实现不一致：**先怀疑自己**，逐字节比对；确认是向量本身错了再上报负责人，**不得擅自改向量文件**。

**常见坑**

- 密钥卡 `iv` 是 **16 字节**，保险箱 `iv` 是 **12 字节**——千万别混用。
- `authHash` 必须用 `deriveBits` 取原始字节再 `hex()`，**不能用 `deriveKey`**（导不出字节）。
- `AES-GCM` 的 WebCrypto 输出 = 密文 ‖ 16B 认证标签；解密时 `iv` 必须与加密时完全一致。
- 密钥流 `HMAC(ENC, iv ‖ uint32be(counter))` 的 `counter` 从 **0** 开始、4 字节**大端**；明文更长时依次递增并串接。
- 空明文 ⇒ `ct` 为空串，但 `tag` **仍必须计算**。
- 皮肤 `encodeToken` 的 `rules` 按 **`i % rules.length`** 循环取用；`decodeToken` 必须逐段校验返回值落在 `0..15`，否则抛「第 (i+1) 段无法还原」。
- `SEP` 是 U+00B7 中间点 `·`，不是句点、不是 `-`；`POEMS` 必须恰好 16 句且与本文件 5.4 完全一致。
- 生成 Python 钥匙卡时注意 Windows 编码：首行 `# -*- coding: utf-8 -*-`，`main()` 内 `sys.stdout.reconfigure(encoding="utf-8")`。
- 生成 HTML 钥匙卡时必须检测 `window.crypto?.subtle`，不可用时给出明确提示。
- `getVault` 遇 `404 VAULT_EMPTY` 返回 `null`，其它非 2xx 一律抛 `ApiError { code, message, status, detail }`。

---

## 11. 完成后的自检清单

- [ ] `CipherVault-App/frontend/` 下第 6 节列出的**每个文件都已创建**，无遗漏、无多余。
- [ ] `npm install` 成功且 `package-lock.json` 已生成并纳入提交。
- [ ] `npm run lint` 无 error。
- [ ] `npm run test -- --run` 全绿；`vectors.test.ts` 覆盖 5.6 的 4 条验收断言（含错误主密码被拒、`ctHex`/`tagHex` 逐字节一致、`display` 一致）。
- [ ] `npm run build` 成功产出 `dist/`（且 `dist/` 未提交）。
- [ ] 全部加密通过 `window.crypto.subtle` 实现，工程内**无任何加密第三方库**。
- [ ] 无外网 CDN 字体；字体使用本地字体栈；样式为浅色设计系统。
- [ ] 任何 HTTP 请求体 / URL / 日志中**不含**主密码、明文、`vaultKey`、`authHash` 原文。
- [ ] 所有 `iv`/`salt` 来自 `crypto.getRandomValues`；tag 比较为恒定时间。
- [ ] `vaultKey` 仅存内存，锁定 / 超时 / 离开页面后清除。
- [ ] 手动验收 5 项全部走通（引导 → 新增 → 趣味密文 → 双格式钥匙卡 → 重新解锁 → 后端注册/登录/同步）。
- [ ] 仅改动 `CipherVault-App/frontend/**`；未触碰 `docs/`、`packages/`、`backend/`、`docker/`、根目录文件。
- [ ] 已用 `feat(frontend): ...` 规范提交并 `git push origin main` 成功。
- [ ] 已向负责人汇报完成情况（含 `vectors.test.ts` 结果与手测结论）。

---

> 有疑问时：**先查 `docs/CONTRACTS.md` 与 `docs/ALGORITHM.md`**；若仍不确定，向项目负责人报告，**不要自行发明字段、端点或算法参数**。
