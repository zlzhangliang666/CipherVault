# 任务书 B —— 桌面外壳（Electron + 本地文件 + 打包）

> 交付人：组员 B ｜ 目录：`CipherVault-App/desktop/`
> 你（Qwen Code）的工作目录：**`CipherVault-App/`**，你只允许改动 **`CipherVault-App/desktop/**`**。
> 本任务书对应**单机离线版 v2.0**；旧的后端任务书已随 `backend/` 归档到分支 `archive/cloud-sync`。

---

## 1. 你的角色与一句话目标

你是 CipherVault 的**桌面工程师（组员 B）**。把已经构建好的 React 前端包进一个安全、离线、可安装的 Electron 应用：

**一句话职责**：窗口 + 受限 IPC + 本地加密文件的原子读写 + Windows 安装包/便携版打包；**不接触主密码、明文与密钥**。

**验收标准（一句话）**：`npm run dev` 能打开桌面窗口；`npm run dist` 产出 `CipherVault-Setup-1.0.0.exe` 与 `CipherVault-Portable-1.0.0.exe`；`node smoke-test.cjs` 通过；断网状态下可创建、保存、重启后解锁。

---

## 2. 开工前必读

| 文件 | 为什么读 |
|---|---|
| `docs/ARCHITECTURE.md` | 单机安全模型与四条铁律 |
| `docs/CONTRACTS.md` | ★ `vault.cvault` 文件格式、IPC 通道、错误码、原子写顺序 |
| `docs/ALGORITHM.md` | 理解前端加密参数（你不需要实现加密） |
| `docs/tasks/TASK-A-FRONTEND.md` | 前端会通过 `window.ciphervault` 调用你 |

确认 `CipherVault-App/desktop/` 存在；不存在则新建。

---

## 3. 技术选型（已定，不得更换）

| 项 | 选择 |
|---|---|
| 运行时 | Electron 33（x64） |
| 打包 | electron-builder 25（NSIS + portable） |
| 语言 | CommonJS（`main.cjs` / `preload.cjs` / `storage.cjs`），**不引入 TypeScript 构建链** |
| 渲染层 | 复用 `frontend` 的 Vite 构建产物 `desktop/renderer/` |
| 开发启动 | `concurrently` + `wait-on` + `cross-env` |

---

## 4. 安全要求（违反即返工）

1. `webPreferences` 必须为：`contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`、`preload` 指向 `preload.cjs`。
2. `preload.cjs` **只**通过 `contextBridge.exposeInMainWorld('ciphervault', …)` 暴露 `docs/CONTRACTS.md` §3 中的白名单方法；禁止暴露 `ipcRenderer`、`fs`、`path` 或任意路径读写。
3. `will-navigate` 一律阻止；`setWindowOpenHandler` 一律 `deny`。
4. 主进程**不得**读取密钥、解密内容或记录文件明文；只做字符串校验与落盘。
5. 应用**不得**发起任何网络请求（无更新检查、无遥测）。
6. 单实例锁：第二次启动只聚焦已有窗口。
7. 关闭窗口时先发 `app:before-close`，等渲染进程 `app:close-confirmed` 后再退出；2 秒兜底强制退出。

---

## 5. 必须实现的文件与行为

```
CipherVault-App/desktop/
├─ package.json         依赖、scripts、electron-builder 配置
├─ main.cjs             应用生命周期、窗口、IPC、关闭握手
├─ preload.cjs          contextBridge 白名单
├─ storage.cjs          文件校验 + 原子写 + 备份恢复
├─ smoke-test.cjs       存储层自动化冒烟测试
└─ renderer/            前端构建产物（git ignore，不手写）
```

### 5.1 `storage.cjs`

| 常量 | 值 |
|---|---|
| `FILE_NAME` | `vault.cvault` |
| `BACKUP_NAME` | `vault.cvault.bak` |
| `MAX_BYTES` | 20 MB |

必须导出：

```js
init(dir)                      // 确保目录存在
getPath() / exists()
validate(text)                 // 见 CONTRACTS §1，非法抛错
atomicWrite(target, text)      // 写 .tmp(0600) → 复制旧文件到 .bak → rename
read()                         // {ok:true,text,path} | {ok:false,code}
write(text)
writeAs(target, text)
readFrom(target)
backupExists() / restoreBackup()
```

**原子写顺序不可调整**，失败必须返回错误码，不得留下半写文件。

### 5.2 `main.cjs`

- 单实例锁；窗口 1180×780（最小 900×600），`show:false`，`ready-to-show` 再显示，`autoHideMenuBar`。
- 开发：`process.env.VITE_DEV_URL` 存在则 `loadURL`；否则 `loadFile(renderer/index.html)`。
- 注册 IPC：

| 通道 | 行为 |
|---|---|
| `vault:exists` | `storage.exists()` |
| `vault:exists-backup` | `storage.backupExists()` |
| `vault:restore-backup` | `storage.restoreBackup()` |
| `vault:path` | `storage.getPath()` |
| `vault:read` | `storage.read()` |
| `vault:write` | `storage.write(text)` |
| `vault:save-as` | `dialog.showSaveDialog` → `storage.writeAs` |
| `vault:open` | `dialog.showOpenDialog` → `storage.readFrom` |
| `app:close-confirmed` | 置允许退出标记并 `win.close()` |

- `app.getPath('userData')` 下调用 `storage.init()`。
- `Menu.setApplicationMenu(null)`。

### 5.3 `preload.cjs`

严格按 `docs/CONTRACTS.md` §3 暴露 10 个成员：`isDesktop`、`vaultExists`、`backupExists`、`restoreBackup`、`vaultPath`、`readVault`、`writeVault`、`saveAs`、`openVault`、`onBeforeClose`、`confirmClose`。

### 5.4 `smoke-test.cjs`

在 `os.tmpdir()` 下依次验证并输出 `desktop storage smoke test passed`：

1. 初始文件不存在；
2. 非法内容被拒绝；
3. 合法内容写入后可读回；
4. 第二次写入生成 `.bak`；
5. 正式文件损坏时读取失败；
6. `restoreBackup()` 能恢复。

### 5.5 `package.json`

```json
{
  "name": "ciphervault-desktop",
  "version": "1.0.0",
  "main": "main.cjs",
  "scripts": {
    "dev": "concurrently -k \"npm:dev:renderer\" \"npm:dev:electron\"",
    "dev:renderer": "npm --prefix ../frontend run dev",
    "dev:electron": "wait-on tcp:5173 && cross-env VITE_DEV_URL=http://localhost:5173 electron .",
    "build:renderer": "npm --prefix ../frontend run build",
    "dist": "npm run build:renderer && electron-builder --win nsis portable",
    "dist:dir": "npm run build:renderer && electron-builder --win --dir"
  }
}
```

electron-builder 关键配置：`appId: com.ciphervault.desktop`、`productName: CipherVault`、输出 `release/`、`files` 只含 `main.cjs/preload.cjs/storage.cjs/package.json/renderer/**`、win targets `nsis` + `portable`（x64）、`artifactName` 分别为 `CipherVault-Setup-${version}.${ext}` 与 `CipherVault-Portable-${version}.${ext}`。

---

## 6. 本地验证命令

```powershell
cd CipherVault-App\desktop
npm install
node --check main.cjs
node --check preload.cjs
node --check storage.cjs
node smoke-test.cjs

# 开发模式（需要 frontend 依赖已安装）
npm run dev

# 打包
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"
npm run dist
```

> 首次打包若在解压 `winCodeSign` 时报「无法创建符号链接」，是归档内 macOS 符号链接导致。可手动把该压缩包中 `windows-*`、`rcedit-*.exe` 解压到
> `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0\`（跳过 `darwin`），再重试。

---

## 7. 提交规范

```bash
git add CipherVault-App/desktop
git commit -m "feat(desktop): electron shell with offline atomic vault storage"
git push origin main
```

- 只允许改动 `CipherVault-App/desktop/**`；**禁止**修改 `docs/`、`frontend/`、`packages/`、根目录文件。
- 不要提交 `node_modules/`、`renderer/`、`release/`（已在 `.gitignore`）。

---

## 8. 完成清单

- [ ] 6 个文件齐全，行为符合 `docs/CONTRACTS.md`。
- [ ] `node --check` 三文件通过，`node smoke-test.cjs` 输出 `passed`。
- [ ] `npm run dev` 能打开窗口，断网可用。
- [ ] `npm run dist` 产出两个 `.exe`（约 78 MB 各一个）。
- [ ] 未引入网络请求；未暴露任意文件读写。
- [ ] 只改 `desktop/**`，已推送 main。
