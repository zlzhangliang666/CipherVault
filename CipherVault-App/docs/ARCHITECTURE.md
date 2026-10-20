# 架构与安全模型

> 维护者：项目负责人 ｜ 状态：v1.0

## 1. 产品目标

把「密码保险箱」从单文件原型做成**可部署、可多人协作、可长期演进**的正式产品，同时保留原型最核心的两个卖点：

1. **强加密打底**（真实安全性）
2. **趣味皮肤外壳 + 离线钥匙卡**（好玩、可分享、可带走）

## 2. 安全模型：零知识

**信任边界**

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

**已知取舍（本版明确不做）**

- 不做服务端解密、不做「主密码找回」（找回等于把主密码交给服务器）。
- 不做双人密钥分片、谜面解锁、蜜罐假库（列入后续里程碑）。
- 不做端到端分享；共享条目需要先把密钥交给对方，后续单独设计。

## 3. 组件与职责

| 组件 | 技术 | 职责 |
|---|---|---|
| `frontend/` | React 18 + TypeScript + Vite + zustand | 全部加密、UI、钥匙卡生成、与后端同步 |
| `backend/` | Python 3.11 + FastAPI + SQLAlchemy + SQLite + JWT | 账号、登录校验、密文 blob 存储与版本控制 |
| `packages/ciphervault-core/` | Python 3.11（纯标准库实现加密） | 算法规格落地、跨语言测试向量、离线解密 CLI |
| `docker/` + `docker-compose.yml` | Docker | 一键起前后端 |
| `.github/workflows/ci.yml` | GitHub Actions | 三组件各自独立 CI |

## 4. 关键数据流

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
- 前端用「主密码」派生密钥，加密「条目密码」，生成 `keycard_<名称>.html` 与 `ciphervault_keycard_<名称>.py`；
- 两者都用同一套 `PBKDF2 + HMAC-SHA256 流加密 + HMAC 校验`，因此可互相验证、且可脱离本项目运行（详见 `docs/ALGORITHM.md`）。

## 5. 目录与归属（零重叠）

| 目录 | 唯一负责人 | 其他人可做 |
|---|---|---|
| `docs/`、根 `README.md`、`.gitignore` | 负责人 | 只读 |
| `frontend/**` | A | 只读 |
| `backend/**` | B | 只读 |
| `packages/**`、`tools/**` | C | 只读 |
| `docker/**`、`docker-compose.yml`、`Makefile` | C | 只读 |
| `.github/workflows/ci.yml`（位于**仓库根**） | C | 只读 |

> 契约与算法若要变更，必须由负责人在 `docs/` 中更新并通知三人，禁止在代码里「各自解释」。

## 6. 部署拓扑

- 开发：后端 8000（`uvicorn --reload`）、前端 5173（Vite dev server）
- 容器：`docker compose up --build` → `web`(nginx, 5173→80) 反向代理 `/api/` 到 `api`(8000)
- 数据：SQLite 文件挂载在 volume `vaultdata`

## 7. 里程碑

| 阶段 | 内容 | 验收 |
|---|---|---|
| M1 | 三组件骨架可跑通、CI 全绿、向量跨语言一致 | 前端能注册/登录/存入第一条密码并同步成功 |
| M2 | 钥匙卡双格式导出、设置项、自动锁定 | 导出的 `.py` 能独立还原密码 |
| M3 | 冲突处理、导入导出备份、打包部署 | `docker compose up` 一键可用 |
| 后续 | 密钥分片（三人各持一片）、谜面解锁、蜜罐假库、皮肤市场 | — |
