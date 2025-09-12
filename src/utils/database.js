import { PrismaClient } from '@prisma/client'

// 创建Prisma客户端实例
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['warn', 'error'],
  errorFormat: 'pretty'
})

// 优雅关闭处理
process.on('beforeExit', async () => {
  console.log('📦 Prisma client disconnecting...')
  await prisma.$disconnect()
})

// 健康检查函数
export async function checkDatabaseHealth() {
  try {
    await prisma.$queryRaw`SELECT 1`
    return { status: 'healthy', timestamp: new Date().toISOString() }
  } catch (error) {
    return { 
      status: 'unhealthy', 
      error: error.message, 
      timestamp: new Date().toISOString() 
    }
  }
}

// 数据库统计函数
export async function getDatabaseStats() {
  try {
    const [userCount, imageCount, configCount, logCount] = await Promise.all([
      prisma.user.count(),
      prisma.image.count(),
      prisma.config.count(),
      prisma.operationLog.count()
    ])

    const [activeImages, totalSize] = await Promise.all([
      prisma.image.count(),
      prisma.image.aggregate({
        _sum: { size: true }
      })
    ])

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    
    const todayImages = await prisma.image.count({
      where: {
        createdAt: { gte: todayStart }
      }
    })

    return {
      users: userCount,
      totalImages: imageCount,
      activeImages,
      deletedImages: imageCount - activeImages,
      totalStorageBytes: totalSize._sum.size || 0,
      todayUploads: todayImages,
      configs: configCount,
      operationLogs: logCount
    }
  } catch (error) {
    throw new Error(`获取数据库统计失败: ${error.message}`)
  }
}

// 清理已删除的图片记录（现在直接物理删除，此函数保留用于清理孤立记录）
export async function cleanupDeletedImages(daysOld = 30) {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - daysOld)
  
  try {
    // 现在直接物理删除，所以这里只是返回0，保持接口兼容
    return { deletedCount: 0 }
  } catch (error) {
    throw new Error(`清理已删除图片失败: ${error.message}`)
  }
}

// 用户相关数据库操作
export const userOperations = {
  async create(userData) {
    return await prisma.user.create({ data: userData })
  },
  
  async findByEmail(email) {
    return await prisma.user.findUnique({ where: { email } })
  },
  
  async findById(id) {
    return await prisma.user.findUnique({ 
      where: { id },
      include: { 
        images: {
          where: { status: { not: 'DELETED' } },
          orderBy: { createdAt: 'desc' },
          take: 10
        }
      }
    })
  },
  
  async updateStatus(id, isActive) {
    return await prisma.user.update({
      where: { id },
      data: { isActive }
    })
  }
}

// 图片相关数据库操作
export const imageOperations = {
  async create(imageData) {
    return await prisma.image.create({ data: imageData })
  },
  
  async findById(id) {
    return await prisma.image.findUnique({
      where: { id },
      include: { user: { select: { id: true, username: true } } }
    })
  },
  
  async incrementViewCount(id) {
    return await prisma.image.update({
      where: { id },
      data: { viewCount: { increment: 1 } }
    })
  },
  
  async incrementDownloadCount(id) {
    return await prisma.image.update({
      where: { id },
      data: { downloadCount: { increment: 1 } }
    })
  },
  
  async findUserImages(userId, page = 1, limit = 20) {
    const skip = (page - 1) * limit
    
    const [images, total] = await Promise.all([
      prisma.image.findMany({
        where: { 
          userId,
          status: { not: 'DELETED' }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.image.count({
        where: { 
          userId
        }
      })
    ])
    
    return {
      images,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    }
  }
}

// 配置相关数据库操作
export const configOperations = {
  async get(key) {
    const config = await prisma.config.findUnique({ where: { key } })
    if (!config) return null
    
    // 根据类型转换值
    switch (config.type) {
      case 'number':
        return parseFloat(config.value)
      case 'boolean':
        return config.value === 'true'
      case 'json':
        try {
          return JSON.parse(config.value)
        } catch {
          return config.value
        }
      default:
        return config.value
    }
  },
  
  async set(key, value, type = 'string', description = null, category = 'general') {
    const stringValue = type === 'json' ? JSON.stringify(value) : String(value)
    
    return await prisma.config.upsert({
      where: { key },
      update: { 
        value: stringValue, 
        type, 
        description,
        category,
        updatedAt: new Date()
      },
      create: { 
        key, 
        value: stringValue, 
        type, 
        description,
        category
      }
    })
  },
  
  async getByCategory(category = 'general') {
    const configs = await prisma.config.findMany({
      where: { category },
      orderBy: { key: 'asc' }
    })
    
    const result = {}
    configs.forEach(config => {
      result[config.key] = this.parseValue(config.value, config.type)
    })
    
    return result
  },
  
  parseValue(value, type) {
    switch (type) {
      case 'number':
        return parseFloat(value)
      case 'boolean':
        return value === 'true'
      case 'json':
        try {
          return JSON.parse(value)
        } catch {
          return value
        }
      default:
        return value
    }
  }
}

// 操作日志相关数据库操作
export const logOperations = {
  async create(logData) {
    return await prisma.operationLog.create({ data: logData })
  },
  
  async findRecent(limit = 100) {
    return await prisma.operationLog.findMany({
      include: {
        user: { select: { username: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    })
  },
  
  async findByUser(userId, limit = 50) {
    return await prisma.operationLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit
    })
  }
}

export default prisma
