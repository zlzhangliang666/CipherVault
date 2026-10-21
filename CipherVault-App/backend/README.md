# backend

CipherVault 的后端服务：**账号注册/登录 + 零知识密文 blob 的存取与版本控制**。
技术栈 Python 3.11 + FastAPI 0.115 + SQLAlchemy 2.0 + SQLite + PyJWT，
严格按 [`docs/CONTRACTS.md`](../docs/CONTRACTS.md)（v1.0 已冻结）实现。

> **一句话职责**：服务器只做「账号 + 密文保管箱」，**永远不接触主密码、明文与 `vaultKey`**。

---

## 1. 后端不做什么（零知识边界）

来自 [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) 的三条铁律：

| # | 规则 | 本服务的落地方式 |
|---|---|---|
| R1 | 主密码、明文、`vaultKey` 绝不出现在任何请求体 / URL / 日志中 | 契约里没有这类字段；422 校验错误**不回显请求原值**（见 §8） |
| R2 | 服务器只存 `sha256(PEPPER + authHash)` 与密文 blob | [`app/security.py`](app/security.py) 的 `hash_auth_hash()`；`authHash` 原文不落库 |
| R3 | 所有加解密只在前端与核心库中实现 | 运行时依赖里**没有任何加密库**，只用标准库 `hashlib` / `hmac` |

因此：**不做服务端解密、不做主密码找回、不做密文内容校验**（只校验 hex 长度与格式）。
`iv` / `ct` 对服务器而言就是不透明的十六进制字符串。

---

## 2. 目录结构

```
backend/
├─ pyproject.toml            依赖 + ruff / pytest 配置，支持 pip install -e ".[dev]"
├─ .env.example              五个环境变量的样例（唯一允许提交的环境文件）
├─ README.md                 本文件
├─ app/
│  ├─ main.py                FastAPI 实例、CORS、X-API-Version 中间件、统一异常处理、挂载 /api/v1
│  ├─ config.py              pydantic-settings 读取环境变量；API_VERSION / APP_VERSION 常量
│  ├─ db.py                  SQLAlchemy engine / SessionLocal / Base / init_db() / get_db()
│  ├─ models.py              User / Vault ORM（严格对应契约里的建表 SQL）+ utcnow_iso()
│  ├─ schemas.py             Pydantic 模型（camelCase alias）、统一错误码表、ApiError
│  ├─ security.py            JWT 签发/校验；sha256(PEPPER + authHash) 再哈希
│  ├─ deps.py                依赖注入：DbSession、CurrentUser
│  ├─ routers/
│  │  ├─ health.py           GET /health
│  │  ├─ auth.py             GET /auth/kdf、POST /auth/register、POST /auth/login
│  │  └─ vault.py            GET /vault、PUT /vault（乐观并发）
│  └─ services/
│     ├─ auth_service.py     注册/登录/预登录业务逻辑
│     └─ vault_service.py    密文读取与乐观并发写入
└─ tests/
   ├─ conftest.py            临时 SQLite + TestClient + auth_headers fixture
   ├─ test_health.py
   ├─ test_auth.py
   └─ test_vault.py
```

> 路由内部只写 `/health`、`/auth/kdf`、`/vault`，`/api/v1` 前缀统一在
> [`app/main.py`](app/main.py) 挂载时加，避免两处都写导致 `/api/v1/api/v1/...`。

---

## 3. 安装

需要 **Python 3.11+**（CI 使用 3.11）。以下命令都在本目录 `CipherVault-App/backend/` 下执行。

Windows PowerShell：

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
```

Linux / macOS：

```bash
python3.11 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

在 `CipherVault-App/` 目录下也可以用 Makefile：

```bash
make install-backend     # 等价于 cd backend && python -m pip install -e ".[dev]"
```

---

## 4. 配置

复制 `.env.example` 为 `.env` 后按需修改（`.env` 已被 `.gitignore` 忽略，**严禁提交**）：

```bash
cp .env.example .env
```

| 变量 | 说明 | 默认值 |
|---|---|---|
| `DATABASE_URL` | SQLAlchemy 连接串 | `sqlite:///./ciphervault.db` |
| `JWT_SECRET` | JWT 签名密钥（HS256，**至少 32 字节**） | `dev-jwt-secret-change-me` |
| `JWT_TTL_SECONDS` | token 有效期（秒） | `86400` |
| `PEPPER` | `authHash` 落库前的服务端盐 | `dev-pepper-change-me` |
| `CORS_ORIGINS` | 允许的跨域来源，**逗号分隔**（不是 JSON 数组） | `http://localhost:5173` |

不建 `.env` 也能直接跑（全部有开发默认值，与 `docker-compose.yml` 的回退值一致）。
生产环境务必用随机值覆盖 `JWT_SECRET` 与 `PEPPER`：

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

> ⚠️ 换掉 `PEPPER` 会让**已有账号无法登录**（库里存的是 `sha256(PEPPER + authHash)`），
> 而零知识模型下无法找回，只能在注册前定好。

---

## 5. 启动与自测

```bash
# 启动开发服务器（:8000）
uvicorn app.main:app --reload --port 8000
# 或 make dev-backend（在 CipherVault-App/ 下）

# Lint：期望 All checks passed!，退出码 0
python -m ruff check .

# 测试：期望全绿，0 failed
python -m pytest -q
# 或 make test-backend
```

启动后：

- `GET http://localhost:8000/api/v1/health` → `{"status":"ok","version":"0.1.0"}`
- `http://localhost:8000/docs` → OpenAPI 交互文档

建表在启动时由 lifespan 调用 `init_db()` 完成（`CREATE TABLE IF NOT EXISTS`），无需手动迁移。

> 测试用 `conftest.py` 里的**临时 SQLite**（`tempfile.mkdtemp()` 下的文件），
> 每个用例前后 `drop_all` / `create_all`，**不会**写到 `./ciphervault.db`。

---

## 6. 端点与 curl 示例

下面用 bash + `curl`；`jq` 只为方便取值，非必需。PowerShell 等价写法见 §7。

```bash
BASE=http://localhost:8000/api/v1
EMAIL=alice@example.com
AUTH_HASH=$(printf 'ab%.0s' {1..32})   # 64 个 hex 字符，真实值由前端 PBKDF2 派生
KDF_SALT=$(printf 'cd%.0s' {1..16})    # 32 个 hex 字符，真实值由前端随机生成
```

### 6.1 `GET /api/v1/health` — 健康检查（无需认证）

```bash
curl -s -i "$BASE/health"
```

```
HTTP/1.1 200 OK
x-api-version: 1

{"status":"ok","version":"0.1.0"}
```

### 6.2 `GET /api/v1/auth/kdf?email=` — 预登录取盐

前端必须先拿到 `kdfSalt` / `kdfIters` 才能在本地派生 `authHash`。

```bash
curl -s "$BASE/auth/kdf?email=$EMAIL"
```

```json
{ "kdfSalt": "cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd", "kdfIters": 200000 }
```

邮箱未注册 → `404`：

```json
{ "error": { "code": "USER_NOT_FOUND", "message": "用户不存在" } }
```

### 6.3 `POST /api/v1/auth/register` — 注册

```bash
curl -s -X POST "$BASE/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"authHash\":\"$AUTH_HASH\",\"kdfSalt\":\"$KDF_SALT\",\"kdfIters\":200000}"
```

```json
{ "userId": "16d5b759b1a8451ba4866df8ae790d44" }
```

- 成功 → `201`；`userId` 是 uuid4 的 hex（32 字符）。
- 邮箱已存在 → `409` `{"error":{"code":"EMAIL_EXISTS","message":"该邮箱已注册"}}`。
- `email` 会先**去空格 + 转小写**再查重与落库，所以 `Alice@Example.COM` 与 `alice@example.com` 是同一账号。
- 服务器存的是 `sha256(PEPPER + authHash)`，**不存 `authHash` 原文**。

### 6.4 `POST /api/v1/auth/login` — 登录

```bash
TOKEN=$(curl -s -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"authHash\":\"$AUTH_HASH\"}" | jq -r .token)
```

```json
{ "token": "<jwt>", "userId": "16d5b759...", "expiresIn": 86400 }
```

`authHash` 不匹配（或邮箱不存在）→ `401`
`{"error":{"code":"INVALID_CREDENTIALS","message":"邮箱或主密码不正确"}}`。
两种情况故意用**同一个错误码**，避免被用来枚举已注册邮箱。

### 6.5 `PUT /api/v1/vault` — 上传密文（乐观并发）

```bash
# 首次写入：baseVersion = 0，服务端从 version = 1 开始
curl -s -X PUT "$BASE/vault" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"baseVersion":0,"iv":"111111111111111111111111","ct":"00000000000000000000000000000000"}'
```

```json
{ "version": 1, "updatedAt": "2026-10-21T07:40:34Z" }
```

后续每次写入都要带上**刚读到的 `version`** 作为 `baseVersion`：

```bash
curl -s -X PUT "$BASE/vault" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"baseVersion":1,"iv":"222222222222222222222222","ct":"ffff..."}'
# → { "version": 2, "updatedAt": "..." }
```

`baseVersion` 与服务端当前 `version` 不一致 → `409`，**不做自动合并**，
由前端提示用户选择保留哪一份：

```json
{ "error": { "code": "VERSION_CONFLICT", "message": "版本冲突", "detail": { "currentVersion": 2 } } }
```

### 6.6 `GET /api/v1/vault` — 拉取密文

```bash
curl -s "$BASE/vault" -H "Authorization: Bearer $TOKEN"
```

```json
{
  "version": 2,
  "iv": "222222222222222222222222",
  "ct": "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
  "updatedAt": "2026-10-21T07:40:34Z"
}
```

还没写过 → `404` `{"error":{"code":"VAULT_EMPTY","message":"尚未创建保险箱"}}`
（前端 `getVault()` 会把这个 404 转成 `null`）。

---

## 7. PowerShell 版完整链路

```powershell
$base = "http://localhost:8000/api/v1"
$email = "alice@example.com"
$authHash = "ab" * 32          # 64 个 hex 字符
$kdfSalt  = "cd" * 16          # 32 个 hex 字符

Invoke-RestMethod "$base/health"

# 注册
$body = @{ email = $email; authHash = $authHash; kdfSalt = $kdfSalt; kdfIters = 200000 } | ConvertTo-Json -Compress
Invoke-RestMethod -Method Post "$base/auth/register" -ContentType "application/json" -Body $body

# 登录
$loginBody = @{ email = $email; authHash = $authHash } | ConvertTo-Json -Compress
$token = (Invoke-RestMethod -Method Post "$base/auth/login" -ContentType "application/json" -Body $loginBody).token
$headers = @{ Authorization = "Bearer $token" }

# 首次写入密文（baseVersion = 0）
$put = @{ baseVersion = 0; iv = "11" * 12; ct = "00" * 16 } | ConvertTo-Json -Compress
Invoke-RestMethod -Method Put "$base/vault" -Headers $headers -ContentType "application/json" -Body $put

# 读取
Invoke-RestMethod "$base/vault" -Headers $headers

# 再用过期的 baseVersion=0 写入 → 409
try {
  Invoke-RestMethod -Method Put "$base/vault" -Headers $headers -ContentType "application/json" -Body $put
} catch {
  $_.ErrorDetails.Message
}
```

> `Invoke-WebRequest` 请带 `-UseBasicParsing`，否则在没有 IE 引擎的机器上会卡在交互提示。

---

## 8. 错误格式与错误码

所有失败响应都是同一个信封，且都带 `X-API-Version: 1` 响应头：

```json
{ "error": { "code": "<CODE>", "message": "<人类可读>", "detail": { } } }
```

`detail` 为空时**不输出该键**（与契约里各端点的示例一致）。

| code | HTTP | 何时出现 | `detail` |
|---|---|---|---|
| `USER_NOT_FOUND` | 404 | 预登录查不到邮箱 | — |
| `EMAIL_EXISTS` | 409 | 邮箱已注册 | — |
| `INVALID_CREDENTIALS` | 401 | `authHash` 不匹配 | — |
| `UNAUTHORIZED` | 401 | token 缺失 / 过期 / 无效 | — |
| `VAULT_EMPTY` | 404 | 该用户还没有保险箱 | — |
| `VERSION_CONFLICT` | 409 | 乐观并发冲突 | `{ "currentVersion": <int> }` |
| `VALIDATION_ERROR` | 422 | 请求体/查询参数校验失败 | `{ "fields": [{ "field", "type", "message" }] } |

> **422 不回显请求原值。** FastAPI 默认的 `RequestValidationError` 会带上 `input`（即客户端
> 发来的原始值），那等于把 `authHash` 写进响应体和访问日志，违反铁律 R1。
> [`app/main.py`](app/main.py) 的处理器只保留 `field` / `type` / `message`。

---

## 9. 数据模型

与 [`docs/CONTRACTS.md`](../docs/CONTRACTS.md) §2 的建表 SQL 逐字对应（见 [`app/models.py`](app/models.py)）：

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

时间是 **ISO8601 UTC 字符串**（`2026-10-20T12:00:00Z`，不带毫秒），由 `models.utcnow_iso()` 生成。
二进制一律**十六进制小写字符串**，不用 base64：`authHash` 64 字符、`kdfSalt` 32 字符、`iv` 24 字符，
长度在 [`app/schemas.py`](app/schemas.py) 用 `pattern` 校验；`ct` 允许空串（空明文 ⇒ 空密文）。

---

## 10. 部署

`docker/backend.Dockerfile` 与 `docker-compose.yml` 由组员 C 维护，在 `CipherVault-App/` 下：

```bash
make docker-up           # docker compose up --build，后端 :8000 + 前端 nginx :5173
```

容器里 `DATABASE_URL=sqlite:////data/ciphervault.db`，SQLite 文件落在 volume `vaultdata`。
compose 的 healthcheck 打的就是 `GET /api/v1/health`。

---

## 11. 常见坑（改动本目录前请逐条自查）

1. **不要两处都写 `/api/v1`**：router 内写相对路径，前缀只在 `main.py` 挂载时加。
2. **camelCase**：新增字段请继承 `CamelModel`，否则响应会变成 snake_case，前端解析失败。
3. **401 语义**：token 问题一律 `UNAUTHORIZED`，`authHash` 不匹配一律 `INVALID_CREDENTIALS`，不要混用。
4. **乐观并发**：`baseVersion != 当前 version` 立即 409，**不做自动合并**，也不落库。
5. **email 归一化**：查重与存储都要走 `normalize_email()`，否则 `UNIQUE` 约束形同虚设。
6. **不得引入加密库**：`cryptography` / `pycryptodome` 等一律禁止——后端只哈希，不解密。
7. **日志**：不得打印 `authHash`、`token`、`ct` 原文。
8. **错误码**：只能用 `schemas.ERROR_SPECS` 里的 7 个，禁止自行发明。
9. **契约优先**：本文件与 `docs/CONTRACTS.md` 若有任何不一致，**以 `docs/CONTRACTS.md` 为准**，
   并停下向负责人报告，不要在代码里「各自解释」。
