# CipherVault 前端

React 18 + TypeScript + Vite + zustand 构建的密码保险箱 SPA。

全部加密发生在浏览器端，使用 `window.crypto.subtle` 实现。

## 快速开始

```bash
npm install
npm run dev        # 启动开发服务器 (默认 http://localhost:5173)
npm run build      # 生产构建
npm run test       # 运行测试
npm run lint       # 代码检查
```

## 环境变量

复制 `.env.example` 为 `.env`，修改 `VITE_API_BASE` 指向后端。

## 技术栈

- React 18.3 / TypeScript 5.4
- Vite 5
- zustand 4.5（状态管理）
- vitest 1.5（测试）

## 目录结构

```
src/
├── api/          API 客户端（与后端通信）
├── crypto/       加密算法（kdf、vault、stream、skin）
├── keycard/      钥匙卡生成器（HTML/Python）
├── lib/          工具函数
├── state/        状态管理（session、vault）
├── components/   可复用组件
├── pages/        页面组件
├── styles/       CSS 样式
└── tests/        单元测试
```