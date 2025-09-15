# 使用官方 Node.js 18 Debian 镜像 (更好的 Prisma 兼容性)
FROM node:18-slim

# 安装必要的系统依赖
RUN apt-get update && apt-get install -y \
    build-essential \
    ca-certificates \
    curl \
    openssl \
    python3 \
    wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 复制package文件并安装依赖
COPY package*.json ./
RUN npm ci && \
    npm cache clean --force

# 复制应用代码和入口脚本
COPY . .
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && \
    npx prisma generate && \
    npm prune --production

# 创建必要的目录
RUN mkdir -p uploads database

EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "src/app.js"]
