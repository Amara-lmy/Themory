# ====== 构建阶段 ======
FROM node:20-alpine AS builder
WORKDIR /app

# 使用腾讯云 npm 镜像加速构建
RUN npm config set registry https://mirrors.cloud.tencent.com/npm/

COPY package*.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ====== 运行阶段 ======
FROM node:20-alpine
WORKDIR /app

# 上海时区 + HTTPS 根证书（调用腾讯云/阿里云 API 必需）
RUN apk add --no-cache tzdata ca-certificates \
  && cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime \
  && echo "Asia/Shanghai" > /etc/timezone

ENV NODE_ENV=production
ENV PORT=80

RUN npm config set registry https://mirrors.cloud.tencent.com/npm/

COPY package*.json ./
# 固定 undici 到 v6（最后一个支持 Node 18+ 的版本），避免 undici v8 在 Node 20 下
# 报 webidl.util.markAsUncloneable；同时规避 @cloudbase/node-sdk 在 Node 22 下
# 签名 Authorization header 时带 \n 导致 ERR_INVALID_CHAR 的 bug
RUN npm install --omit=dev && npm install undici@6 && npm cache clean --force

COPY --from=builder /app/dist ./dist

EXPOSE 80
CMD ["node", "dist/index.js"]
