# 任务书 B —— 后端（FastAPI + SQLite + JWT）

> 交付人：组员 B ｜ 目录：`CipherVault-App/backend/`
> 契约版本：`docs/CONTRACTS.md` v1.0（已冻结）｜ 架构版本：`docs/ARCHITECTURE.md` v1.0
> 你（Qwen Code）的工作目录：**`CipherVault-App/`**，你只允许改动 **`CipherVault-App/backend/**`**。

---

## 1. 任务概述与你的角色

你是 CipherVault 项目的**后端工程师（组员 B）**。你要在已克隆好的仓库里，把 `CipherVault-App/backend/` 从零实现为一个可运行、可测试、可部署的 FastAPI 服务：**账号注册/登录 + 零知识密文 blob 的存取与版本控制**。

**一句话职责**：服务器只做「账号 + 密文保管箱」，永远不接触主密码、明文与 `vaultKey`。

**验收标准（你交付即必须满足）**：
1. `docs/CONTRACTS.md` 中的 **6 个端点**全部按原文实现，字段名、编码方式、状态码、错误码**逐字一致**；
2. `python -m ruff check .` 无 error，`python -m pytest -q` 全绿；
3. 用 `curl` 能走通「注册 → 登录 → 写入密文 → 读取密文 → 冲突 409」完整链路；
4. 代码提交并推送到 `main` 分支。

**禁止**自行发明、改动或「优化」任何端点、字段名、编码方式、状态码、错误码。凡本文件与 `docs/CONTRACTS.md` 不一致处，**以 `docs/CONTRACTS.md` 为准**，并立刻停下向负责人报告。

---

## 2. 前置准备

在仓库根目录（包含 `CipherVault-App/` 与 `mvp/` 的那一层）执行：

```powershell
# 1) 若尚未克隆
git clone https://github.com/zlzhangliang666/CipherVault.git
cd CipherVault

# 2) 若已克隆，先更新到最新，避免与他人冲突
git pull --rebase origin main

# 3) 进入产品子目录（本任务书所有相对路径均以此为基准）
cd CipherVault-App

# 4) 确认契约已就位（必须存在且为 v1.0）
Get-Content docs\CONTRACTS.md -TotalCount 5
```

你必须先通读这三个文件再动手：
- `docs/CONTRACTS.md` ——**接口契约，权威来源，你必须严格实现它**；
- `docs/ARCHITECTURE.md` —— 架构与零知识安全模型；
- `docs/ALGORITHM.md` —— 加密算法规格（**后端不解密**，但需理解客户端在做什么）。

确认 `CipherVault-App/backend/` 可创建（若不存在请新建该目录），且 `.gitignore` 已忽略 `.env` 与 `*.db`。

---

## 3. 项目背景与整体架构（简版）

**产品**：CipherVault —— 一个「既好玩又安全的密码保险箱」。原型是 `mvp/index.html`（单文件 HTML），现在升级为正式交付产品 `CipherVault-App/`。

**你的组件在系统中的位置**：`backend/` 只负责账号、登录校验、密文 blob 存储与版本控制；全部加解密在 `frontend/`（组员 A）与 `packages/ciphervault-core/`（组员 C）完成。

**零知识信任边界图**（服务器是「不可信」的密文保管箱）：

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

**你必须内化的三条铁律**：
| # | 规则 |
|---|---|
| R1 | 主密码、明文、`vaultKey` **绝不允许**出现在任何 HTTP 请求体 / URL / 日志中 |
| R2 | 服务器只存 `sha256(PEPPER + authHash)` 与密文 blob（`iv` / `ct`） |
| R3 | 后端**不做任何加解密、不做服务端解密、不做主密码找回** |

---

## 4. 你必须实现的接口（内嵌，权威）

> 本节内容**逐字照抄自 `docs/CONTRACTS.md`**。

### 4.0 通用约定

| 项 | 约定 |
|---|---|
| Base URL | `/api/v1` |
| 内容类型 | `application/json; charset=utf-8` |
| 字段命名 | **一律 camelCase**（Python 侧用 Pydantic `alias_generator` 映射，内部可 snake_case） |
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

> 说明：所有路由最终都必须挂在 `/api/v1` 前缀下（例如 `health.py` 里写 `GET /health`，挂载后对外即 `GET /api/v1/health`）。所有响应都必须带 `X-API-Version: 1` 响应头（用中间件统一加）。

### 4.1 `GET /api/v1/health`

无需认证。

```json
// 200
{ "status": "ok", "version": "0.1.0" }
```

### 4.2 `GET /api/v1/auth/kdf?email=<email>` — 预登录（取盐）

前端必须先拿到 `kdfSalt` 才能在本地派生 `authHash`。

```json
// 200
{ "kdfSalt": "a1b2c3d4e5f60718293a4b5c6d7e8f90", "kdfIters": 200000 }

// 404
{ "error": { "code": "USER_NOT_FOUND", "message": "用户不存在" } }
```

- `kdfSalt`：hex，16 字节 → 32 个 hex 字符
- `kdfIters`：整数

### 4.3 `POST /api/v1/auth/register`

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

### 4.4 `POST /api/v1/auth/login`

```json
// 请求
{ "email": "alice@example.com", "authHash": "<hex, 64 字符>" }

// 200
{ "token": "<jwt>", "userId": "9f1c...", "expiresIn": 86400 }

// 401
{ "error": { "code": "INVALID_CREDENTIALS", "message": "邮箱或主密码不正确" } }
```

### 4.5 `GET /api/v1/vault` — 拉取密文

需要 Bearer。

```json
// 200
{ "version": 3, "iv": "<hex, 12 字节 → 24 字符>", "ct": "<hex>", "updatedAt": "2026-10-20T12:00:00Z" }

// 404
{ "error": { "code": "VAULT_EMPTY", "message": "尚未创建保险箱" } }
```

### 4.6 `PUT /api/v1/vault` — 上传密文（乐观并发）

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

---

## 5. 数据模型与环境变量

### 5.1 建表 SQL（逐字照抄 `docs/CONTRACTS.md`，ORM 模型必须严格对应）

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

数据库类型：**SQLite**，URL 为 `sqlite:///./ciphervault.db`。字段类型按上面 SQL 原文写（TEXT / INTEGER）。`app/db.py` 在启动时应执行 `CREATE TABLE IF NOT EXISTS`（`Base.metadata.create_all`）。

### 5.2 `.env.example`（`backend/.env.example`，**唯一允许提交的环境文件**）

| 变量 | 说明 | 示例 |
|---|---|---|
| `DATABASE_URL` | SQLAlchemy URL | `sqlite:///./ciphervault.db` |
| `JWT_SECRET` | JWT 签名密钥 | 必填，生产环境请随机生成 |
| `JWT_TTL_SECONDS` | token 有效期 | `86400` |
| `PEPPER` | authHash 落库前的服务端盐 | 必填，生产环境请随机生成 |
| `CORS_ORIGINS` | 允许来源，逗号分隔 | `http://localhost:5173` |

`.env.example` 文件内容照此写（值可给开发默认值，但**不得**与 docker-compose 语义冲突）：

```dotenv
# SQLAlchemy 数据库连接串
DATABASE_URL=sqlite:///./ciphervault.db
# JWT 签名密钥（生产环境务必随机生成，勿用默认值）
JWT_SECRET=dev-jwt-secret-change-me
# token 有效期（秒）
JWT_TTL_SECONDS=86400
# authHash 落库前的服务端盐（生产环境务必随机生成）
PEPPER=dev-pepper-change-me
# 允许的跨域来源，逗号分隔
CORS_ORIGINS=http://localhost:5173
```

> `.env` 已被 `.gitignore` 忽略（第 20-23 行「环境与密钥（严禁提交）」段），**只能提交 `.env.example`**。

---

## 6. 你的交付清单（精确到目录与文件名）

在 `CipherVault-App/` 下创建如下结构（**一个都不能少、也不要多加**）：

```
backend/
├─ pyproject.toml            依赖 + 工具配置（ruff）
├─ .env.example              DATABASE_URL / JWT_SECRET / JWT_TTL_SECONDS / PEPPER / CORS_ORIGINS
├─ README.md                 后端如何启动/测试、每个端点的 curl 示例
├─ app/__init__.py
├─ app/main.py               FastAPI 实例、CORS、统一异常处理、挂载路由
├─ app/config.py             pydantic-settings 读取环境变量
├─ app/db.py                 SQLAlchemy 2.0 engine/session、建表
├─ app/models.py             User / Vault ORM 模型（严格对应契约里的 SQL）
├─ app/schemas.py            Pydantic 请求/响应模型（★ 字段一律 camelCase，用 alias_generator）
├─ app/security.py           JWT 签发/校验；authHash 再哈希 sha256(PEPPER + authHash)
├─ app/deps.py               依赖注入：当前用户、数据库会话
├─ app/routers/__init__.py
├─ app/routers/health.py     GET /health
├─ app/routers/auth.py       GET /auth/kdf、POST /auth/register、POST /auth/login
├─ app/routers/vault.py      GET /vault、PUT /vault（乐观并发）
├─ app/services/__init__.py
├─ app/services/auth_service.py    注册/登录业务逻辑
├─ app/services/vault_service.py   密文存取的版本控制
└─ tests/
   ├─ conftest.py            TestClient + 临时 SQLite fixture
   ├─ test_health.py
   ├─ test_auth.py           注册/重复注册/预登录/登录成功/登录失败
   └─ test_vault.py          ★ 未认证 401、首次写入 baseVersion=0、读取、版本递增、baseVersion 过期返回 409
```

**逐文件职责表**

| 文件 | 做什么 | 导出什么 | 依赖谁 |
|---|---|---|---|
| `pyproject.toml` | 声明依赖与 ruff 配置，支持 `pip install -e ".[dev]"` | 项目元数据、`[project.optional-dependencies].dev`、`[tool.ruff]` | — |
| `.env.example` | 环境变量样例（见 5.2） | — | — |
| `README.md` | 后端启动/测试说明 + 每个端点的 curl 示例 | — | — |
| `app/__init__.py` | 包标记 | 空 | — |
| `app/config.py` | `pydantic-settings` 读取 `.env`/环境变量 | `Settings` 类、`get_settings()`、`settings` 实例 | `pydantic-settings` |
| `app/db.py` | SQLAlchemy 2.0 engine / sessionmaker / `Base` / `create_all` | `engine`、`SessionLocal`、`Base`、`get_db()`、`init_db()` | `config.py`、`sqlalchemy` |
| `app/models.py` | `User`、`Vault` ORM，字段严格对应契约 SQL | `User`、`Vault` | `db.py` |
| `app/schemas.py` | Pydantic 请求/响应模型，**camelCase alias** | `HealthResponse`、`KdfResponse`、`RegisterRequest`、`RegisterResponse`、`LoginRequest`、`LoginResponse`、`VaultBlob`、`VaultPutRequest`、`VaultPutResponse`、`ErrorBody` | `pydantic` |
| `app/security.py` | JWT 签发/校验 + authHash 再哈希 | `hash_auth_hash()`、`create_token()`、`decode_token()` | `security`/`jwt`、`config.py` |
| `app/deps.py` | 依赖注入：解析 Bearer token → 当前用户 | `get_current_user()` | `security.py`、`db.py`、`models.py` |
| `app/main.py` | 创建 FastAPI app、CORS、统一异常处理、`X-API-Version` 中间件、挂载 `/api/v1` 路由、启动建表 | `app` | 所有 routers |
| `app/routers/health.py` | `GET /health` | `router` | `schemas.py` |
| `app/routers/auth.py` | `GET /auth/kdf`、`POST /auth/register`、`POST /auth/login` | `router` | `auth_service.py`、`deps.py` |
| `app/routers/vault.py` | `GET /vault`、`PUT /vault` | `router` | `vault_service.py`、`deps.py` |
| `app/services/auth_service.py` | 注册（查重、再哈希、落库）/ 登录（校验、签发 token） | 业务函数 | `models.py`、`security.py` |
| `app/services/vault_service.py` | 密文读取 / 乐观并发写入（版本控制） | 业务函数 | `models.py` |
| `tests/conftest.py` | TestClient + 临时 SQLite 的 pytest fixture | `client`、`db_session` 等 fixture | `pytest`、`app.main` |
| `tests/test_health.py` | 健康检查测试 | `test_*` | `conftest.py` |
| `tests/test_auth.py` | 注册/重复注册/预登录/登录成功/登录失败 | `test_*` | `conftest.py` |
| `tests/test_vault.py` | 未认证 401、首次写入、读取、版本递增、过期 409 | `test_*` | `conftest.py` |

---

## 7. 技术栈与依赖（精确到版本号）

- Python **3.11**
- FastAPI **0.115**
- uvicorn **0.30**
- SQLAlchemy **2.0**
- Pydantic **2.9**（含 `pydantic-settings`）
- PyJWT **2.9**
- pytest **8**（+ `httpx`，用 `fastapi.testclient.TestClient`）
- ruff（lint）

数据库：SQLite（`sqlite:///./ciphervault.db`），字段类型按第 5 节契约 SQL 原文写。

**不得**引入任何加密/解密业务逻辑依赖（服务器不做解密，禁止 `cryptography` / `pycryptodome` 等）。

`pyproject.toml` 参考（版本按上表约束）：

```toml
[project]
name = "ciphervault-backend"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
  "fastapi>=0.115,<0.116",
  "uvicorn[standard]>=0.30,<0.31",
  "sqlalchemy>=2.0,<2.1",
  "pydantic>=2.9,<2.10",
  "pydantic-settings>=2.5",
  "pyjwt>=2.9,<3.0",
]

[project.optional-dependencies]
dev = [
  "pytest>=8,<9",
  "httpx>=0.27",
  "ruff>=0.6",
]

[tool.ruff]
line-length = 100
target-version = "py311"

[tool.ruff.lint]
select = ["E", "F", "I", "W"]
```

> `app/security.py` 用 `import jwt`（PyJWT 的导入名是 `jwt`），算法固定 **HS256**；token 载荷需含 `sub`（=userId）与 `exp`。

---

## 8. 必须通过的自测与验收标准（命令可复制）

> 下述命令均在该目录下执行：`CipherVault-App/backend/`

**① 安装（Windows 环境）**

```powershell
cd CipherVault-App\backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
```

**② Lint 无 error**

```powershell
python -m ruff check .
```

期望：无任何 `error`（可通过为 `Select` 规则集）。

**③ 测试全绿**

```powershell
python -m pytest -q
```

期望：全部用例 `passed`，无 `failed` / `error`。

**④ 服务可启动、健康检查正确**

```powershell
uvicorn app.main:app --reload --port 8000
```

- `GET http://localhost:8000/api/v1/health` 返回 `{"status":"ok","version":"0.1.0"}`；
- `http://localhost:8000/docs` 能打开 OpenAPI 文档。

**⑤ `curl` / `Invoke-WebRequest` 走通完整链路**

```powershell
$base = "http://localhost:8000/api/v1"

# 1) 预登录取盐（注册前需先有个已存在用户；见步骤 2 之后重跑）
Invoke-RestMethod "$base/auth/kdf?email=alice@example.com"

# 2) 注册（authHash 为 64 个 hex 字符，kdfSalt 为 32 个 hex 字符）
$body = '{"email":"alice@example.com","authHash":"' + ("ab" * 32) + '","kdfSalt":"' + ("cd" * 16) + '","kdfIters":200000}'
Invoke-RestMethod -Method Post "$base/auth/register" -ContentType "application/json" -Body $body

# 3) 登录拿 token
$login = '{"email":"alice@example.com","authHash":"' + ("ab" * 32) + '"}'
$token = (Invoke-RestMethod -Method Post "$base/auth/login" -ContentType "application/json" -Body $login).token

# 4) 首次写入密文（baseVersion = 0）
$put = '{"baseVersion":0,"iv":"' + ("11" * 12) + '","ct":"' + ("00" * 16) + '"}'
Invoke-RestMethod -Method Put "$base/vault" -Headers @{Authorization="Bearer $token"} -ContentType "application/json" -Body $put
# 期望：{ "version": 1, "updatedAt": "..." }

# 5) 读取密文（iv/ct 必须与写入同一份）
Invoke-RestMethod "$base/vault" -Headers @{Authorization="Bearer $token"}
# 期望：{ "version": 1, "iv": "111111...", "ct": "0000...", "updatedAt": "..." }

# 6) 再用旧的 baseVersion=0 写入，必须 409
try {
  Invoke-RestMethod -Method Put "$base/vault" -Headers @{Authorization="Bearer $token"} -ContentType "application/json" -Body $put
} catch {
  $_.ErrorDetails.Message   # 期望 {"error":{"code":"VERSION_CONFLICT","message":"版本冲突","detail":{"currentVersion":1}}}
}
```

> 若在 Linux/Git Bash 下用 curl，等价命令为：`curl -s -X POST "$BASE/auth/register" -H "Content-Type: application/json" -d '<上述请求体>'`，其余步骤同理（`-H "Authorization: Bearer $TOKEN"`）。

**⑥ 必测边界（`tests/` 必须覆盖，全部要断言到 code 与 HTTP 状态）**

| 场景 | 期望 |
|---|---|
| 邮箱重复注册 | HTTP **409**，`code = EMAIL_EXISTS` |
| `authHash` 错误登录 | HTTP **401**，`code = INVALID_CREDENTIALS` |
| 无 token 访问 `GET /vault` | HTTP **401**，`code = UNAUTHORIZED` |
| 请求体字段缺失（如注册缺 `kdfSalt`） | HTTP **422**，`code = VALIDATION_ERROR` |

**必须覆盖的最小测试用例清单**：
- `test_health.py`：`GET /api/v1/health` → 200 且 `status == "ok"`、`version == "0.1.0"`；响应头含 `X-API-Version: 1`。
- `test_auth.py`：
  1. 预登录未注册邮箱 → 404 `USER_NOT_FOUND`；
  2. 注册成功 → 201 且返回 `userId`（32 hex）；
  3. 重复注册 → 409 `EMAIL_EXISTS`；
  4. 注册后预登录 → 200 且 `kdfSalt` 为 32 hex、`kdfIters` 为 200000；
  5. 登录成功 → 200 且含 `token`、`userId`、`expiresIn == 86400`；
  6. `authHash` 错误 → 401 `INVALID_CREDENTIALS`；
  7. 缺字段注册 → 422 `VALIDATION_ERROR`。
- `test_vault.py`：
  1. 未认证访问 → 401 `UNAUTHORIZED`；
  2. 首次写入 `baseVersion=0` → 200 且 `version == 1`；
  3. 写入后读取 → 200，`iv`/`ct` 与写入完全一致；
  4. 用最新版本再次写入 → 版本递增（1 → 2）；
  5. 未创建保险箱时读取 → 404 `VAULT_EMPTY`；
  6. 用过期 `baseVersion` 写入 → 409 `VERSION_CONFLICT`，且 `detail.currentVersion` 为服务端当前版本。

> `tests/conftest.py` 必须使用**临时 SQLite**（如 `tmp_path` 下的文件或 `sqlite:///:memory:`），并覆盖 `get_db` 依赖，确保测试之间互不污染、不写生产 `ciphervault.db`。

---

## 9. 上传到 GitHub 的步骤

在 `CipherVault-App/` 目录下，只添加你负责的目录：

```powershell
git status
git add backend/
git commit -m "feat(backend): implement auth and vault endpoints per CONTRACTS v1.0"
git push origin main
```

**提交信息规范**：
- 新功能：`feat(backend): ...`
- 修复：`fix(backend): ...`
- 示例：`feat(backend): add optimistic concurrency to PUT /vault`

**若 `push` 被拒（远端有新提交）**：

```powershell
git pull --rebase origin main
# 冲突解决后
git add backend/
git rebase --continue
git push origin main
```

> 不要使用 `git push --force`。只提交本任务要求的文件，不要 `git add -A`（避免误纳入 `.env`、`*.db`）。

---

## 10. 禁止事项与常见坑

**硬约束（违反即验收不通过）**
1. 只允许改动 `CipherVault-App/backend/**`，**禁止**修改 `docs/`、`frontend/`、`packages/`、`docker/`、根目录任何文件。
2. **服务器永远不得接收或存储主密码、明文密码、`vaultKey`**；`/vault` 只存 `iv` + `ct` 密文。
3. `auth_hash` 落库前必须再哈希 `sha256(PEPPER + authHash)`，绝不存 `authHash` 原文。
4. 日志里不得出现 `authHash`、`token`、`ct` 原文。
5. 所有破坏性/失败的请求都要走统一错误格式 `{"error":{"code","message","detail"}}`，不得直接把异常抛给客户端。
6. `.env` 不得提交（已在 `.gitignore` 中），只能提交 `.env.example`。
7. 提交信息规范：`feat(backend): ...` / `fix(backend): ...`。

**常见坑**
- **路径前缀**：router 内部路径写 `/health`、`/auth/kdf`、`/vault`，挂载时统一加 `/api/v1` 前缀；不要在两处都写 `/api/v1` 导致重复。
- **camelCase**：`app/schemas.py` 必须用 `model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)`；否则响应会变成 snake_case，前端解析失败。内部 ORM/逻辑可用 snake_case。
- **422 格式**：FastAPI 默认的 `RequestValidationError` 输出不是契约格式。必须注册异常处理器，把它转成 `{"error":{"code":"VALIDATION_ERROR","message":...,"detail":{"fields":...}}}`，HTTP 状态 422。
- **401 语义**：token 缺失/过期/无效一律 `UNAUTHORIZED`；authHash 不匹配一律 `INVALID_CREDENTIALS`，不要混用。
- **乐观并发**：`PUT /vault` 首次 `baseVersion=0` → 服务端创建 `version=1`；随后每次 `baseVersion == 当前 version` 才允许写入并递增；不一致立即 409 且 `detail.currentVersion` 为库中当前值。**不做自动合并**。
- **hex 编码**：一律小写 hex，长度校验（`authHash` 64、`kdfSalt` 32、`iv` 24）可在 Pydantic 层做 `pattern` 校验；不要用 base64。
- **时间**：`created_at` / `updated_at` 用 ISO8601 UTC（`...Z`）字符串存储，与契约一致。
- **email 归一化**：统一小写去空格后再查重与存储，`UNIQUE` 约束才有效。
- **SQLite 外键**：`vaults.user_id` 引用 `users.id` 且 `ON DELETE CASCADE`；SQLite 默认不启用外键，如需要可 `PRAGMA foreign_keys=ON`，但不要因此改变契约语义。
- **依赖范围**：不要引入任何加解密库；后端只需要哈希（`hashlib`）与 JWT。

---

## 11. 完成后的自检清单

- [ ] 已在 `CipherVault-App/backend/` 下创建第 6 节列出的**全部文件**，无遗漏、无多余文件。
- [ ] `docs/CONTRACTS.md` 中的 6 个端点全部实现，字段名、hex 编码、状态码、错误码逐字一致。
- [ ] 所有响应字段为 **camelCase**，响应头含 `X-API-Version: 1`。
- [ ] `users` / `vaults` 两张表结构严格对应契约 SQL 原文。
- [ ] `authHash` 落库前执行 `sha256(PEPPER + authHash)`，未存原文（代码中可自证）。
- [ ] 服务器未接收/未存储主密码、明文、`vaultKey`；无任何解密逻辑。
- [ ] 统一错误格式 `{"error":{"code","message","detail"}}` 覆盖 404/409/401/422。
- [ ] `python -m ruff check .` 无 error。
- [ ] `python -m pytest -q` 全绿，且第 8 节「必须覆盖的最小测试用例清单」全部覆盖。
- [ ] `uvicorn app.main:app --reload --port 8000` 可启动，`/api/v1/health` 返回 `{"status":"ok","version":"0.1.0"}`，`/docs` 可打开。
- [ ] `curl`/`Invoke-WebRequest` 完整链路走通：注册 → 登录 → `PUT /vault`(baseVersion=0) → `GET /vault`(同一份 iv/ct) → 旧 baseVersion `PUT` 返回 409。
- [ ] `.env.example` 含 `DATABASE_URL` / `JWT_SECRET` / `JWT_TTL_SECONDS` / `PEPPER` / `CORS_ORIGINS` 五项；`.env` 未被提交。
- [ ] 仅改动 `CipherVault-App/backend/**`，未触碰 `docs/`、`frontend/`、`packages/`、`docker/` 及根目录文件。
- [ ] 已 `git add backend/` → `git commit -m "feat(backend): ..."` → `git push origin main` 成功。
