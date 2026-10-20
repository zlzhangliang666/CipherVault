# CipherVault
带自定义趣味加密的密码保险箱（强加密打底 + 皮肤编码）

## MVP 原型

- **在线运行**（点开即用）：https://zlzhangliang666.github.io/CipherVault/
- 源码：[mvp/index.html](https://github.com/zlzhangliang666/CipherVault/blob/main/mvp/index.html)
- 需求与设计文档：[issue #3 · MVP（HTML 原型 · v3）](https://github.com/zlzhangliang666/CipherVault/issues/3)

> 首次进入会先说明「主密码」是什么；设置主密码后即可存放密码、生成趣味密文，并在条目内下载 HTML / Python 离线钥匙卡。

## 正式产品（CipherVault-App）

前后端分离 + 服务端零知识同步的可部署版本，位于本仓库 [`CipherVault-App/`](CipherVault-App/)。

- 产品说明与目录结构：[CipherVault-App/README.md](CipherVault-App/README.md)
- 架构与安全模型：[docs/ARCHITECTURE.md](CipherVault-App/docs/ARCHITECTURE.md)
- 接口契约（冻结）：[docs/CONTRACTS.md](CipherVault-App/docs/CONTRACTS.md)
- 加密算法规格：[docs/ALGORITHM.md](CipherVault-App/docs/ALGORITHM.md)
- 组员任务书：[docs/tasks/](CipherVault-App/docs/tasks/)

