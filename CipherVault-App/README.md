# CipherVault App

带自定义趣味加密的密码保险箱 —— **单机离线版（Electron 桌面应用）**。

> 本目录是 [`CipherVault`](https://github.com/zlzhangliang666/CipherVault) 原型的正式产品化版本，位于该仓库的 `CipherVault-App/` 子目录。
> 原型（单文件 HTML，在线运行）在同仓库的 `mvp/` 目录；本目录是可安装、可协作开发的完整桌面应用。

**仓库地址**：https://github.com/zlzhangliang666/CipherVault
**主分支**：`main`
**归档分支**：`archive/cloud-sync`（旧的前后端分离 + 零知识同步方案，仅作历史保留，不再维护）

## 产品定位

一个「既好玩又安全」的**单机密码管理器**：

- **完全离线**：没有任何网络请求，没有账号、没有服务器、没有同步。
- **安全打底**：主密码只在内存中；整库用 AES-GCM-256 加密后写入本机 `vault.cvault` 文件。
- **趣味外壳**：真正的密文可以伪装成古诗 / 英文字母 / 数字（「皮肤」），好看好玩；皮肤只编码**密文**，不编码明文。
- **离线钥匙卡**：每条密码可导出脱离项目独立运行的 HTML / Python 解密脚本，仍必须输入主密码才能还原。

## 架构一览

```
┌──────────────────────────────────────────────────────┐
│  CipherVault.exe（Electron 桌面壳）                    │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │  renderer/  React + Vite（构建产物）             │  │
│  │  · 全部加解密在渲染进程完成（WebCrypto）          │  │
│  │  · 主密码 / 明文只存在于内存                     │  │
│  └──────────────────────┬─────────────────────────┘  │
│                         │ 受限 IPC（contextBridge）   │
│  ┌──────────────────────▼─────────────────────────┐  │
│  │  main.cjs + storage.cjs                         │  │
│  │  · 原子写 .tmp → .bak → rename                  │  │
│  │  · 只做文件读写，不接触密钥与明文                 │  │
│  └──────────────────────┬─────────────────────────┘  │
└─────────────────────────┼────────────────────────────┘
                          ▼
                %APPDATA%\CipherVault\vault.cvault
                （加密文件，备份为 vault.cvault.bak）
```

共享算法规格与跨语言测试向量仍在 `packages/ciphervault-core/`，用于保证「浏览器 ↔ Python 钥匙卡」逐字节一致。

## 目录结构

```
CipherVault-App/                ← 位于 CipherVault 仓库内
├─ README.md                  ← 项目负责人维护
├─ docs/
│   ├─ ARCHITECTURE.md        架构、安全模型、技术选型
│   ├─ CONTRACTS.md           ★ 冻结的本地文件契约
│   ├─ ALGORITHM.md           ★ 加密算法规格（含常量全文与测试向量格式）
│   └─ tasks/                 三份组员任务书
│       ├─ TASK-A-FRONTEND.md
│       ├─ TASK-B-DESKTOP.md
│       └─ TASK-C-CORE-CI.md
├─ frontend/                  ← 组员 A（React + Vite，全部加解密与 UI）
├─ desktop/                   ← 组员 B（Electron 壳、本地文件存储、打包）
├─ packages/ciphervault-core/ ← 组员 C（Python 核心库 + 测试向量）
├─ tools/                     ← 组员 C
└─ Makefile                   ← 组员 C
```

> CI 工作流放**仓库根目录**（GitHub 强制要求）：`.github/workflows/ci.yml`、`.github/workflows/deploy-pages.yml`。
> 前者跑 core / frontend / desktop / contracts 四个 job，后者发布仓库根的 `mvp/` 原型页面。

## 快速开始（开发）

依赖：Node 20+、Python 3.11+（仅核心库与测试需要）。

```bash
# 1. 安装依赖
cd frontend && npm ci && cd ..
cd desktop  && npm install && cd ..

# 2. 启动 Electron 开发模式（前端热更新 + 自动打开桌面窗口）
cd desktop
npm run dev
```

只想在浏览器里调试界面（此时数据保存在 localStorage，便于快速改 UI）：

```bash
cd frontend
npm run dev        # http://localhost:5173
```

## 构建与打包

```bash
cd desktop

npm run build:renderer   # 只构建前端到 desktop/renderer
npm run dist:dir         # 免安装目录版（release/win-unpacked）
npm run dist             # Windows 安装包 + 便携版
```

产物（`desktop/release/`）：

| 文件 | 说明 |
|---|---|
| `CipherVault-Setup-1.0.0.exe` | NSIS 安装包（可选安装目录） |
| `CipherVault-Portable-1.0.0.exe` | 便携版，双击即用 |

> 打包会从镜像下载 Electron 与 NSIS 资源。国内网络可先设置：
> `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`
> `ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/`

## 数据存放位置

| 平台 | 路径 |
|---|---|
| Windows | `%APPDATA%\CipherVault\vault.cvault` |

- 同目录下 `vault.cvault.bak` 是上一次成功写入的备份，可在解锁页「从备份恢复」。
- 首次启动会让你**设置主密码**；主密码不落盘、不上传，**忘记无法找回**。
- 换机迁移：设置页「导出加密备份」得到 `.cvault` 文件，在新机器解锁页「从保险箱文件导入」即可。

## 团队与职责

| 成员 | 负责 | 目录 |
|---|---|---|
| 负责人 | 架构、契约、算法、CI 骨架、验收 | `docs/`、根目录 |
| A | 前端（UI、加解密、钥匙卡） | `frontend/` |
| B | 桌面外壳（Electron、本地文件、打包） | `desktop/` |
| C | 加密核心库 + CLI + CI | `packages/`、`tools/`、`.github/` |

## 关键约束（务必遵守）

1. **零网络**：应用内不得出现任何 HTTP 请求、账号体系或同步逻辑。
2. **主密码、明文、派生密钥只存在于内存**，不得写入日志、磁盘或钥匙卡。
3. 任何加密实现必须与 [`docs/ALGORITHM.md`](docs/ALGORITHM.md) 完全一致，并以 [`packages/ciphervault-core/vectors.json`](packages/ciphervault-core/vectors.json) 作为跨语言验收基准。
4. 趣味显示串必须由**密文 `ctHex`** 编码，严禁编码明文。
5. 只在自己的目录内改动文件，禁止修改他人目录与 `docs/` 下的契约文件。

## 文档索引

- 架构与安全模型：[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- 本地文件契约（冻结）：[docs/CONTRACTS.md](docs/CONTRACTS.md)
- 加密算法规格：[docs/ALGORITHM.md](docs/ALGORITHM.md)
