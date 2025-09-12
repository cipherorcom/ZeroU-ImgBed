# 使用官方 Node.js 18 Debian 镜像 (更好的 Prisma 兼容性)
FROM node:18-slim

# 安装必要的系统依赖
RUN apt-get update && apt-get install -y \
    wget \
    curl \
    build-essential \
    python3 \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 复制package文件并安装依赖
COPY package*.json ./
RUN npm ci && \
    npm cache clean --force

# 复制应用代码并生成Prisma客户端
COPY . .
RUN npx prisma generate && \
    npm prune --production

# 创建必要的目录并设置用户
RUN mkdir -p uploads prisma/db && \
    groupadd --gid 1001 nodejs && \
    useradd --uid 1001 --gid nodejs --shell /bin/bash --create-home nodejs && \
    chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "src/app.js"]
