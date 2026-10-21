# CipherVault App — 单机版常用命令
# 依赖：make、python3.11、node20
.PHONY: help install install-core install-frontend install-desktop \
        dev dev-renderer test test-core test-frontend test-desktop \
        lint build dist dist-dir vectors clean

PY ?= python
NPM ?= npm

help:
	@echo "install           安装全部依赖"
	@echo "dev               启动 Electron 开发模式（前端热更新）"
	@echo "dev-renderer      只启动前端（浏览器调试）"
	@echo "test              运行核心库 / 前端 / 桌面壳全部测试"
	@echo "build             构建前端到 desktop/renderer"
	@echo "dist              打包 Windows 安装包与便携版"
	@echo "vectors           重新生成跨语言测试向量"

install: install-core install-frontend install-desktop

install-core:
	cd packages/ciphervault-core && $(PY) -m pip install -e ".[dev]"

install-frontend:
	cd frontend && $(NPM) ci

install-desktop:
	cd desktop && $(NPM) install

dev:
	cd desktop && $(NPM) run dev

dev-renderer:
	cd frontend && $(NPM) run dev

test: test-core test-frontend test-desktop

test-core:
	cd packages/ciphervault-core && $(PY) -m pytest -q

test-frontend:
	cd frontend && $(NPM) run test -- --run

test-desktop:
	node desktop/smoke-test.cjs

lint:
	cd packages/ciphervault-core && $(PY) -m ruff check .
	cd frontend && $(NPM) run lint
	node --check desktop/main.cjs
	node --check desktop/preload.cjs
	node --check desktop/storage.cjs

build:
	cd frontend && $(NPM) run build

dist:
	cd desktop && $(NPM) run dist

dist-dir:
	cd desktop && $(NPM) run dist:dir

vectors:
	cd packages/ciphervault-core && $(PY) -m ciphervault_core.vectors --write vectors.json

clean:
	rm -rf packages/ciphervault-core/build frontend/node_modules frontend/dist desktop/node_modules desktop/renderer desktop/release
