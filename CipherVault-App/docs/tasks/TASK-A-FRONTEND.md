# 任务书 A —— 前端（React + Vite + WebCrypto）

> 交付人：组员 A ｜ 目录：`CipherVault-App/frontend/`
> 你（Qwen Code）的工作目录：**`CipherVault-App/`**，你只允许改动 **`CipherVault-App/frontend/**`**。
> 本任务书对应**单机离线版 v2.0**：没有后端、没有账号、没有任何网络请求。

---

## 1. 你的角色与一句话目标

你是 CipherVault 的**前端工程师（组员 A）**，同时承担「加密实现」职责——**本项目所有加解密都在前端完成**。

**一句话职责**：React 界面 + 用 WebCrypto 实现 `docs/ALGORITHM.md` + 通过 `window.ciphervault` 读写本地加密文件 + 生成离线钥匙卡。

**验收标准（一句话）**：`npm run lint`、`npm run test -- --run`、`npm run build` 全过；手动跑通「设置主密码 → 新增条目 → 看到趣味显示 → 下载 HTML/Python 钥匙卡 → 锁定再解锁数据仍在 → 导出/导入加密备份」。

---

## 2. 开工前必读

| 文件 | 为什么读 |
|---|---|
| `docs/ALGORITHM.md` | ★ 逐字实现：PBKDF2、AES-GCM、HMAC 流加密、皮肤映射 |
| `docs/CONTRACTS.md` | ★ `vault.cvault` 格式、`VaultDoc` 字段、IPC 白名单、错误码 |
| `docs/ARCHITECTURE.md` | 单机安全模型与四条铁律 |
| `docs/tasks/TASK-B-DESKTOP.md` | 你调用的 `window.ciphervault` 由桌面壳提供 |

确认 `CipherVault-App/frontend/` 可写，且 `npm ci` 能安装依赖。

---

## 3. 技术选型（已定，不得更换）

| 项 | 选择 |
|---|---|
| 框架 | React 18 + TypeScript |
| 构建 | Vite 5，`base: './'`，输出到 `../desktop/renderer` |
| 状态 | zustand |
| 加密 | 浏览器原生 `window.crypto.subtle`（不引入第三方加密库） |
| 测试 | Vitest |
| 代码规范 | ESLint（`--max-warnings 0`） |

**禁止**：`axios` / `fetch` / WebSocket / 任何形式的联网；`localStorage` 只允许在浏览器调试模式（无 Electron bridge）下存整库密文，键名 `ciphervault_vault_file`。

---

## 4. 目录与文件（必须与下表一致）

```
frontend/
├─ package.json
├─ vite.config.ts
├─ src/
│  ├─ main.tsx / App.tsx
│  ├─ types.ts                     Entry / EntryKeycard / VaultDoc / VaultFile
│  ├─ vite-env.d.ts                window.ciphervault 类型声明
│  ├─ crypto/
│  │  ├─ kdf.ts                    deriveDk / deriveVaultKey（PBKDF2）
│  │  ├─ vault.ts                  encryptVault / decryptVault（AES-GCM）
│  │  ├─ stream.ts                 keycardEncrypt / keycardDecrypt（HMAC 流）
│  │  ├─ skin.ts                   encodeToken / decodeToken + 内置皮肤
│  │  ├─ keycard.ts                createEntryKeycard（生成 kc 载荷）
│  │  ├─ generator.ts / strength.ts
│  ├─ storage/vaultFile.ts         文件读写、格式校验、浏览器降级
│  ├─ state/
│  │  ├─ session.ts                主密码派生结果（仅内存）
│  │  ├─ vaultStore.ts             条目 / 分类 / 设置
│  │  └─ persistence.ts            400ms 防抖自动保存 + flush
│  ├─ keycard/buildHtml.ts         生成单文件 HTML 钥匙卡
│  ├─ keycard/buildPy.ts           生成单文件 Python 钥匙卡
│  ├─ pages/                       Onboarding / Unlock / Vault / Settings / Help
│  ├─ components/                  抽屉、卡片、弹窗、Toast、强度条…
│  ├─ lib/                         hex、id
│  ├─ styles/                      global.css、tokens.css
│  └─ tests/                       keycard / keycard-export / skin / vault
```

---

## 5. 加密实现（必须逐字一致）

### 5.1 密钥派生

```
dk = PBKDF2-HMAC-SHA256(UTF8(主密码), salt=16B, iters=200000, dkLen=64)
vaultKey = dk[0:32]      // 仅内存，不写日志、不落盘
```

### 5.2 整库加密

```
pt = UTF8(JSON.stringify(VaultDoc))
iv = 12B 随机
ct = AES-GCM-256(vaultKey, iv, pt)      // WebCrypto 结果含 16B tag
```

### 5.3 钥匙卡（条目级）

```
salt = 16B 随机；iv = 16B 随机
dk   = PBKDF2-HMAC-SHA256(主密码, salt, 200000, 64)
ENC  = dk[0:32]；MAC = dk[32:64]
ks   = HMAC-SHA256(ENC, iv ‖ uint32be(counter)) 依次拼接
ct   = 条目密码 XOR ks
tag  = HMAC-SHA256(MAC, iv ‖ ct)                 // 恒定时间比较
```

### 5.4 趣味显示（安全红线）

- 保存条目时生成 `kc = { saltHex, ivHex, ctHex, tagHex, iters, display }`。
- `display = encodeToken(ctHex, skin.rules)`。
- **严禁**把条目密码（或其 hex）交给 `encodeToken`；换皮肤只重算 `display`。

---

## 6. 关键行为

### 6.1 首次进入（`Onboarding`）

1. 明确告诉用户「这是设置主密码，不是登录；主密码不保存、忘记无法找回」。
2. 校验：≥6 位、两次一致。
3. 生成 salt → 派生 `vaultKey` → 加密空 `VaultDoc` → 写 `vault.cvault`。
4. `setSession` + `loadDoc`，进入主界面。

### 6.2 解锁（`Unlock`）

1. `readVaultText()` → `parseVaultFile()` 校验。
2. 用文件内 `salt`/`iters` + 输入主密码派生 `vaultKey`。
3. `decryptVault` 失败提示「主密码不正确或数据已损坏」。
4. 支持「从保险箱文件导入」与「从备份恢复」。

### 6.3 自动保存

- 监听 `entries / categories / settings` 变化，400ms 防抖。
- `flush()`：从 session 取 `vaultKey/salt/iters` → 加密 → 组装 `VaultFile` → 写文件。
- 锁定、关闭窗口、导出备份前都必须先 `flush()`。

### 6.4 自动锁定与关闭握手

- 解锁后立即启动计时器（默认 5 分钟）。
- 触发时先 `flush()` 再 `lock()`；`lock()` 同时清空 `vaultKey` 与 `vaultStore` 明文。
- Electron 下监听 `onBeforeClose`：`await flush()` → `confirmClose()`。

### 6.5 钥匙卡

- 条目抽屉展示 `kc.display`；无 `kc` 时提示「保存后生成趣味显示（由密文编码，不含明文）」。
- 导出 HTML / Python 两个单文件，内嵌载荷，零依赖、可离线运行。
- Python 文件必须含可导入函数 `kc_decrypt(master_password, payload=None)`，错误主密码抛 `ValueError`。
- HTML 中嵌入 JSON 时必须转义 `<`（防 `</script>` 注入），结果区用 `textContent`。

### 6.6 设置页

- 自动锁定分钟数。
- 显示保险箱文件位置。
- 导出加密备份（`.cvault`）、从文件导入、恢复上次备份、立即锁定。
- **不得**出现服务器地址、账号、同步等字段。

---

## 7. 本地验证命令

```powershell
cd CipherVault-App\frontend
npm ci
npm run lint
npm run test -- --run
npm run build        # 产物写入 ../desktop/renderer
```

手动验收（桌面壳就位后）：

```powershell
cd ..\desktop
npm run dev
```

---

## 8. 完成清单

- [ ] 上述目录与文件齐全，无 `api/`、无网络请求。
- [ ] `npm run lint` 0 warning；`npm run test -- --run` 全过（含 4 条跨语言向量）。
- [ ] `npm run build` 成功。
- [ ] 手动 5 项全通（引导 → 新增 → 趣味显示 → 双格式钥匙卡 → 重新解锁）。
- [ ] 趣味显示确认由 `ctHex` 生成（单测断言不含明文）。
- [ ] 锁定后内存中无 `vaultKey` 与明文。
- [ ] 只改 `frontend/**`，已推送 main。
