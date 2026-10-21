# 前端镜像：Node 构建 → nginx 托管（由组员 C 维护；源码由组员 A 提供）
FROM node:20-alpine AS build

WORKDIR /app

# 依赖层缓存：需要 frontend/package-lock.json 存在（组员 A 提交后才会生成）
COPY frontend/package.json frontend/package-lock.json* /app/frontend/
RUN cd /app/frontend && npm ci

COPY frontend /app/frontend

ARG VITE_API_BASE=/api/v1
ENV VITE_API_BASE=${VITE_API_BASE}
RUN cd /app/frontend && npm run build

FROM nginx:alpine
COPY --from=build /app/frontend/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
