# 本地文件契约（冻结）

> **状态：v2.0 已冻结（单机版）。**
> 变更必须由项目负责人同意，并同步更新本文件 + `docs/ALGORITHM.md` + 三份任务书。
> 前端（A）与桌面壳（B）**不得**自行增删字段、改名 IPC 通道、变更编码方式。

---

## 0. 通用约定

| 项 | 约定 |
|---|---|
| 二进制编码 | **一律十六进制小写字符串（hex）**，全项目统一，不用 base64 |
| 文本编码 | UTF-8（无 BOM） |
| 文件名 | `vault.cvault`；备份 `vault.cvault.bak`；临时 `vault.cvault.tmp` |
| 单文件上限 | 20 MB |
| 网络 | **无**。本版没有任何 API 端点、账号或同步 |

**保险箱文件位置**

```
app.getPath('userData') / vault.cvault        // Windows: %APPDATA%\CipherVault\vault.cvault
```

**浏览器调试模式**

`frontend` 独立运行时（无 Electron bridge），同一份 JSON 文本存入 `localStorage['ciphervault_vault_file']`；格式完全一致。

---

## 1. 文件格式 `ciphervault/vault`

`vault.cvault` 是 UTF-8 JSON（写入时 2 空格缩进），结构固定：

```json
{
  "format": "ciphervault/vault",
  "formatVersion": 1,
  "kdf": { "salt": "<hex, 16B → 32 字符>", "iters": 200000 },
  "iv": "<hex, 12B → 24 字符>",
  "ct": "<hex, AES-GCM 密文 ‖ 16B 认证标签>"
}
```

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `format` | string | 必须等于 `"ciphervault/vault"` | 固定标识 |
| `formatVersion` | number | 必须等于 `1` | 格式版本 |
| `kdf.salt` | string | 32 位 hex | 创建保险箱时随机生成，此后不变 |
| `kdf.iters` | number | 10000 ≤ iters ≤ 2000000 | 默认 200000 |
| `iv` | string | 24 位 hex | **每次写入都必须重新随机生成** |
| `ct` | string | 非空 hex | 密文与 GCM 认证标签 |

**校验规则（读取时必须全部满足，否则拒绝加载）**

1. 能 `JSON.parse`，且顶层是对象。
2. `format === "ciphervault/vault"`。
3. `formatVersion === 1`。
4. `kdf.salt` 匹配 `/^[0-9a-f]{32}$/`；`kdf.iters` 为整数且在范围内。
5. `iv` 匹配 `/^[0-9a-f]{24}$/`。
6. `ct` 匹配 `/^[0-9a-f]+$/` 且长度非 0。
7. 文件大小 ≤ 20 MB。

> 桌面壳 `storage.cjs` 做 1–3 与基本类型校验；前端 `storage/vaultFile.ts` 做完整校验。两层都不可省略。

---

## 2. 明文文档 `VaultDoc`（只在内存，**永不落盘**）

```ts
type RuleName = 'letter' | 'number' | 'poem';

interface EntryKeycard {
  saltHex: string;   // 32 hex（16B）
  ivHex: string;     // 32 hex（16B，注意不是 12B）
  ctHex: string;
  tagHex: string;    // 64 hex（32B）
  iters: number;     // 钥匙卡固定 200000
  display: string;   // 由 ctHex 编码得到的趣味显示串
}

interface Entry {
  id: string;
  name: string;
  account: string;
  password: string;
  category: string;
  notes: string;
  fav: boolean;
  ts: number;
  skin: { name: string; rules: RuleName[] };
  kc?: EntryKeycard;
}

interface VaultDoc {
  entries: Entry[];
  categories: string[];
  settings: { autoLockMin: number; clipboardClearSec: number };
}
```

- `VaultDoc` 序列化为 UTF-8 JSON 后由 `vaultKey` 加密，**只有密文写入文件**。
- `kc` 为可选字段：保存条目时若密码非空则重新生成；密码清空则删除。

---

## 3. IPC 契约（preload 暴露给渲染进程）

`window.ciphervault` 仅暴露以下白名单方法；主进程**不提供**任意路径读写。

```ts
interface CipherVaultBridge {
  isDesktop: true;
  vaultExists(): Promise<boolean>;
  backupExists(): Promise<boolean>;
  restoreBackup(): Promise<{ ok: boolean; code?: string; error?: string }>;
  vaultPath(): Promise<string>;
  readVault(): Promise<{ ok: boolean; text?: string; path?: string; code?: string; error?: string }>;
  writeVault(text: string): Promise<{ ok: boolean; path?: string; code?: string; error?: string }>;
  saveAs(text: string, suggestedName: string): Promise<{ ok: boolean; path?: string; code?: string; error?: string }>;
  openVault(): Promise<{ ok: boolean; text?: string; name?: string; code?: string; error?: string }>;
  onBeforeClose(callback: () => void): void;
  confirmClose(): void;
}
```

| 通道 | 方向 | 说明 |
|---|---|---|
| `vault:exists` | invoke | 文件是否存在 |
| `vault:exists-backup` | invoke | 备份是否存在 |
| `vault:restore-backup` | invoke | 备份覆盖正式文件 |
| `vault:path` | invoke | 返回 `vault.cvault` 绝对路径 |
| `vault:read` | invoke | 读取并校验，返回文本 |
| `vault:write` | invoke | 校验后原子写入（`.tmp` → `.bak` → rename） |
| `vault:save-as` | invoke | 弹出保存对话框，写用户选定路径 |
| `vault:open` | invoke | 弹出打开对话框，读取用户选定文件 |
| `app:before-close` | main → renderer | 关闭前请求落盘 |
| `app:close-confirmed` | renderer → main | 落盘完成，允许退出 |

**错误码**

| code | 含义 |
|---|---|
| `ENOENT` | 文件不存在 |
| `EINVALID` | 内容不是合法的 `ciphervault/vault` |
| `ETOOLARGE` | 超过 20 MB |
| `EIO` | 读写失败 |
| `ECANCELED` | 用户取消对话框 |

---

## 4. 原子写入顺序（硬性）

```
1. 校验 text（≤20MB、JSON 可解析、format/formatVersion/iv/ct/kdf.salt 合法）
2. 写 vault.cvault.tmp（权限 0600）
3. 若 vault.cvault 存在 → 复制为 vault.cvault.bak（覆盖旧备份）
4. rename(vault.cvault.tmp → vault.cvault)
```

任一步失败都必须返回错误，**不得**让正式文件处于半写状态。

---

## 5. 变更流程

1. 任何字段 / IPC 变更 → 先在群里提出，由负责人裁决。
2. 负责人在本文件更新版本号（v2.1、v2.2…）与变更记录。
3. 同步更新 `docs/ALGORITHM.md`（若涉及加密）与相关任务书。
4. 三人拉取最新 `docs/` 后再改代码。

**变更记录**

| 版本 | 日期 | 内容 | 负责人 |
|---|---|---|---|
| v1.0 | 2026-10-20 | 首次冻结（HTTP API + 服务端数据模型） | 负责人 |
| v2.0 | 2026-10-21 | 改为单机版：本地 `vault.cvault` 文件契约 + IPC；HTTP 端点作废（见 `archive/cloud-sync`） | 负责人 |
