# 后端镜像（由组员 C 维护；源码由组员 B 提供）
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# 先装依赖，利用镜像层缓存
COPY backend/pyproject.toml /app/backend/pyproject.toml
RUN pip install --upgrade pip && pip install /app/backend

# 再拷源码
COPY backend/app /app/backend/app

WORKDIR /app/backend

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
