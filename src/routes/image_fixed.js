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
      
      // 图片存在且可访问，继续处理
      
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
      
      // 构建图片路径
      const imagePath = path.resolve(image.path)
      
      // 检查文件是否存在
      try {
        await fs.access(imagePath)
      } catch (error) {
        return reply.code(404).send('图片文件不存在')
      }
      
      // 如果是下载请求，设置下载头
      if (download === '1') {
        reply.header('Content-Disposition', `attachment; filename="${image.originalName}"`)
      }
      
      // 如果没有指定尺寸参数，直接返回原图
      if (!w && !h) {
        reply.type(image.mimetype)
        const buffer = await fs.readFile(imagePath)
        return reply.send(buffer)
      }
      
      // 进行图片处理
      try {
        let processedBuffer
        const sharpInstance = sharp(imagePath)
        
        // 获取原图信息
        const metadata = await sharpInstance.metadata()
        
        // 计算缩放尺寸
        let targetWidth = w ? parseInt(w) : null
        let targetHeight = h ? parseInt(h) : null
        
        // 如果只指定了一个维度，按比例计算另一个维度
        if (targetWidth && !targetHeight) {
          targetHeight = Math.round((targetWidth / metadata.width) * metadata.height)
        } else if (targetHeight && !targetWidth) {
          targetWidth = Math.round((targetHeight / metadata.height) * metadata.width)
        }
        
        // 应用缩放和质量设置
        sharpInstance.resize(targetWidth, targetHeight, {
          fit: 'inside',
          withoutEnlargement: true
        })
        
        // 根据图片格式设置质量
        if (image.mimetype === 'image/jpeg') {
          sharpInstance.jpeg({ quality: parseInt(q) })
        } else if (image.mimetype === 'image/png') {
          sharpInstance.png({ quality: parseInt(q) })
        } else if (image.mimetype === 'image/webp') {
          sharpInstance.webp({ quality: parseInt(q) })
        }
        
        processedBuffer = await sharpInstance.toBuffer()
        
        reply.type(image.mimetype)
        return reply.send(processedBuffer)
        
      } catch (error) {
        fastify.log.error('图片处理失败:', error)
        // 如果处理失败，返回原图
        reply.type(image.mimetype)
        const buffer = await fs.readFile(imagePath)
        return reply.send(buffer)
      }
      
    } catch (error) {
      fastify.log.error('获取图片失败:', error)
      return reply.code(500).send('获取图片失败')
    }
  })

  // 直接获取原图文件（不进行处理）
  fastify.get('/:id/raw', async (request, reply) => {
    try {
      const { id } = request.params
      
      const image = await prisma.image.findUnique({
        where: { id }
      })
      
      if (!image) {
        return reply.code(404).send('图片不存在')
      }
      
      // 构建图片路径
      const imagePath = path.resolve(image.path)
      
      // 检查文件是否存在
      try {
        await fs.access(imagePath)
      } catch (error) {
        return reply.code(404).send('图片文件不存在')
      }
      
      reply.type(image.mimetype)
      const buffer = await fs.readFile(imagePath)
      return reply.send(buffer)
      
    } catch (error) {
      fastify.log.error('获取图片失败:', error)
      return reply.code(500).send('获取图片失败')
    }
  })
  
  // 获取图片信息（JSON格式）
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
      
      // 由于现在直接物理删除，如果能找到记录就说明图片存在
      
      return {
        success: true,
        image: {
          id: image.id,
          originalName: image.originalName,
          filename: image.filename,
          size: image.size,
          width: image.width,
          height: image.height,
          mimetype: image.mimetype,
          url: image.url,
          viewCount: image.viewCount,
          downloadCount: image.downloadCount,
          isPublic: image.isPublic,
          createdAt: image.createdAt,
          user: image.user
        }
      }
      
    } catch (error) {
      fastify.log.error('获取图片信息失败:', error)
      return reply.code(500).send({
        error: 'GET_IMAGE_INFO_FAILED',
        message: '获取图片信息失败'
      })
    }
  })

  // 删除图片
  fastify.delete('/:id', {
    preHandler: async (request, reply) => {
      try {
        const token = request.headers.authorization?.replace('Bearer ', '')
        if (!token) {
          return reply.code(401).send({
            error: 'UNAUTHORIZED',
            message: '请先登录'
          })
        }
        
        const decoded = fastify.jwt.verify(token)
        request.user = decoded
      } catch (error) {
        return reply.code(401).send({
          error: 'UNAUTHORIZED',
          message: '无效的认证信息'
        })
      }
    }
  }, async (request, reply) => {
    try {
      const { id } = request.params
      const userId = request.user.userId
      
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
        error: 'DELETE_IMAGE_FAILED',
        message: '删除图片失败'
      })
    }
  })
  
  // 获取图片列表
  fastify.get('/list', {
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
          include: {
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
      fastify.log.error('获取图片列表失败:', error)
      return reply.code(500).send({
        error: 'GET_IMAGE_LIST_FAILED',
        message: '获取图片列表失败'
      })
    }
  })
  
  // 更新图片信息
  fastify.put('/:id', {
    preHandler: async (request, reply) => {
      try {
        const token = request.headers.authorization?.replace('Bearer ', '')
        if (!token) {
          return reply.code(401).send({
            error: 'UNAUTHORIZED',
            message: '请先登录'
          })
        }
        
        const decoded = fastify.jwt.verify(token)
        request.user = decoded
      } catch (error) {
        return reply.code(401).send({
          error: 'UNAUTHORIZED',
          message: '无效的认证信息'
        })
      }
    },
    schema: {
      body: {
        type: 'object',
        properties: {
          isPublic: { type: 'boolean' },
          tags: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { id } = request.params
      const { isPublic, tags } = request.body
      const userId = request.user.userId
      
      const image = await prisma.image.findUnique({
        where: { id }
      })
      
      if (!image) {
        return reply.code(404).send({
          error: 'IMAGE_NOT_FOUND',
          message: '图片不存在'
        })
      }
      
      // 检查权限（只有图片所有者或管理员可以编辑）
      if (image.userId !== userId && request.user.role !== 'ADMIN') {
        return reply.code(403).send({
          error: 'FORBIDDEN',
          message: '没有权限编辑此图片'
        })
      }
      
      const updateData = {}
      if (typeof isPublic === 'boolean') {
        updateData.isPublic = isPublic
      }
      if (tags !== undefined) {
        updateData.tags = tags
      }
      
      if (Object.keys(updateData).length === 0) {
        return reply.code(400).send({
          error: 'NO_UPDATE_DATA',
          message: '没有需要更新的数据'
        })
      }
      
      const updatedImage = await prisma.image.update({
        where: { id },
        data: updateData
      })
      
      return {
        success: true,
        image: updatedImage
      }
      
    } catch (error) {
      fastify.log.error('更新图片信息失败:', error)
      return reply.code(500).send({
        error: 'UPDATE_IMAGE_FAILED',
        message: '更新图片信息失败'
      })
    }
  })
}
