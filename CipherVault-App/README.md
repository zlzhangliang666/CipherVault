# CipherVault App

带自定义趣味加密的密码保险箱 —— **正式交付产品**（前后端分离 + 服务端零知识同步）。

> 本目录是 [`CipherVault`](https://github.com/zlzhangliang666/CipherVault) 原型的正式产品化版本，位于该仓库的 `CipherVault-App/` 子目录。
> 原型（单文件 HTML，在线运行）在同仓库的 `mvp/` 目录，本目录是可部署、可协作开发的完整应用。

**仓库地址**：https://github.com/zlzhangliang666/CipherVault
**分支**：`main`（三人直推 main）

## 产品定位

一个「既好玩又安全」的密码管理器：

- **安全打底**：所有加密在客户端完成，服务器只保存密文与登录校验值，**永远接触不到主密码和明文**（零知识）。
- **趣味外壳**：真正的密文可以伪装成古诗 / 英文字母 / 数字（「皮肤」），好看好玩；皮肤只是外衣，可随意更换，不影响安全性。
- **离线钥匙卡**：每条密码可导出脱离项目独立运行的 HTML / Python 解密脚本，仍必须输入主密码才能还原。

## 架构一览

```
┌─────────────────────────────┐        ┌──────────────────────────────┐
│  frontend/  (React + Vite)  │  REST  │  backend/  (FastAPI)         │
│  · 全部加密在浏览器 (WebCrypto)│ ─────▶ │  · 只存 authHash + 密文 blob  │
│  · 主密码 / 明文永不出本机    │ ◀───── │  · SQLite + JWT              │
└─────────────────────────────┘        └──────────────────────────────┘
                 ▲
                 │ 共享算法规格与测试向量
                 ▼
┌─────────────────────────────────────┐
│  packages/ciphervault-core/ (Python) │
│  · 算法规格 + 跨语言测试向量 + CLI     │
└─────────────────────────────────────┘
```

## 目录结构

```
CipherVault-App/                ← 位于 CipherVault 仓库内
├─ README.md                  ← 项目负责人维护
├─ docs/
│   ├─ ARCHITECTURE.md        架构、安全模型、技术选型
│   ├─ CONTRACTS.md           ★ 冻结的接口契约（前后端共同遵守）
│   ├─ ALGORITHM.md           ★ 加密算法规格（含常量全文与测试向量格式）
│   └─ tasks/                 三份组员任务书
│       ├─ TASK-A-FRONTEND.md
│       ├─ TASK-B-BACKEND.md
│       └─ TASK-C-CORE-CI.md
├─ frontend/                  ← 组员 A
├─ backend/                   ← 组员 B
├─ packages/ciphervault-core/ ← 组员 C
├─ tools/                     ← 组员 C
├─ docker/                    ← 组员 C
├─ docker-compose.yml         ← 组员 C
└─ Makefile                   ← 组员 C
```

> CI 工作流放**仓库根目录**（GitHub 强制要求）：`.github/workflows/ci.yml`、`.github/workflows/deploy-pages.yml`。
> 前者跑三组件测试（路径过滤，只跑有改动的部分），后者发布仓库根的 `mvp/` 原型页面。

## 快速开始（开发）

> 以下命令都在本目录 `CipherVault-App/` 下执行（`make` 同样需要在此目录运行）。

```bash
# 后端
cd backend && python -m venv .venv && .venv/Scripts/activate && pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000

# 前端
cd frontend && npm install && npm run dev

# 加密核心
cd packages/ciphervault-core && pip install -e ".[dev]" && pytest
```

## 快速开始（Docker）

> 在 `CipherVault-App/` 下执行（build context 是本目录）。

```bash
docker compose up --build
# 前端 http://localhost:5173   后端 http://localhost:8000/docs
```

## 团队与职责

| 成员 | 负责 | 目录 |
|---|---|---|
| 负责人 | 架构、契约、算法、CI 骨架、验收 | `docs/`、根目录 |
| A | 前端 | `frontend/` |
| B | 后端 | `backend/` |
| C | 加密核心库 + CLI + 部署 | `packages/`、`tools/`、`docker/`、`.github/` |

## 关键约束（务必遵守）

1. **主密码、明文、派生密钥绝不允许发往服务器**。
2. 任何加密实现必须与 [`docs/ALGORITHM.md`](docs/ALGORITHM.md) 完全一致，并以 [`packages/ciphervault-core/vectors.json`](packages/ciphervault-core/vectors.json) 作为跨语言验收基准。
3. 只在自己的目录内改动文件，禁止修改他人目录与 `docs/` 下的契约文件。

## 文档索引

- 架构与安全模型：[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- 接口契约（冻结）：[docs/CONTRACTS.md](docs/CONTRACTS.md)
- 加密算法规格：[docs/ALGORITHM.md](docs/ALGORITHM.md)
