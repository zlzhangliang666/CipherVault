# CipherVault 前端

React 18 + TypeScript + Vite + zustand 构建的**单机**密码保险箱界面。

全部加密发生在渲染进程，使用 `window.crypto.subtle` 实现；数据只写入本机 `vault.cvault`，**无任何网络请求**。

## 快速开始

```bash
npm install
npm run dev        # 开发服务器 (http://localhost:5173)，浏览器调试模式数据存 localStorage
npm run build      # 生产构建，产物写入 ../desktop/renderer
npm run test       # 运行测试
npm run lint       # 代码检查
```

## 桌面集成

- 在 `desktop/` 下 `npm run dev` 会以 Electron 启动并由 `window.ciphervault` 提供本地文件读写。
- 无 Electron bridge（纯浏览器）时，数据存入 `localStorage['ciphervault_vault_file']`，便于快速改 UI。

## 技术栈

- React 18.3 / TypeScript 5.4
- Vite 5（`base: './'`，输出 `../desktop/renderer`）
- zustand 4.5（状态管理）
- vitest 1.6（测试）

## 目录结构

```
src/
├── crypto/       加密算法（kdf、vault、stream、skin、keycard）
├── storage/      vault.cvault 文件读写与格式校验
├── keycard/      钥匙卡生成器（HTML/Python）
├── lib/          工具函数
├── state/        状态管理（session、vault、persistence）
├── components/   可复用组件
├── pages/        页面组件（Onboarding / Unlock / Vault / Settings / Help）
├── styles/       CSS 样式
└── tests/        单元测试
```