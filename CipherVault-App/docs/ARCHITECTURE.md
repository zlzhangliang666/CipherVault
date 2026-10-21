# 架构与安全模型（单机版）

> 维护者：项目负责人 ｜ 状态：v2.0（单机离线）
> v1.0 的「前后端分离 + 零知识同步」方案已归档到分支 `archive/cloud-sync`，不再维护。

## 1. 产品目标

把「密码保险箱」做成**可安装、可离线使用、可长期演进**的桌面产品，同时保留原型最核心的两个卖点：

1. **强加密打底**（真实安全性）
2. **趣味皮肤外壳 + 离线钥匙卡**（好玩、可分享、可带走）

## 2. 安全模型：单机离线

**信任边界**

```
                本机（唯一可信域）
┌────────────────────────────────────────────────────────────┐
│  Electron renderer（React）                                 │
│   主密码 ──► PBKDF2 ──► vaultKey(内存)                       │
│   明文 ──► AES-GCM-256(vaultKey) ──► 密文 ──► IPC            │
│                                                            │
│  Electron main（storage.cjs）                               │
│   只做文件读写与原子替换，不接触主密码 / vaultKey / 明文      │
└──────────────────────────────┬─────────────────────────────┘
                               ▼
                  vault.cvault（磁盘上的密文）
```

**四条铁律**

| # | 规则 | 原因 |
|---|---|---|
| R1 | 应用**不得发起任何网络请求**（无账号、无同步、无遥测） | 攻击面最小化，符合「单机软件」定位 |
| R2 | 主密码、明文、`vaultKey` **只存在于渲染进程内存**；锁定时立即清空 | 落盘 / 日志 / 崩溃转储都可能泄露 |
| R3 | 主进程只接收「已经加密好的整库文本」，且写入前做格式校验 | 主进程被攻破也拿不到密钥 |
| R4 | 加密实现必须与 `docs/ALGORITHM.md` 完全一致；趣味显示串只能编码 `ctHex` | 避免两套实现不兼容、避免明文借皮肤泄露 |

**已知取舍（本版明确不做）**

- 不做主密码找回（找回等于把主密码交给第三方）。
- 不做多设备同步、账号体系、云备份。
- 不做端到端分享；钥匙卡是唯一的「带得走」形式。
- 不做双人密钥分片、谜面解锁、蜜罐假库（后续里程碑）。

## 3. 组件与职责

| 组件 | 技术 | 职责 |
|---|---|---|
| `frontend/` | React 18 + TypeScript + Vite + zustand | 全部加解密、UI、自动保存、钥匙卡生成 |
| `desktop/` | Electron 33 + electron-builder | 窗口、单实例、受限 IPC、本地文件原子写、打包 |
| `packages/ciphervault-core/` | Python 3.11（纯标准库） | 算法规格落地、跨语言测试向量、离线解密 CLI |
| `.github/workflows/ci.yml` | GitHub Actions | core / frontend / desktop / contracts 四个 job |

## 4. 关键数据流

**首次创建（Onboarding）**
1. 用户设置主密码（≥6 位，两次一致），前端生成随机 `salt`(16B)。
2. `PBKDF2(master, salt, 200000, 64B)` → `vaultKey = dk[0:32]`。
3. 用 `vaultKey` 加密空保险箱 → `vault.cvault` 首次落盘（`kdf.salt` / `kdf.iters` 随文件保存）。
4. 主密码与 `vaultKey` 仅保存在内存（`useSession`）。

**日常使用**
1. 解锁：读 `vault.cvault` → 校验格式 → 用文件里的 `salt`/`iters` + 输入的主密码派生 `vaultKey` → AES-GCM 解密。
2. 编辑：每次 CRUD 后 400ms 防抖自动加密并原子写回（`.tmp` → `.bak` → rename）。
3. 锁定：先 flush 一次，再清空 `vaultKey` 与所有明文状态。
4. 自动锁定：默认 5 分钟无操作；关闭窗口前由主进程发起握手，渲染进程落盘后确认退出。

**钥匙卡**
- 前端用「主密码」派生密钥，加密「条目密码」，生成 `keycard_<名称>.html` 与 `ciphervault_keycard_<名称>.py`；
- 两者都用同一套 `PBKDF2 + HMAC-SHA256 流加密 + HMAC 校验`，可互相验证、可脱离本项目运行（详见 `docs/ALGORITHM.md`）。

## 5. 目录与归属（零重叠）

| 目录 | 唯一负责人 | 其他人可做 |
|---|---|---|
| `docs/`、根 `README.md`、`.gitignore` | 负责人 | 只读 |
| `frontend/**` | A | 只读 |
| `desktop/**` | B | 只读 |
| `packages/**`、`tools/**`、`Makefile` | C | 只读 |
| `.github/workflows/ci.yml`（位于**仓库根**） | C | 只读 |

> 契约与算法若要变更，必须由负责人在 `docs/` 中更新并通知三人，禁止在代码里「各自解释」。

## 6. 构建与发布

- 开发：`cd desktop && npm run dev`（Vite 5173 + Electron 自动加载）
- 构建：`npm run build:renderer` → `desktop/renderer/`
- 打包：`npm run dist` → `desktop/release/CipherVault-Setup-1.0.0.exe`、`CipherVault-Portable-1.0.0.exe`
- 数据：`app.getPath('userData')/vault.cvault`（Windows 为 `%APPDATA%\CipherVault\`）

## 7. 里程碑

| 阶段 | 内容 | 验收 |
|---|---|---|
| M1 | 桌面壳 + 本地建库/解锁 + 自动保存 | 断网环境下可创建、保存、重启后解锁 |
| M2 | 钥匙卡双格式导出、设置项、自动锁定 | 导出的 `.py` 能独立还原密码 |
| M3 | 加密备份导入导出、备份恢复、安装包与便携版 | `npm run dist` 产出两个 `.exe` |
| 后续 | 密钥分片（三人各持一片）、谜面解锁、蜜罐假库、皮肤市场 | — |
