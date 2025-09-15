#!/bin/bash
set -e

echo "🔧 初始化数据库..."

# 确保数据库目录存在
mkdir -p /app/database

# 检查数据库是否需要初始化
DB_FILE="/app/database/app.db"
NEEDS_INIT=false

if [ ! -f "$DB_FILE" ]; then
    echo "📄 数据库文件不存在，需要初始化"
    NEEDS_INIT=true
elif [ ! -s "$DB_FILE" ]; then
    echo "📄 数据库文件为空，需要初始化"
    rm -f "$DB_FILE"
    NEEDS_INIT=true
else
    # 检查数据库是否有表
    cd /app && node -e "
    const { PrismaClient } = require('@prisma/client');
    async function checkTables() {
        const prisma = new PrismaClient();
        try {
            await prisma.user.findFirst();
            console.log('✅ 数据库已初始化，跳过迁移');
        } catch (error) {
            if (error.code === 'P2021' || error.message.includes('no such table')) {
                console.log('📄 数据库表不存在，需要初始化');
                process.exit(1);
            } else {
                throw error;
            }
        } finally {
            await prisma.\$disconnect();
        }
    }
    checkTables();
    " || NEEDS_INIT=true
fi

if [ "$NEEDS_INIT" = true ]; then
    echo "� 开始数据库初始化..."
    
    # 运行数据库迁移
    cd /app && npx prisma migrate deploy
    
    # 生成初始管理员用户
    cd /app && node -e "
    const { PrismaClient } = require('@prisma/client');
    const bcrypt = require('bcryptjs');
    
    // 从环境变量获取管理员配置，提供默认值作为后备
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
    
    async function createAdmin() {
        const prisma = new PrismaClient();
        try {
            // 检查是否已有管理员用户
            const admin = await prisma.user.findFirst({
                where: { role: 'ADMIN' }
            });
            
            if (!admin) {
                const hashedPassword = await bcrypt.hash(adminPassword, 10);
                await prisma.user.create({
                    data: {
                        username: adminUsername,
                        email: adminEmail,
                        password: hashedPassword,
                        role: 'ADMIN',
                        isActive: true
                    }
                });
                console.log('✅ 默认管理员用户已创建');
                console.log('   用户名: ' + adminUsername);
                console.log('   邮箱: ' + adminEmail);
                console.log('   密码: ' + adminPassword);
                console.log('   请登录后立即修改密码！');
            } else {
                console.log('✅ 管理员用户已存在');
            }
        } catch (error) {
            console.error('❌ 创建管理员用户失败:', error);
        } finally {
            await prisma.\$disconnect();
        }
    }
    
    createAdmin();
    "
    
    echo "✅ 数据库初始化完成"
fi

echo "🚀 启动应用..."
exec "$@"
