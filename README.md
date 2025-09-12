# 🖼️ ZeroU图床项目

基于 Node.js + Fastify + Prisma + SQLite 的现代化图片存储服务

## 📦 快速开始

### 安装
```bash
npm install
cp .env.example .env
mkdir -p database uploads
```

### 初始化数据库
```bash
npx prisma generate && npx prisma db push
npm run seed
```

### 启动
```bash
npm run dev
```

访问 http://localhost:3000 (管理员: admin/admin123)

## API

- `POST /api/auth/login` - 登录
- `POST /api/upload/single` - 上传图片
- `GET /image/:id` - 查看图片
- `GET /api/admin/stats` - 管理统计

## 🚀 部署

### Docker 部署 (推荐)
```bash
# 1. 构建镜像
docker build -t imgbed .

# 2. 运行容器
docker run -d -p 3000:3000 \
  -v $(pwd)/uploads:/app/uploads \
  -v $(pwd)/database:/app/database \
  imgbed

# 3. 使用 docker-compose
docker-compose up -d
```

### 生产环境
```bash
# 1. 安装依赖
npm ci --only=production

# 2. 配置环境
cp .env.example .env
# 编辑 .env 设置生产配置

# 3. 初始化数据库
npx prisma generate && npx prisma db push
npm run seed

# 4. 启动服务
npm start

# 5. PM2 管理 (可选)
npm install -g pm2
pm2 start src/app.js --name imgbed
```

### Nginx 配置 (可选)
```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location /uploads/ {
        alias /path/to/uploads/;
        expires 1y;
    }
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
    }
}
```

## 技术栈

Node.js + Fastify + Prisma + SQLite + Sharp

MIT License
