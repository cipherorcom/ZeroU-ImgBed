# Docker 部署指南

## GitHub Container Registry

本项目已配置自动构建Docker镜像并推送到GitHub Container Registry (ghcr.io)。

### 多架构支持

本项目支持以下CPU架构：
- **linux/amd64** (x86_64) - Intel/AMD 处理器
- **linux/arm64** (ARM64) - Apple M1/M2、ARM 服务器

Docker 会自动选择匹配您系统架构的镜像版本。

### 可用镜像标签

- `ghcr.io/cipherorcom/zerou-imgbed:latest` - 最新稳定版本
- `ghcr.io/cipherorcom/zerou-imgbed:main` - 主分支最新版本
- `ghcr.io/cipherorcom/zerou-imgbed:develop` - 开发分支版本
- `ghcr.io/cipherorcom/zerou-imgbed:v*` - 发布版本标签

### 验证架构支持

```bash
# 查看镜像支持的架构
docker buildx imagetools inspect ghcr.io/cipherorcom/zerou-imgbed:latest

# 强制拉取特定架构的镜像
docker pull --platform linux/amd64 ghcr.io/cipherorcom/zerou-imgbed:latest
docker pull --platform linux/arm64 ghcr.io/cipherorcom/zerou-imgbed:latest
```

## 部署方式

### 1. 使用 Docker Compose (推荐)

```bash
# 下载生产环境配置
wget https://raw.githubusercontent.com/cipherorcom/zerou-ImgBed/main/docker-compose.prod.yml

# 设置环境变量
echo "JWT_SECRET=your-super-secret-jwt-key-$(openssl rand -hex 32)" > .env

# 启动服务
docker-compose -f docker-compose.prod.yml up -d
```

### 2. 直接使用 Docker

```bash
# 拉取镜像
docker pull ghcr.io/cipherorcom/zerou-imgbed:latest

# 创建数据卷
docker volume create zerou-uploads
docker volume create zerou-db

# 运行容器
docker run -d \
  --name zerou-imgbed \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e JWT_SECRET=your-super-secret-jwt-key \
  -e DATABASE_URL=file:./prisma/db/production.db \
  -v zerou-uploads:/app/uploads \
  -v zerou-db:/app/prisma/db \
  --restart unless-stopped \
  ghcr.io/cipherorcom/zerou-imgbed:latest
```

### 3. 使用 Docker Swarm

```bash
# 初始化 Swarm (如果还没有)
docker swarm init

# 部署服务
docker stack deploy -c docker-compose.prod.yml zerou-imgbed
```

## 环境变量

| 变量名 | 描述 | 默认值 | 必需 |
|--------|------|--------|------|
| `NODE_ENV` | 运行环境 | `production` | 否 |
| `PORT` | 服务端口 | `3000` | 否 |
| `JWT_SECRET` | JWT密钥 | - | 是 |
| `DATABASE_URL` | 数据库连接 | `file:./prisma/db/production.db` | 否 |

## 健康检查

镜像包含健康检查端点：`/health`

```bash
# 检查服务状态
curl http://localhost:3000/health
```

## 数据持久化

确保挂载以下目录：
- `/app/uploads` - 上传的图片文件
- `/app/prisma/db` - SQLite数据库文件

## 更新部署

```bash
# 拉取最新镜像
docker pull ghcr.io/cipherorcom/zerou-imgbed:latest

# 重启服务
docker-compose -f docker-compose.prod.yml up -d --force-recreate
```

## 监控和日志

```bash
# 查看容器日志
docker logs zerou-imgbed

# 实时查看日志
docker logs -f zerou-imgbed

# 查看容器状态
docker stats zerou-imgbed
```

## 安全建议

1. 使用强随机JWT密钥
2. 配置防火墙规则
3. 定期更新镜像
4. 使用HTTPS (配置Nginx反向代理)
5. 限制容器资源使用

## 故障排除

### 常见问题

1. **容器启动失败**
   ```bash
   docker logs zerou-imgbed
   ```

2. **数据库连接问题**
   - 检查DATABASE_URL环境变量
   - 确保数据库目录有写权限

3. **上传功能异常**
   - 检查uploads目录权限
   - 确保磁盘空间充足

### 重置部署

```bash
# 停止并删除容器
docker-compose -f docker-compose.prod.yml down

# 删除数据卷 (注意：这会删除所有数据)
docker volume rm zerou-imgbed_uploads zerou-imgbed_db

# 重新部署
docker-compose -f docker-compose.prod.yml up -d
```
