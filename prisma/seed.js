import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import dotenv from 'dotenv'

// 加载环境变量
dotenv.config()

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 开始初始化数据库...')

  // 获取管理员配置
  const adminUsername = process.env.ADMIN_USERNAME || 'admin'
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123'
  const adminEmail = 'admin@localhost'

  try {
    // 检查管理员用户是否已存在
    const existingAdmin = await prisma.user.findFirst({
      where: {
        OR: [
          { username: adminUsername },
          { role: 'ADMIN' }
        ]
      }
    })

    if (existingAdmin) {
      console.log('✅ 管理员用户已存在，跳过创建')
      console.log(`📋 管理员用户名: ${existingAdmin.username}`)
      return
    }

    // 创建管理员用户
    const hashedPassword = await bcrypt.hash(adminPassword, 10)
    
    const adminUser = await prisma.user.create({
      data: {
        username: adminUsername,
        email: adminEmail,
        password: hashedPassword,
        role: 'ADMIN',
        isActive: true
      }
    })

    console.log('✅ 管理员用户创建成功！')
    console.log(`📋 用户名: ${adminUser.username}`)
    console.log(`📧 邮箱: ${adminUser.email}`)
    console.log(`🔑 密码: ${adminPassword}`)
    console.log(`👑 角色: ${adminUser.role}`)

    // 创建系统配置
    const existingConfig = await prisma.config.findFirst()
    
    if (!existingConfig) {
      await prisma.config.create({
        data: {
          key: 'system_initialized',
          value: 'true',
          type: 'boolean'
        }
      })
      
      await prisma.config.create({
        data: {
          key: 'site_name',
          value: 'ZeroU图床',
          type: 'string'
        }
      })

      await prisma.config.create({
        data: {
          key: 'site_description',
          value: '简单、快速、可靠的图片托管服务',
          type: 'string'
        }
      })

      console.log('✅ 系统配置初始化完成')
    }

  } catch (error) {
    console.error('❌ 初始化失败:', error)
    throw error
  }
}

main()
  .then(async () => {
    console.log('🎉 数据库初始化完成！')
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error('💥 初始化过程中发生错误:', e)
    await prisma.$disconnect()
    process.exit(1)
  })
