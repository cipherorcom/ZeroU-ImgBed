import prisma from '../utils/database.js'
import { cache } from '../utils/cache.js'
import fs from 'fs/promises'

// 获取用户图片统计信息
async function getUserImageStats(userId) {
  try {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    
    const [totalImages, totalSizeResult, todayUploads] = await Promise.all([
      prisma.image.count({
        where: { userId }
      }),
      prisma.image.aggregate({
        where: { userId },
        _sum: { size: true }
      }),
      prisma.image.count({
        where: {
          userId,
          createdAt: { gte: todayStart }
        }
      })
    ])
    
    return {
      totalImages,
      totalSize: totalSizeResult._sum.size || 0,
      todayUploads
    }
  } catch (error) {
    console.error('获取用户统计失败:', error)
    return {
      totalImages: 0,
      totalSize: 0,
      todayUploads: 0
    }
  }
}

export default async function userRoutes(fastify) {
  
  // 获取用户资料
  fastify.get('/profile', {
    preHandler: async (request, reply) => {
      try {
        await request.jwtVerify()
      } catch (error) {
        return reply.code(401).send({
          error: 'UNAUTHORIZED',
          message: '未授权访问'
        })
      }
    }
  }, async (request, reply) => {
    try {
      const { userId } = request.user
      
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          avatar: true,
          createdAt: true,
          _count: {
            select: {
              images: true,
              albums: true
            }
          }
        }
      })
      
      if (!user) {
        return reply.code(404).send({
          error: 'USER_NOT_FOUND',
          message: '用户不存在'
        })
      }
      
      return {
        success: true,
        user: {
          ...user,
          imageCount: user._count.images,
          albumCount: user._count.albums
        }
      }
      
    } catch (error) {
      fastify.log.error('获取用户资料失败:', error)
      return reply.code(500).send({
        error: 'GET_PROFILE_FAILED',
        message: '获取用户资料失败'
      })
    }
  })
  
  // 更新用户资料
  fastify.put('/profile', {
    preHandler: async (request, reply) => {
      try {
        await request.jwtVerify()
      } catch (error) {
        return reply.code(401).send({
          error: 'UNAUTHORIZED',
          message: '未授权访问'
        })
      }
    },
    schema: {
      body: {
        type: 'object',
        properties: {
          avatar: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { userId } = request.user
      const { avatar } = request.body
      
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: { avatar },
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          avatar: true,
          updatedAt: true
        }
      })
      
      // 更新缓存
      await cache.set(`user:${userId}`, JSON.stringify(updatedUser), 3600)
      
      return {
        success: true,
        message: '用户资料更新成功',
        user: updatedUser
      }
      
    } catch (error) {
      fastify.log.error('更新用户资料失败:', error)
      return reply.code(500).send({
        error: 'UPDATE_PROFILE_FAILED',
        message: '更新用户资料失败'
      })
    }
  })
  
  // 获取用户的图片
  fastify.get('/images', {
    preHandler: async (request, reply) => {
      try {
        await request.jwtVerify()
      } catch (error) {
        return reply.code(401).send({
          error: 'UNAUTHORIZED',
          message: '未授权访问'
        })
      }
    },
    schema: {
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { userId } = request.user
      const { page = 1, limit = 20 } = request.query
      const skip = (page - 1) * limit
      
      // 构建查询条件 - 直接查询用户的所有图片
      const where = { userId }
      
      const [images, total] = await Promise.all([
        prisma.image.findMany({
          where,
          skip,
          take: limit,
          orderBy: {
            createdAt: 'desc'
          }
        }),
        prisma.image.count({ where })
      ])
      
      // 获取统计信息
      const stats = await getUserImageStats(userId)
      
      return {
        success: true,
        images,
        stats,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      }
      
    } catch (error) {
      fastify.log.error('获取用户图片失败:', error)
      return reply.code(500).send({
        error: 'GET_USER_IMAGES_FAILED',
        message: '获取用户图片失败'
      })
    }
  })
  
  // 创建相册
  fastify.post('/albums', {
    preHandler: async (request, reply) => {
      try {
        await request.jwtVerify()
      } catch (error) {
        return reply.code(401).send({
          error: 'UNAUTHORIZED',
          message: '未授权访问'
        })
      }
    },
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 50 },
          description: { type: 'string', maxLength: 200 },
          cover: { type: 'string' },
          isPublic: { type: 'boolean', default: true }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { userId } = request.user
      const { name, description, cover, isPublic = true } = request.body
      
      const album = await prisma.album.create({
        data: {
          name,
          description,
          cover,
          isPublic,
          userId
        }
      })
      
      return {
        success: true,
        message: '相册创建成功',
        album
      }
      
    } catch (error) {
      fastify.log.error('创建相册失败:', error)
      return reply.code(500).send({
        error: 'CREATE_ALBUM_FAILED',
        message: '创建相册失败'
      })
    }
  })
  
  // 获取用户相册列表
  fastify.get('/albums', {
    preHandler: async (request, reply) => {
      try {
        await request.jwtVerify()
      } catch (error) {
        return reply.code(401).send({
          error: 'UNAUTHORIZED',
          message: '未授权访问'
        })
      }
    }
  }, async (request, reply) => {
    try {
      const { userId } = request.user
      
      const albums = await prisma.album.findMany({
        where: { userId },
        include: {
          _count: {
            select: {
              images: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      })
      
      return {
        success: true,
        albums: albums.map(album => ({
          ...album,
          imageCount: album._count.images
        }))
      }
      
    } catch (error) {
      fastify.log.error('获取用户相册失败:', error)
      return reply.code(500).send({
        error: 'GET_USER_ALBUMS_FAILED',
        message: '获取用户相册失败'
      })
    }
  })

  // 用户删除自己的图片
  fastify.delete('/images/:id', {
    preHandler: async (request, reply) => {
      try {
        await request.jwtVerify()
      } catch (error) {
        return reply.code(401).send({
          error: 'UNAUTHORIZED',
          message: '未授权访问'
        })
      }
    }
  }, async (request, reply) => {
    try {
      const { userId } = request.user
      const { id } = request.params
      
      // 检查图片是否属于当前用户
      const image = await prisma.image.findUnique({
        where: { id }
      })
      
      if (!image) {
        return reply.code(404).send({
          error: 'IMAGE_NOT_FOUND',
          message: '图片不存在'
        })
      }
      
      if (image.userId !== userId) {
        return reply.code(403).send({
          error: 'FORBIDDEN',
          message: '无权删除此图片'
        })
      }
      
      // 物理删除文件
      if (image.path) {
        try {
          await fs.unlink(image.path)
          console.log('文件已物理删除:', image.path)
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
}
