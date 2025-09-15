#!/bin/bash

# ZeroU 图床 Docker 部署脚本
# 使用自定义管理员配置

set -e

echo "🚀 ZeroU 图床 Docker 部署脚本"
echo "=============================="

# 配置变量
CONTAINER_NAME="zerou-imgbed"
IMAGE_NAME="ghcr.io/cipherorcom/zerou-imgbed:latest"
PORT="3000"

# 管理员配置（可以修改这些值）
ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"

# 生成随机 JWT Secret
JWT_SECRET="${JWT_SECRET:-$(openssl rand -hex 32)}"

echo "📋 部署配置："
echo "   容器名称: $CONTAINER_NAME"
echo "   镜像: $IMAGE_NAME"
echo "   端口: $PORT"
echo "   管理员用户名: $ADMIN_USERNAME"
echo "   管理员邮箱: $ADMIN_EMAIL"
echo ""

# 检查是否已有同名容器运行
if docker ps -a --format 'table {{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "⚠️  发现已存在的容器 '$CONTAINER_NAME'"
    read -p "是否停止并删除现有容器？ (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "🛑 停止并删除现有容器..."
        docker stop "$CONTAINER_NAME" 2>/dev/null || true
        docker rm "$CONTAINER_NAME" 2>/dev/null || true
    else
        echo "❌ 部署已取消"
        exit 1
    fi
fi

echo "📦 拉取最新镜像..."
docker pull "$IMAGE_NAME"

echo "🗂️  创建本地目录..."
mkdir -p ./uploads ./database

echo "🚀 启动容器..."
docker run -d \
  --name "$CONTAINER_NAME" \
  -p "$PORT:3000" \
  -e NODE_ENV=production \
  -e JWT_SECRET="$JWT_SECRET" \
  -e DATABASE_URL=file:./database/app.db \
  -e ADMIN_USERNAME="$ADMIN_USERNAME" \
  -e ADMIN_PASSWORD="$ADMIN_PASSWORD" \
  -e ADMIN_EMAIL="$ADMIN_EMAIL" \
  -v "$(pwd)/uploads:/app/uploads" \
  -v "$(pwd)/database:/app/database" \
  --restart unless-stopped \
  "$IMAGE_NAME"

echo ""
echo "✅ 部署完成！"
echo ""
echo "📱 访问地址: http://localhost:$PORT"
echo "👤 管理员登录:"
echo "   用户名: $ADMIN_USERNAME"
echo "   密码: $ADMIN_PASSWORD"
echo "   邮箱: $ADMIN_EMAIL"
echo ""
echo "🔐 JWT Secret: $JWT_SECRET"
echo "   （请保存此密钥用于备份恢复）"
echo ""
echo "📋 常用命令:"
echo "   查看日志: docker logs -f $CONTAINER_NAME"
echo "   停止服务: docker stop $CONTAINER_NAME"
echo "   启动服务: docker start $CONTAINER_NAME"
echo "   删除容器: docker rm -f $CONTAINER_NAME"
echo ""
echo "⚠️  重要提醒: 请在首次登录后立即修改默认密码！"

# 检查容器是否成功启动
sleep 3
if docker ps --format 'table {{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo ""
    echo "🟢 容器状态: 运行中"
    
    # 尝试健康检查
    echo "🏥 执行健康检查..."
    for i in {1..10}; do
        if curl -sf "http://localhost:$PORT/health" > /dev/null 2>&1; then
            echo "✅ 健康检查通过 - 服务已就绪！"
            break
        fi
        echo "⏳ 等待服务启动... ($i/10)"
        sleep 2
    done
else
    echo ""
    echo "🔴 容器状态: 启动失败"
    echo "📋 查看错误日志:"
    docker logs "$CONTAINER_NAME"
fi
