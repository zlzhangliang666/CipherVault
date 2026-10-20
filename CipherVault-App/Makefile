# CipherVault App — 常用命令
# 依赖：make、python3.11、node20、docker（可选）
.PHONY: help install install-core install-backend install-frontend \
        dev-backend dev-frontend test test-core test-backend test-frontend \
        lint build vectors docker-up docker-down clean

PY ?= python
NPM ?= npm

help:
	@echo "install          安装全部依赖"
	@echo "dev-backend      启动后端开发服务器 (:8000)"
	@echo "dev-frontend     启动前端开发服务器 (:5173)"
	@echo "test             运行三组件全部测试"
	@echo "vectors          重新生成跨语言测试向量"
	@echo "docker-up        用 docker compose 启动全套服务"

install: install-core install-backend install-frontend

install-core:
	cd packages/ciphervault-core && $(PY) -m pip install -e ".[dev]"

install-backend:
	cd backend && $(PY) -m pip install -e ".[dev]"

install-frontend:
	cd frontend && $(NPM) install

dev-backend:
	cd backend && $(PY) -m uvicorn app.main:app --reload --port 8000

dev-frontend:
	cd frontend && $(NPM) run dev

test: test-core test-backend test-frontend

test-core:
	cd packages/ciphervault-core && $(PY) -m pytest -q

test-backend:
	cd backend && $(PY) -m pytest -q

test-frontend:
	cd frontend && $(NPM) run test -- --run

lint:
	cd packages/ciphervault-core && $(PY) -m ruff check .
	cd backend && $(PY) -m ruff check .
	cd frontend && $(NPM) run lint

build:
	cd frontend && $(NPM) run build

vectors:
	cd packages/ciphervault-core && $(PY) -m ciphervault_core.vectors --write vectors.json

docker-up:
	docker compose up --build

docker-down:
	docker compose down

clean:
	rm -rf packages/ciphervault-core/build frontend/dist frontend/node_modules
