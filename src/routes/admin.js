import { promises as fs } from 'fs'
import prisma from '../utils/database.js'

export default async function adminRoutes(fastify) {
  
  // 管理员权限检查中间件
  const requireAdmin = async (request, reply) => {
    try {
      await request.jwtVerify()
      
      if (request.user.role !== 'ADMIN') {
        return reply.code(403).send({
          error: 'FORBIDDEN',
          message: '需要管理员权限'
        })
      }
    } catch (error) {
      return reply.code(401).send({
        error: 'UNAUTHORIZED',
        message: '未授权访问'
      })
    }
  }
  
  // 获取系统统计信息
  fastify.get('/stats', {
    preHandler: requireAdmin
  }, async (request, reply) => {
    try {
      const [
        userCount,
        imageCount,
        totalSize,
        todayImages
      ] = await Promise.all([
        prisma.user.count(),
        prisma.image.count(), // 所有图片
        prisma.image.aggregate({
          _sum: { size: true }
        }),
        prisma.image.count({
          where: {
            createdAt: {
              gte: new Date(new Date().setHours(0, 0, 0, 0))
            }
          }
        })
      ])
      
      return {
        success: true,
        stats: {
          userCount,
          imageCount,
          totalSize: totalSize._sum.size || 0,
          todayImages
        }
      }
      
    } catch (error) {
      fastify.log.error('获取系统统计失败:', error)
      return reply.code(500).send({
        error: 'GET_STATS_FAILED',
        message: '获取系统统计失败'
      })
    }
  })
  
  // 获取用户列表
  fastify.get('/users', {
    preHandler: requireAdmin,
    schema: {
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          search: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { page = 1, limit = 20, search } = request.query
      const skip = (page - 1) * limit
      
      const where = search ? {
        OR: [
          { username: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } }
        ]
      } : {}
      
      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          skip,
          take: limit,
          select: {
            id: true,
            username: true,
            email: true,
            role: true,
            isActive: true,
            createdAt: true,
            _count: {
              select: {
                images: true
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          }
        }),
        prisma.user.count({ where })
      ])
      
      return {
        success: true,
        users: users.map(user => ({
          ...user,
          imageCount: user._count.images
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      }
      
    } catch (error) {
      fastify.log.error('获取用户列表失败:', error)
      return reply.code(500).send({
        error: 'GET_USERS_FAILED',
        message: '获取用户列表失败'
      })
    }
  })
  
  // 更新用户状态
  fastify.put('/users/:id/status', {
    preHandler: requireAdmin,
    schema: {
      body: {
        type: 'object',
        required: ['isActive'],
        properties: {
          isActive: { type: 'boolean' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { id } = request.params
      const { isActive } = request.body
      
      const user = await prisma.user.update({
        where: { id },
        data: { isActive },
        select: {
          id: true,
          username: true,
          isActive: true
        }
      })
      
      return {
        success: true,
        message: `用户已${isActive ? '启用' : '禁用'}`,
        user
      }
      
    } catch (error) {
      fastify.log.error('更新用户状态失败:', error)
      return reply.code(500).send({
        error: 'UPDATE_USER_STATUS_FAILED',
        message: '更新用户状态失败'
      })
    }
  })
  
  // 获取图片管理列表
  fastify.get('/images', {
    preHandler: requireAdmin,
    schema: {
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          userId: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { page = 1, limit = 20, userId } = request.query
      const skip = (page - 1) * limit
      
      const where = {}
      if (userId) {
        where.userId = userId
      }      const [images, total] = await Promise.all([
        prisma.image.findMany({
          where,
          skip,
          take: limit,
          include: {
            user: {
              select: {
                id: true,
                username: true
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          }
        }),
        prisma.image.count({ where })
      ])
      
      return {
        success: true,
        images,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      }
      
    } catch (error) {
      fastify.log.error('获取图片管理列表失败:', error)
      return reply.code(500).send({
        error: 'GET_ADMIN_IMAGES_FAILED',
        message: '获取图片管理列表失败'
      })
    }
  })
  
  // 删除图片（物理删除）
  fastify.delete('/images/:id', {
    preHandler: requireAdmin
  }, async (request, reply) => {
    try {
      const { id } = request.params
      
      // 先获取图片信息
      const imageToDelete = await prisma.image.findUnique({
        where: { id }
      })
      
      if (!imageToDelete) {
        return reply.code(404).send({
          error: 'IMAGE_NOT_FOUND',
          message: '图片不存在'
        })
      }
      
      // 物理删除文件
      if (imageToDelete.path) {
        try {
          await fs.unlink(imageToDelete.path)
          console.log('文件已物理删除:', imageToDelete.path)
        } catch (error) {
          console.warn('删除文件失败:', error)
        }
      }
      
      // 从数据库删除记录
      await prisma.image.delete({
        where: { id }
      })
      
      return {
        success: true,
        message: '图片删除成功'
      }
      
    } catch (error) {
      fastify.log.error('删除图片失败:', error)
      return reply.code(500).send({
        error: 'DELETE_IMAGE_FAILED',
        message: '删除图片失败'
      })
    }
  })
  
  // 获取内存缓存统计
  fastify.get('/cache/stats', {
    preHandler: requireAdmin
  }, async (request, reply) => {
    try {
      const { cache } = await import('../utils/cache.js')
      const stats = cache.getStats()
      
      return {
        success: true,
        stats: {
          ...stats,
          memory: {
            used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
          }
        }
      }
      
    } catch (error) {
      fastify.log.error('获取缓存统计失败:', error)
      return reply.code(500).send({
        error: 'GET_CACHE_STATS_FAILED',
        message: '获取缓存统计失败'
      })
    }
  })
  
  // 清空内存缓存
  fastify.delete('/cache', {
    preHandler: requireAdmin
  }, async (request, reply) => {
    try {
      const { cache } = await import('../utils/cache.js')
      cache.clear()
      
      return {
        success: true,
        message: '内存缓存已清空'
      }
      
    } catch (error) {
      fastify.log.error('清空缓存失败:', error)
      return reply.code(500).send({
        error: 'CLEAR_CACHE_FAILED',
        message: '清空缓存失败'
      })
    }
  })
  fastify.get('/config', {
    preHandler: requireAdmin
  }, async (request, reply) => {
    try {
      const configs = await prisma.config.findMany()
      
      const configMap = {}
      configs.forEach(config => {
        let value = config.value
        try {
          if (config.type === 'json') {
            value = JSON.parse(config.value)
          } else if (config.type === 'boolean') {
            value = config.value === 'true'
          } else if (config.type === 'number') {
            value = parseFloat(config.value)
          }
        } catch (error) {
          // 保持原始字符串值
        }
        configMap[config.key] = value
      })
      
      return {
        success: true,
        config: configMap
      }
      
    } catch (error) {
      fastify.log.error('获取系统配置失败:', error)
      return reply.code(500).send({
        error: 'GET_CONFIG_FAILED',
        message: '获取系统配置失败'
      })
    }
  })
  
  // 更新系统配置
  fastify.put('/config', {
    preHandler: requireAdmin,
    schema: {
      body: {
        type: 'object',
        additionalProperties: true
      }
    }
  }, async (request, reply) => {
    try {
      const configData = request.body
      
      for (const [key, value] of Object.entries(configData)) {
        let stringValue = String(value)
        let type = 'string'
        
        if (typeof value === 'boolean') {
          type = 'boolean'
        } else if (typeof value === 'number') {
          type = 'number'
        } else if (typeof value === 'object') {
          type = 'json'
          stringValue = JSON.stringify(value)
        }
        
        await prisma.config.upsert({
          where: { key },
          update: { value: stringValue, type },
          create: { key, value: stringValue, type }
        })
      }
      
      return {
        success: true,
        message: '系统配置更新成功'
      }
      
    } catch (error) {
      fastify.log.error('更新系统配置失败:', error)
      return reply.code(500).send({
        error: 'UPDATE_CONFIG_FAILED',
        message: '更新系统配置失败'
      })
    }
  })

  // 创建用户
  fastify.post('/user', {
    preHandler: [requireAdmin],
    schema: {
      body: {
        type: 'object',
        required: ['username', 'email', 'password', 'role'],
        properties: {
          username: { type: 'string', minLength: 3, maxLength: 20 },
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 6 },
          role: { type: 'string', enum: ['USER', 'ADMIN'] }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { username, email, password, role } = request.body

      // 检查用户名和邮箱是否已存在
      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [
            { username },
            { email }
          ]
        }
      })

      if (existingUser) {
        return reply.code(400).send({
          error: 'USER_EXISTS',
          message: '用户名或邮箱已存在'
        })
      }

      // 创建用户
      const hashedPassword = await fastify.bcrypt.hash(password)
      const user = await prisma.user.create({
        data: {
          username,
          email,
          password: hashedPassword,
          role,
          isActive: true
        }
      })

      return {
        success: true,
        message: '用户创建成功',
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          isActive: user.isActive
        }
      }

    } catch (error) {
      fastify.log.error('创建用户失败:', error)
      return reply.code(500).send({
        error: 'CREATE_USER_FAILED',
        message: '创建用户失败'
      })
    }
  })

  // 更新用户
  fastify.put('/user/:id', {
    preHandler: [requireAdmin],
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        }
      },
      body: {
        type: 'object',
        properties: {
          username: { type: 'string', minLength: 3, maxLength: 20 },
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 6 },
          role: { type: 'string', enum: ['USER', 'ADMIN'] }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { id } = request.params
      const { username, email, password, role } = request.body

      // 检查用户是否存在
      const existingUser = await prisma.user.findUnique({
        where: { id }
      })

      if (!existingUser) {
        return reply.code(404).send({
          error: 'USER_NOT_FOUND',
          message: '用户不存在'
        })
      }

      // 检查用户名和邮箱是否被其他用户使用
      if (username || email) {
        const conflictUser = await prisma.user.findFirst({
          where: {
            AND: [
              { id: { not: id } },
              {
                OR: [
                  username ? { username } : undefined,
                  email ? { email } : undefined
                ].filter(Boolean)
              }
            ]
          }
        })

        if (conflictUser) {
          return reply.code(400).send({
            error: 'USER_CONFLICT',
            message: '用户名或邮箱已被其他用户使用'
          })
        }
      }

      // 准备更新数据
      const updateData = {}
      if (username) updateData.username = username
      if (email) updateData.email = email
      if (role) updateData.role = role
      if (password) updateData.password = await fastify.bcrypt.hash(password)

      // 更新用户
      const user = await prisma.user.update({
        where: { id },
        data: updateData
      })

      return {
        success: true,
        message: '用户更新成功',
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          isActive: user.isActive
        }
      }

    } catch (error) {
      fastify.log.error('更新用户失败:', error)
      return reply.code(500).send({
        error: 'UPDATE_USER_FAILED',
        message: '更新用户失败'
      })
    }
  })

  // 删除用户
  fastify.delete('/user/:id', {
    preHandler: [requireAdmin]
  }, async (request, reply) => {
    try {
      const { id } = request.params

      // 检查用户是否存在
      const existingUser = await prisma.user.findUnique({
        where: { id }
      })

      if (!existingUser) {
        return reply.code(404).send({
          error: 'USER_NOT_FOUND',
          message: '用户不存在'
        })
      }

      // 不能删除自己
      if (id === request.user.userId) {
        return reply.code(400).send({
          error: 'CANNOT_DELETE_SELF',
          message: '不能删除自己的账户'
        })
      }

      // 删除用户（注意：这会级联删除相关的图片等数据）
      await prisma.user.delete({
        where: { id }
      })

      return {
        success: true,
        message: '用户删除成功'
      }

    } catch (error) {
      fastify.log.error('删除用户失败:', error)
      return reply.code(500).send({
        error: 'DELETE_USER_FAILED',
        message: '删除用户失败'
      })
    }
  })

  // 获取单个用户信息
  fastify.get('/user/:id', {
    preHandler: [requireAdmin]
  }, async (request, reply) => {
    try {
      const { id } = request.params

      const user = await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          isActive: true,
          createdAt: true,
          updatedAt: true
        }
      })

      if (!user) {
        return reply.code(404).send({
          error: 'USER_NOT_FOUND',
          message: '用户不存在'
        })
      }

      return { user }

    } catch (error) {
      fastify.log.error('获取用户信息失败:', error)
      return reply.code(500).send({
        error: 'GET_USER_FAILED',
        message: '获取用户信息失败'
      })
    }
  })
}
