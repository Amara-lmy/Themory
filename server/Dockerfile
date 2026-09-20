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
RUN npm install --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

EXPOSE 80
CMD ["node", "dist/index.js"]
