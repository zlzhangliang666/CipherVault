# 接口契约（冻结）

> **状态：v1.0 已冻结。**
> 变更必须由项目负责人同意，并同步更新本文件 + `docs/ALGORITHM.md` + 三份任务书。
> 前端（A）与后端（B）**不得**自行增删字段、改名端点、变更编码方式。

---

## 0. 通用约定

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

---

## 1. 端点定义

### 1.1 `GET /api/v1/health`

无需认证。

```json
// 200
{ "status": "ok", "version": "0.1.0" }
```

### 1.2 `GET /api/v1/auth/kdf?email=<email>` — 预登录（取盐）

前端必须先拿到 `kdfSalt` 才能在本地派生 `authHash`。

```json
// 200
{ "kdfSalt": "a1b2c3d4e5f60718293a4b5c6d7e8f90", "kdfIters": 200000 }

// 404
{ "error": { "code": "USER_NOT_FOUND", "message": "用户不存在" } }
```

- `kdfSalt`：hex，16 字节 → 32 个 hex 字符
- `kdfIters`：整数

### 1.3 `POST /api/v1/auth/register`

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

### 1.4 `POST /api/v1/auth/login`

```json
// 请求
{ "email": "alice@example.com", "authHash": "<hex, 64 字符>" }

// 200
{ "token": "<jwt>", "userId": "9f1c...", "expiresIn": 86400 }

// 401
{ "error": { "code": "INVALID_CREDENTIALS", "message": "邮箱或主密码不正确" } }
```

### 1.5 `GET /api/v1/vault` — 拉取密文

需要 Bearer。

```json
// 200
{ "version": 3, "iv": "<hex, 12 字节 → 24 字符>", "ct": "<hex>", "updatedAt": "2026-10-20T12:00:00Z" }

// 404
{ "error": { "code": "VAULT_EMPTY", "message": "尚未创建保险箱" } }
```

### 1.6 `PUT /api/v1/vault` — 上传密文（乐观并发）

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

## 2. 数据模型

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

**服务器环境变量**（`backend/.env.example`）

| 变量 | 说明 | 示例 |
|---|---|---|
| `DATABASE_URL` | SQLAlchemy URL | `sqlite:///./ciphervault.db` |
| `JWT_SECRET` | JWT 签名密钥 | 必填，生产环境请随机生成 |
| `JWT_TTL_SECONDS` | token 有效期 | `86400` |
| `PEPPER` | authHash 落库前的服务端盐 | 必填，生产环境请随机生成 |
| `CORS_ORIGINS` | 允许来源，逗号分隔 | `http://localhost:5173` |

---

## 3. 前端必须实现的客户端签名（`frontend/src/api/client.ts`）

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

---

## 4. 内部数据形状（前后端各自内存中使用，**不经过网络**）

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

## 5. 变更流程

1. 任何字段/端点变更 → 先在群里提出，由负责人裁决。
2. 负责人在本文件更新版本号（v1.1、v1.2…）与变更记录。
3. 同步更新 `docs/ALGORITHM.md`（若涉及加密）与相关任务书。
4. 三人拉取最新 `docs/` 后再改代码。

**变更记录**

| 版本 | 日期 | 内容 | 负责人 |
|---|---|---|---|
| v1.0 | 2026-10-20 | 首次冻结 | 负责人 |
