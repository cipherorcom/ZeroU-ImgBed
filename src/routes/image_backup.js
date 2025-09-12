import { promises as fs } from 'fs'
import path from 'path'
import sharp from 'sharp'
import prisma from '../utils/database.js'

export default async function imageRoutes(fastify) {
  
  // 直接获取图片文件
  fastify.get('/:id', async (request, reply) => {
    try {
      const { id } = request.params
      const { w, h, q = 85, download } = request.query // 支持宽度、高度、质量参数，以及强制下载
      
      const image = await prisma.image.findUnique({
        where: { id }
      })
      
      if (!image) {
        return reply.code(404).send('图片不存在')
      }
      
      // 由于现在直接物理删除，如果能找到记录就说明图片存在
      
      // 根据请求类型增加对应的计数
      if (download === '1') {
        // 增加下载计数
        await prisma.image.update({
          where: { id },
          data: {
            downloadCount: {
              increment: 1
            }
          }
        })
      } else {
        // 增加查看计数
        await prisma.image.update({
          where: { id },
          data: {
            viewCount: {
              increment: 1
            }
          }
        })
      }
      
      // 读取图片文件 - 使用数据库中存储的实际路径
      const imagePath = path.resolve(image.path)
      
      // 检查文件是否存在
      try {
        await fs.access(imagePath)
      } catch (error) {
        return reply.code(404).send('图片文件不存在')
      }
      
      // 设置正确的响应头
      reply.header('Content-Type', image.mimetype || 'application/octet-stream')
      
      // 设置文件名和Content-Disposition
      if (download === '1') {
        // 强制下载：使用原始文件名
        reply.header('Content-Disposition', `attachment; filename="${image.originalName}"`)
      } else {
        // 在线查看：使用inline模式，并设置文件名
        reply.header('Content-Disposition', `inline; filename="${image.originalName}"`)
        // 设置缓存头，提高加载性能
        reply.header('Cache-Control', 'public, max-age=31536000') // 1年缓存
        reply.header('ETag', `"${image.id}-${image.updatedAt.getTime()}"`)
      }
      
      // 如果有尺寸参数，使用 Sharp 进行处理
      if (w || h) {
        try {
          let sharpInstance = sharp(imagePath)
          
          // 获取原始图片信息
          const metadata = await sharpInstance.metadata()
          
          // 计算新尺寸
          let width = w ? parseInt(w) : null
          let height = h ? parseInt(h) : null
          
          if (width && !height) {
            height = Math.round((width / metadata.width) * metadata.height)
          } else if (height && !width) {
            width = Math.round((height / metadata.height) * metadata.width)
          }
          
          // 调整大小
          if (width || height) {
            sharpInstance = sharpInstance.resize(width, height, {
              fit: sharp.fit.inside,
              withoutEnlargement: true
            })
          }
          
          // 设置质量
          if (image.mimetype === 'image/jpeg') {
            sharpInstance = sharpInstance.jpeg({ quality: parseInt(q) })
          } else if (image.mimetype === 'image/png') {
            sharpInstance = sharpInstance.png({ quality: parseInt(q) })
          } else if (image.mimetype === 'image/webp') {
            sharpInstance = sharpInstance.webp({ quality: parseInt(q) })
          }
          
          const buffer = await sharpInstance.toBuffer()
          return reply.send(buffer)
          
        } catch (error) {
          fastify.log.error('图片处理失败:', error)
          // 如果处理失败，返回原图
        }
      }
      
      // 返回原图
      const imageBuffer = await fs.readFile(imagePath)
      return reply.send(imageBuffer)
      
    } catch (error) {
      fastify.log.error('获取图片失败:', error)
      return reply.code(500).send('获取图片失败')
    }
  })

  // 删除图片
  fastify.delete('/:id', {
    preHandler: async function(request, reply) {
      const authHeader = request.headers.authorization
      if (!authHeader) {
        return reply.code(401).send({ error: 'UNAUTHORIZED', message: '未授权访问' })
      }
      
      try {
        const token = authHeader.split(' ')[1]
        const { jwt } = await import('@fastify/jwt')
        const payload = this.jwt.verify(token)
        request.user = payload
      } catch (error) {
        return reply.code(401).send({ error: 'UNAUTHORIZED', message: '无效的访问令牌' })
      }
    }
  }, async (request, reply) => {
    try {
      const { id } = request.params
      const userId = request.user.userId
      
      // 检查图片是否存在且属于用户
      const image = await prisma.image.findUnique({
        where: { id }
      })
      
      if (!image) {
        return reply.code(404).send({
          error: 'IMAGE_NOT_FOUND',
          message: '图片不存在'
        })
      }
      
      // 检查权限（只有图片所有者或管理员可以删除）
      if (image.userId !== userId && request.user.role !== 'ADMIN') {
        return reply.code(403).send({
          error: 'FORBIDDEN',
          message: '没有权限删除此图片'
        })
      }
      
      // 直接物理删除记录和文件
      await prisma.image.delete({
        where: { id }
      })
      
      // 删除物理文件
      try {
        await fs.unlink(image.path)
      } catch (error) {
        fastify.log.warn('删除文件失败:', error)
      }
      
      return {
        success: true,
        message: '图片删除成功'
      }
      
    } catch (error) {
      fastify.log.error('删除图片失败:', error)
      return reply.code(500).send({
        error: 'DELETE_FAILED',
        message: '删除图片失败'
      })
    }
  })

  // 图片列表接口
  fastify.get('/', {
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
      
      const where = {
        isPublic: true
      }
      
      if (userId) {
        where.userId = userId
      }
      
      const [images, total] = await Promise.all([
        prisma.image.findMany({
          where,
          select: {
            id: true,
            filename: true,
            originalName: true,
            url: true,
            mimetype: true,
            size: true,
            width: true,
            height: true,
            createdAt: true,
            user: {
              select: {
                id: true,
                username: true
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit
        }),
        prisma.image.count({ where })
      ])
      
      return {
        images,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    } catch (error) {
      fastify.log.error('获取图片列表失败:', error)
      return reply.code(500).send({
        error: 'GET_IMAGES_FAILED',
        message: '获取图片列表失败'
      })
    }
  })

  // 获取图片详情
  fastify.get('/:id/info', async (request, reply) => {
    try {
      const { id } = request.params
      
      const image = await prisma.image.findUnique({
        where: { id },
        include: {
          user: {
            select: {
              id: true,
              username: true
            }
          }
        }
      })
      
      if (!image) {
        return reply.code(404).send({
          error: 'IMAGE_NOT_FOUND',
          message: '图片不存在'
        })
      }
      
      return {
        id: image.id,
        filename: image.filename,
        originalName: image.originalName,
        url: image.url,
        mimetype: image.mimetype,
        size: image.size,
        width: image.width,
        height: image.height,
        viewCount: image.viewCount,
        downloadCount: image.downloadCount,
        isPublic: image.isPublic,
        createdAt: image.createdAt,
        updatedAt: image.updatedAt,
        user: image.user
      }
    } catch (error) {
      fastify.log.error('获取图片信息失败:', error)
      return reply.code(500).send({
        error: 'GET_IMAGE_INFO_FAILED',
        message: '获取图片信息失败'
      })
    }
  })
}
