# 🖼️ ZeroU图床

[![GitHub stars](https://img.shields.io/github/stars/cipherorcom/zerou-ImgBed?style=flat-square)](https://github.com/cipherorcom/zerou-ImgBed/stargazers)
[![GitHub license](https://img.shields.io/github/license/cipherorcom/zerou-ImgBed?style=flat-square)](https://github.com/cipherorcom/zerou-ImgBed/blob/ma## 🚀 性能优化

### 生产环境建议
- 使用 SSD 存储提升 SQLite 性能
- 配置反向代理处理静态文件（如需要）
- 启用 gzip 压缩减少传输大小
- 设置合理的限流参数NSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen?style=flat-square)](https://nodejs.org/)

基于 Node.js + Fastify + SQLite 构建的现代化图片存储服务，支持多架构 Docker 部署。

## ✨ 核心特性

- 🚀 **高性能**: Fastify 框架 + SQLite 数据库，响应速度极快
- 🔐 **安全可靠**: JWT 认证 + API 限流 + 输入验证 + 文件类型检测
- � **功能完整**: 用户系统、游客上传、图片管理、统计面板
- 📦 **部署简单**: Docker 容器化，支持 x86_64 和 ARM64 架构
- 🔧 **配置灵活**: 环境变量控制所有功能开关
- 📊 **监控完善**: 健康检查、访问日志、性能统计

## 🚀 快速部署

### Docker 部署（推荐）

```bash
# 创建工作目录
mkdir zerou-imgbed && cd zerou-imgbed

# 创建环境配置
cat > .env << EOF
# 基础配置
NODE_ENV=production
PORT=3000
JWT_SECRET=your-super-secret-jwt-key-$(openssl rand -hex 32)

# 管理员账户
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-secure-password

# 功能开关
ENABLE_REGISTRATION=true
ENABLE_GUEST_UPLOAD=true
ENABLE_RATE_LIMIT=true

# 文件配置
MAX_FILE_SIZE=10485760
EOF

# 启动服务
docker run -d 
  --name zerou-imgbed 
  --env-file .env 
  -p 3000:3000 
  -v $(pwd)/uploads:/app/uploads 
  -v $(pwd)/database:/app/database 
  --restart unless-stopped 
  ghcr.io/cipherorcom/zerou-imgbed:latest

# 检查服务状态
curl http://localhost:3000/health
```

### Docker Compose 部署

```bash
# 下载配置文件
curl -L https://raw.githubusercontent.com/cipherorcom/zerou-ImgBed/main/docker-compose.prod.yml -o docker-compose.yml

# 创建环境文件
cp docker.env.example .env
# 编辑 .env 文件，设置必要参数

# 启动服务
docker-compose up -d

# 查看日志
docker-compose logs -f
```

## 🔧 配置说明

### 环境变量

| 变量名 | 说明 | 默认值 | 必需 |
|--------|------|--------|------|
| `JWT_SECRET` | JWT 签名密钥 | - | ✅ |
| `ADMIN_USERNAME` | 管理员用户名 | `admin` | - |
| `ADMIN_PASSWORD` | 管理员密码 | `admin123` | ⚠️ |
| `NODE_ENV` | 运行环境 | `development` | - |
| `PORT` | 服务端口 | `3000` | - |
| `ENABLE_REGISTRATION` | 用户注册开关 | `true` | - |
| `ENABLE_GUEST_UPLOAD` | 游客上传开关 | `true` | - |
| `ENABLE_RATE_LIMIT` | API限流开关 | `true` | - |
| `MAX_FILE_SIZE` | 最大文件大小(字节) | `10485760` (10MB) | - |

### 功能开关说明

```bash
# 关闭用户注册（仅管理员可创建用户）
ENABLE_REGISTRATION=false

# 关闭游客上传（需要登录才能上传）
ENABLE_GUEST_UPLOAD=false

# 调整文件大小限制
MAX_FILE_SIZE=52428800  # 50MB
```

### 限流策略

| 接口类型 | 限制次数 | 时间窗口 |
|----------|----------|----------|
| 用户注册 | 20次 | 15分钟 |
| 用户登录 | 30次 | 15分钟 |
| 用户上传 | 50次 | 15分钟 |
| 游客上传 | 20次 | 15分钟 |

## 📱 使用说明

### Web 界面

访问 `http://localhost:3000` 进入主界面：

- **首页**: 上传图片和查看功能介绍
- **我的图片**: 查看已上传的图片（需登录）
- **管理面板**: 系统统计和用户管理（管理员）

### API 接口

#### 认证相关
```bash
# 用户注册
curl -X POST http://localhost:3000/api/auth/register 
  -H "Content-Type: application/json" 
  -d '{"username":"test","email":"test@example.com","password":"123456"}'

# 用户登录
curl -X POST http://localhost:3000/api/auth/login 
  -H "Content-Type: application/json" 
  -d '{"username":"test","password":"123456"}'
```

#### 图片上传
```bash
# 用户上传（需登录）
curl -X POST http://localhost:3000/api/upload/single 
  -H "Authorization: Bearer YOUR_TOKEN" 
  -F "file=@image.jpg"

# 游客上传（无需登录）
curl -X POST http://localhost:3000/api/upload/guest 
  -F "file=@image.jpg"
```

#### 图片访问
```bash
# 查看图片
curl http://localhost:3000/image/IMAGE_ID

# 获取图片信息
curl http://localhost:3000/api/image/IMAGE_ID
```

## 🛠️ 本地开发

```bash
# 1. 克隆项目
git clone https://github.com/cipherorcom/zerou-ImgBed.git
cd zerou-ImgBed

# 2. 安装依赖
npm install

# 3. 配置环境
cp .env.example .env
# 编辑 .env 文件

# 4. 初始化数据库
npm run db:init

# 5. 启动开发服务器
npm run dev
```

### 可用脚本

```bash
npm run dev          # 开发模式启动
npm run start        # 生产模式启动
npm test             # 运行所有测试
npm run test:features    # 功能测试
npm run test:rate-limit  # 限流测试
npm run db:init      # 初始化数据库
npm run generate     # 生成 Prisma 客户端
```

## 🧪 测试验证

项目包含完整的测试套件，确保功能正常：

```bash
# 运行功能测试
npm run test:features

# 运行限流测试  
npm run test:rate-limit

# 手动健康检查
curl http://localhost:3000/health
```

## 🔒 安全特性

1. **身份认证**: JWT Token + HTTP-Only Cookie 双重保护
2. **API限流**: 防止暴力攻击和接口滥用
3. **输入验证**: JSON Schema 严格验证所有输入
4. **文件安全**: 文件类型白名单 + 大小限制
5. **错误处理**: 统一错误处理，避免信息泄露

## 📊 技术架构

### 核心技术栈
- **运行时**: Node.js 18+
- **Web框架**: Fastify 4.x (高性能)
- **数据库**: SQLite + Prisma ORM
- **认证**: @fastify/jwt + bcryptjs
- **限流**: @fastify/rate-limit
- **图像处理**: Sharp
- **容器化**: Docker + Multi-arch

### 项目结构
```
src/
├── app.js              # 应用入口
├── config/             # 配置管理
├── plugins/            # Fastify 插件
├── routes/             # 路由处理
│   ├── auth.js         # 用户认证
│   ├── upload.js       # 文件上传
│   ├── image.js        # 图片管理
│   ├── user.js         # 用户管理
│   └── admin.js        # 管理功能
└── utils/              # 工具函数
    ├── database.js     # 数据库操作
    ├── cache.js        # 缓存管理
    └── logger.js       # 日志处理
```

## 🚨 故障排除

### 常见问题

**服务启动失败**
```bash
# 检查容器日志
docker logs zerou-imgbed

# 检查端口占用
lsof -i :3000

# 检查环境变量
docker exec zerou-imgbed env | grep JWT_SECRET
```

**上传功能异常**
```bash
# 检查存储目录
ls -la uploads/

# 检查磁盘空间
df -h

# 测试上传接口
curl -X POST http://localhost:3000/api/upload/guest 
  -F "file=@test.jpg"
```

**数据库问题**
```bash
# 重新初始化数据库
docker exec zerou-imgbed npm run db:init

# 查看数据库文件
ls -la database/

# 检查数据库连接
docker exec zerou-imgbed npm run studio
```

### 重置和恢复
```bash
# 备份数据
docker exec zerou-imgbed tar -czf backup.tar.gz database/ uploads/

# 完全重置
docker-compose down -v
docker-compose up -d

# 恢复数据
docker exec zerou-imgbed tar -xzf backup.tar.gz
```

## 🔄 更新维护

### 版本更新
```bash
# 停止服务
docker-compose down

# 拉取最新镜像
docker-compose pull

# 重启服务
docker-compose up -d
```

### 数据备份
```bash
# 定期备份脚本
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
docker exec zerou-imgbed tar -czf "/tmp/backup_$DATE.tar.gz" database/ uploads/
docker cp zerou-imgbed:/tmp/backup_$DATE.tar.gz ./
```

## � 性能优化

### 生产环境建议
- 使用 SSD 存储提升 SQLite 性能
- 配置 Nginx 反向代理处理静态文件
- 启用 gzip 压缩减少传输大小
- 设置合理的限流参数

### 扩展方案
- 数据库集群化部署（高并发需求）
- 集成 Redis 缓存（分布式部署）
- 对象存储支持（AWS S3, 阿里云OSS）

## 🤝 参与贡献

欢迎提交 Issue 和 Pull Request！

1. Fork 项目到您的账户
2. 创建功能分支: `git checkout -b feature/amazing-feature`
3. 提交更改: `git commit -m 'Add amazing feature'`
4. 推送分支: `git push origin feature/amazing-feature`
5. 提交 Pull Request

### 开发规范
- 代码风格遵循 ESLint 配置
- 提交信息使用语义化规范
- 新功能需要添加对应测试
- 重要变更需要更新文档

## 📄 开源协议

本项目基于 [MIT License](LICENSE) 开源协议发布。

## � 相关链接

- **项目主页**: [GitHub Repository](https://github.com/cipherorcom/zerou-ImgBed)
- **问题反馈**: [GitHub Issues](https://github.com/cipherorcom/zerou-ImgBed/issues)
- **更新日志**: [Releases](https://github.com/cipherorcom/zerou-ImgBed/releases)
- **Docker镜像**: [GitHub Packages](https://github.com/cipherorcom/zerou-ImgBed/pkgs/container/zerou-imgbed)

---

⭐ **如果这个项目对您有帮助，请考虑给我们一个 Star！**
