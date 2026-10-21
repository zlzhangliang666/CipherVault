# 任务书 C —— 加密核心库 + 跨语言向量 + CI

> 交付人：组员 C ｜ 目录：`CipherVault-App/packages/**`、`CipherVault-App/tools/**`、`CipherVault-App/Makefile`，以及仓库根 `.github/workflows/ci.yml`
> 你（Qwen Code）的工作目录：**`CipherVault-App/`**。
> 本任务书对应**单机离线版 v2.0**；Docker 相关目标已随旧方案归档到分支 `archive/cloud-sync`。

---

## 1. 你的角色与一句话目标

你是 CipherVault 的**核心库与工程化工程师（组员 C）**。前端（TS）与 Python 钥匙卡必须产出一模一样的密文，你负责提供**唯一的 Python 参考实现**与**逐字节测试向量**，并守住 CI。

**一句话职责**：Python 标准库实现 `docs/ALGORITHM.md` + 生成/校验 `vectors.json` + 维护 `Makefile` 与 CI。

---

## 2. 开工前必读

| 文件 | 为什么读 |
|---|---|
| `docs/ALGORITHM.md` | ★ 规格与常量，必须逐字实现 |
| `docs/CONTRACTS.md` | 本地文件格式（你不负责 AES 整库加解密，但要知道字段） |
| `docs/tasks/TASK-A-FRONTEND.md` | 前端是另一端实现，向量是双方的验收基准 |
| `docs/tasks/TASK-B-DESKTOP.md` | 桌面壳与本地存储边界 |

---

## 3. 技术选型（已定，不得更换）

| 项 | 选择 |
|---|---|
| Python | 3.11+ |
| 依赖 | **仅标准库**（`hashlib`、`hmac`、`json`、`argparse`、`getpass`）；开发依赖仅 `pytest`、`ruff` |
| 打包 | `pyproject.toml`（`pip install -e ".[dev]"`） |
| CI | GitHub Actions，仓库根 `.github/workflows/ci.yml` |

**禁止**引入 `cryptography` / `pycryptodome` / `pycryptodomex`。

---

## 4. 必须维护的文件

```
CipherVault-App/
├─ packages/ciphervault-core/
│  ├─ pyproject.toml
│  ├─ README.md
│  ├─ vectors.json                     ★ 4 条冻结向量
│  ├─ src/ciphervault_core/
│  │  ├─ __init__.py
│  │  ├─ hexutil.py
│  │  ├─ kdf.py                       derive / derive_vault_key
│  │  ├─ stream.py                    kc_encrypt / kc_decrypt
│  │  ├─ skin.py                      encode_token / decode_token + 常量
│  │  ├─ keycard.py                   载荷封装
│  │  ├─ vault.py                     参数与长度校验（不解密整库）
│  │  ├─ vectors.py                   --write / --verify
│  │  └─ cli.py                       离线解密命令行
│  └─ tests/
│     ├─ test_kdf.py
│     ├─ test_stream.py
│     ├─ test_skin.py
│     ├─ test_keycard.py
│     └─ test_vectors.py
├─ tools/                             辅助脚本（如有）
├─ Makefile
└─ .github/workflows/ci.yml           ★ 位于仓库根，不在此目录
```

---

## 5. 算法实现要点

```
dk       = PBKDF2-HMAC-SHA256(master, salt16, iters, 64)
ENC/MAC  = dk[:32] / dk[32:]
ks       = HMAC-SHA256(ENC, iv16 ‖ counter.to_bytes(4,'big')) 依次拼接
ct       = pt XOR ks
tag      = HMAC-SHA256(MAC, iv16 ‖ ct)
```

- 解密**先验 tag**（`hmac.compare_digest`），再解密；失败抛 `ValueError("主密码不正确")`。
- 皮肤常量必须与 `docs/ALGORITHM.md` §4 完全一致（`SEP="·"`、16 句古诗）。
- `encode_token` 的输入必须是 `ctHex`；`decode_token` 越界必须抛「第 N 段无法还原」。
- `vectors.py --write` 与 `--verify` 必须幂等：重复生成不改变文件内容。

---

## 6. 测试向量（`vectors.json`）

4 条固定向量：`vec-01-mixed`、`vec-02-poem`、`vec-03-letter`、`vec-04-number`，字段见 `docs/ALGORITHM.md` §6。

**验收要求**

1. 用 `masterPassword` 解 `ctHex`+`tagHex` → `entryPassword`。
2. 错误主密码被 tag 校验拒绝。
3. 固定 `saltHex`/`ivHex` 重新加密 → `ctHex`、`tagHex` 逐字节相同。
4. `encode_token(ctHex) === display`，且 `decode_token(display) === ctHex`。
5. `dk[0:32]` / `dk[32:64]` 与 `vaultKeyHex` / `authHashHex` 逐字节相同。

前端 `src/crypto/vectors.test.ts` 与此文件联调，任何字段改动都会让 CI 红。

---

## 7. Makefile 目标（必须可用）

| 目标 | 行为 |
|---|---|
| `install` | `install-core` + `install-frontend` + `install-desktop` |
| `dev` | `cd desktop && npm run dev` |
| `dev-renderer` | `cd frontend && npm run dev` |
| `test` | `test-core` + `test-frontend` + `test-desktop` |
| `test-core` | `python -m pytest -q` |
| `test-frontend` | `npm run test -- --run` |
| `test-desktop` | `node desktop/smoke-test.cjs` |
| `lint` | `ruff core` + `eslint frontend` + `node --check` 三个 `.cjs` |
| `build` | `cd frontend && npm run build` |
| `dist` | `cd desktop && npm run dist` |
| `vectors` | `python -m ciphervault_core.vectors --write vectors.json` |
| `clean` | 删除构建产物与依赖目录 |

---

## 8. CI 要求（仓库根 `.github/workflows/ci.yml`）

5 个 job：

| job | 触发条件 | 内容 |
|---|---|---|
| `detect` | 总是 | 探测 `packages/ciphervault-core`、`frontend`、`desktop` 是否存在，输出 0/1 |
| `core` | core=1 | `pip install -e ".[dev]"` → `ruff check .` → `pytest -q` |
| `frontend` | frontend=1 | `npm ci` → `lint` → `test -- --run` → `build` |
| `desktop` | desktop=1 | `node --check` 三文件 → `node smoke-test.cjs` |
| `contracts` | core=1 | `python -m ciphervault_core.vectors --verify vectors.json` |

要求：路径均为 `CipherVault-App/...`；**不得**再出现 `backend` job 或 Docker 步骤。

---

## 9. 本地验证命令

```powershell
cd CipherVault-App\packages\ciphervault-core
python -m pip install -e ".[dev]"
python -m ruff check .
python -m pytest -q
python -m ciphervault_core.vectors --verify vectors.json

cd ..\..\frontend
npm ci
npm run lint
npm run test -- --run

cd ..\desktop
node --check main.cjs; node --check preload.cjs; node --check storage.cjs
node smoke-test.cjs
```

---

## 10. 完成清单

- [ ] 核心库仅用标准库，`ruff` 与 `pytest` 全过。
- [ ] `vectors.json` 4 条，`--verify` 通过且与前端 20 个向量用例一致。
- [ ] `Makefile` 所有目标在 `CipherVault-App/` 下可执行。
- [ ] CI 仅含 `detect/core/frontend/desktop/contracts`，无 backend、无 Docker。
- [ ] 未修改 `docs/`、`frontend/`、`desktop/`、`vectors.json` 的内容（生成除外）。
- [ ] 已推送 main。
