import { promises as fs } from 'fs'
import path from 'path'
import { nanoid } from 'nanoid'
import sharp from 'sharp'
import prisma from '../utils/database.js'
import { rateLimitConfigs } from '../utils/rateLimiter.js'
import { config } from '../config/index.js'

export default async function uploadRoutes(fastify) {
  
  // 单文件上传 - 应用严格限流
  fastify.post('/single', {
    config: {
      rateLimit: {
        max: 50, // 每15分钟最多50次上传
        timeWindow: 900000
      }
    },
    preHandler: async (request, reply) => {
      try {
        await request.jwtVerify()
      } catch (error) {
        return reply.code(401).send({
          error: 'UNAUTHORIZED',
          message: '请先登录'
        })
      }
    }
  }, async (request, reply) => {
    let tempFilePath = null
    
    try {
      fastify.log.info('开始处理文件上传', { 
        userId: request.user.userId,
        userAgent: request.headers['user-agent']
      })
      
      // 获取上传的文件
      const data = await request.file()
      
      if (!data) {
        fastify.log.warn('未找到上传文件')
        return reply.code(400).send({
          error: 'NO_FILE',
          message: '请选择要上传的文件'
        })
      }

      // 验证文件类型
      const allowedTypes = [
        'image/jpeg', 
        'image/jpg', 
        'image/png', 
        'image/gif', 
        'image/webp',
        'image/svg+xml'
      ]
      
      if (!allowedTypes.includes(data.mimetype)) {
        fastify.log.warn('不支持的文件类型', { 
          mimetype: data.mimetype,
          filename: data.filename 
        })
        return reply.code(400).send({
          error: 'INVALID_TYPE',
          message: '只支持 JPEG、PNG、GIF、WebP、SVG 格式的图片'
        })
      }

      // 读取文件缓冲区
      const buffer = await data.toBuffer()
      const fileSizeMB = (buffer.length / 1024 / 1024).toFixed(2)
      
      // 检查文件大小限制 (默认10MB)
      const maxSizeMB = 10
      if (buffer.length > maxSizeMB * 1024 * 1024) {
        return reply.code(400).send({
          error: 'FILE_TOO_LARGE',
          message: `文件大小不能超过 ${maxSizeMB}MB，当前文件: ${fileSizeMB}MB`
        })
      }

      fastify.log.debug('文件信息', {
        filename: data.filename,
        mimetype: data.mimetype,
        size: `${fileSizeMB}MB`
      })

      // 生成唯一文件ID和路径
      const fileId = nanoid(21)
      const ext = path.extname(data.filename || '.jpg').toLowerCase()
      const filename = `${fileId}${ext}`
      
      // 按日期分目录存储
      const today = new Date()
      const yearMonth = `${today.getFullYear()}/${(today.getMonth() + 1).toString().padStart(2, '0')}`
      const uploadDir = path.resolve('uploads', yearMonth)
      const filePath = path.join(uploadDir, filename)
      tempFilePath = filePath

      // 确保上传目录存在
      await fs.mkdir(uploadDir, { recursive: true })

      // 获取图片元数据
      let imageInfo = { width: null, height: null, format: null }
      
      if (data.mimetype !== 'image/svg+xml') {
        try {
          const metadata = await sharp(buffer).metadata()
          imageInfo = {
            width: metadata.width,
            height: metadata.height,
            format: metadata.format
          }
          
          fastify.log.debug('图片元数据', imageInfo)
        } catch (error) {
          fastify.log.warn('无法读取图片元数据', { error: error.message })
          // SVG或其他格式，继续处理
        }
      }

      // 保存文件到磁盘
      await fs.writeFile(filePath, buffer)
      fastify.log.info('文件已保存', { path: filePath })

      // 保存到数据库
      const image = await prisma.image.create({
        data: {
          id: fileId,
          filename,
          originalName: data.filename || 'unknown',
          path: filePath,
          url: `/image/${fileId}`,
          mimetype: data.mimetype,
          size: buffer.length,
          width: imageInfo.width,
          height: imageInfo.height,
          userId: request.user.userId
        }
      })

      // 记录操作日志
      await prisma.operationLog.create({
        data: {
          action: 'upload',
          resource: 'image',
          resourceId: image.id,
          details: JSON.stringify({
            filename: image.filename,
            originalName: image.originalName,
            size: image.size,
            mimetype: image.mimetype
          }),
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
          userId: request.user.userId
        }
      })

      fastify.log.info('文件上传成功', {
        imageId: image.id,
        filename: image.filename,
        size: fileSizeMB + 'MB'
      })

      return {
        success: true,
        message: '上传成功',
        data: {
          id: image.id,
          filename: image.filename,
          originalName: image.originalName,
          url: image.url,
          size: image.size,
          width: image.width,
          height: image.height,
          mimetype: image.mimetype,
          uploadTime: image.createdAt
        }
      }

    } catch (error) {
      fastify.log.error('文件上传失败', {
        error: error.message,
        stack: error.stack,
        userId: request.user?.userId
      })
      
      // 清理临时文件
      if (tempFilePath) {
        try {
          await fs.unlink(tempFilePath)
          fastify.log.debug('已清理临时文件', { path: tempFilePath })
        } catch (cleanupError) {
          fastify.log.warn('清理临时文件失败', { 
            path: tempFilePath, 
            error: cleanupError.message 
          })
        }
      }

      // 根据错误类型返回不同的错误信息
      if (error.code === 'P2002') {
        return reply.code(409).send({
          error: 'DUPLICATE_FILE',
          message: '文件已存在'
        })
      }

      return reply.code(500).send({
        error: 'UPLOAD_FAILED',
        message: '文件上传失败',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      })
    }
  })

  // 批量上传
  fastify.post('/multiple', {
    preHandler: async (request, reply) => {
      try {
        await request.jwtVerify()
      } catch (error) {
        return reply.code(401).send({
          error: 'UNAUTHORIZED',
          message: '请先登录'
        })
      }
    }
  }, async (request, reply) => {
    try {
      const files = await request.saveRequestFiles()
      
      if (!files || files.length === 0) {
        return reply.code(400).send({
          error: 'NO_FILES',
          message: '请选择要上传的文件'
        })
      }

      if (files.length > 10) {
        return reply.code(400).send({
          error: 'TOO_MANY_FILES',
          message: '单次最多上传10个文件'
        })
      }

      const results = []
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']

      for (const file of files) {
        try {
          // 验证文件类型
          if (!allowedTypes.includes(file.mimetype)) {
            results.push({
              success: false,
              filename: file.filename,
              error: '不支持的文件类型'
            })
            continue
          }

          // 检查文件大小
          const stats = await fs.stat(file.filepath)
          if (stats.size > 10 * 1024 * 1024) {
            results.push({
              success: false,
              filename: file.filename,
              error: '文件大小超过10MB'
            })
            continue
          }

          // 处理单个文件（类似单文件上传逻辑）
          const fileId = nanoid(21)
          const ext = path.extname(file.filename || '.jpg')
          const filename = `${fileId}${ext}`
          
          const today = new Date()
          const yearMonth = `${today.getFullYear()}/${(today.getMonth() + 1).toString().padStart(2, '0')}`
          const uploadDir = path.resolve('uploads', yearMonth)
          const filePath = path.join(uploadDir, filename)

          await fs.mkdir(uploadDir, { recursive: true })
          await fs.rename(file.filepath, filePath)

          // 获取图片信息
          let imageInfo = { width: null, height: null }
          try {
            const metadata = await sharp(filePath).metadata()
            imageInfo = { width: metadata.width, height: metadata.height }
          } catch (metadataError) {
            fastify.log.warn('获取图片元数据失败', { error: metadataError.message })
          }

          // 保存到数据库
          const image = await imageOperations.create({
            id: fileId,
            filename,
            originalName: file.filename,
            path: filePath,
            url: `/image/${fileId}`,
            mimetype: file.mimetype,
            size: stats.size,
            width: imageInfo.width,
            height: imageInfo.height,
            userId: request.user.userId
          })

          results.push({
            success: true,
            data: {
              id: image.id,
              filename: image.filename,
              originalName: image.originalName,
              url: image.url,
              size: image.size,
              width: image.width,
              height: image.height,
              mimetype: image.mimetype
            }
          })

        } catch (error) {
          fastify.log.error('批量上传单文件失败', {
            filename: file.filename,
            error: error.message
          })
          
          results.push({
            success: false,
            filename: file.filename,
            error: '处理失败: ' + error.message
          })
        }
      }

      const successCount = results.filter(r => r.success).length
      
      // 记录批量上传日志
      await logOperations.create({
        action: 'batch_upload',
        resource: 'image',
        resourceId: 'multiple',
        details: JSON.stringify({
          totalFiles: files.length,
          successCount,
          failedCount: files.length - successCount
        }),
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
        userId: request.user.userId
      })

      return {
        success: successCount > 0,
        message: `成功上传 ${successCount}/${files.length} 个文件`,
        data: {
          totalFiles: files.length,
          successCount,
          failedCount: files.length - successCount,
          results
        }
      }

    } catch (error) {
      fastify.log.error('批量上传失败', error)
      return reply.code(500).send({
        error: 'BATCH_UPLOAD_FAILED',
        message: '批量上传失败'
      })
    }
  })

  // 游客上传 - 无需登录
  fastify.post('/guest', {
    config: {
      rateLimit: {
        max: 20, // 游客限制更严格：每15分钟最多20次上传
        timeWindow: 900000
      }
    }
  }, async (request, reply) => {
    // 检查是否启用游客上传功能
    if (!config.features.enableGuestUpload) {
      return reply.code(403).send({
        error: 'GUEST_UPLOAD_DISABLED',
        message: '游客上传功能已被管理员禁用'
      })
    }

    let tempFilePath = null
    
    try {
      fastify.log.info('开始处理游客文件上传', { 
        ip: request.ip,
        userAgent: request.headers['user-agent']
      })
      
      // 获取上传的文件
      const data = await request.file()
      
      if (!data) {
        fastify.log.warn('游客上传：未找到上传文件')
        return reply.code(400).send({
          error: 'NO_FILE',
          message: '请选择要上传的文件'
        })
      }

      // 验证文件类型（游客上传限制更严格）
      const allowedTypes = [
        'image/jpeg', 
        'image/jpg', 
        'image/png', 
        'image/webp'
        // 游客不允许上传 gif 和 svg
      ]
      
      if (!allowedTypes.includes(data.mimetype)) {
        fastify.log.warn('游客上传：不支持的文件类型', { mimetype: data.mimetype })
        return reply.code(400).send({
          error: 'INVALID_FILE_TYPE',
          message: '游客仅支持上传 JPG、PNG、WebP 格式的图片'
        })
      }

      // 文件大小限制（游客限制为5MB）
      const maxSize = 5 * 1024 * 1024 // 5MB
      const buffer = await data.toBuffer()
      
      if (buffer.length > maxSize) {
        fastify.log.warn('游客上传：文件过大', { size: buffer.length })
        return reply.code(400).send({
          error: 'FILE_TOO_LARGE',
          message: '游客上传文件大小不能超过 5MB'
        })
      }

      // 生成文件信息
      const fileId = nanoid()
      const fileExt = path.extname(data.filename || '').toLowerCase() || '.jpg'
      const filename = `guest_${fileId}${fileExt}`
      const uploadDir = path.resolve('./uploads')
      const filePath = path.join(uploadDir, filename)
      
      tempFilePath = filePath
      
      fastify.log.debug('游客上传文件信息', {
        filename,
        size: buffer.length,
        mimetype: data.mimetype
      })

      // 确保上传目录存在
      await fs.mkdir(uploadDir, { recursive: true })

      // 获取图片元数据
      let imageInfo = { width: null, height: null, format: null }
      
      try {
        const metadata = await sharp(buffer).metadata()
        imageInfo = {
          width: metadata.width,
          height: metadata.height,
          format: metadata.format
        }
        
        fastify.log.debug('游客上传图片元数据', imageInfo)
      } catch (error) {
        fastify.log.warn('无法读取游客上传图片元数据', { error: error.message })
      }

      // 保存文件到磁盘
      await fs.writeFile(filePath, buffer)
      fastify.log.info('游客上传文件已保存', { path: filePath })

      // 保存到数据库（游客上传userId为null，但需要创建临时用户或使用系统用户）
      // 由于 schema 要求 userId 不能为 null，我们需要创建一个系统用户或修改逻辑
      
      // 先检查是否有系统用户，如果没有则创建一个
      let systemUser = await prisma.user.findUnique({
        where: { username: 'system_guest' }
      })
      
      if (!systemUser) {
        systemUser = await prisma.user.create({
          data: {
            username: 'system_guest',
            email: 'guest@system.local',
            password: 'no_password',
            role: 'SYSTEM'
          }
        })
      }

      const image = await prisma.image.create({
        data: {
          id: fileId,
          filename,
          originalName: data.filename || 'guest_upload',
          path: filePath,
          size: buffer.length,
          mimetype: data.mimetype,
          width: imageInfo.width,
          height: imageInfo.height,
          url: `/image/${fileId}`,
          userId: systemUser.id, // 使用系统用户ID
          tags: JSON.stringify(['guest', 'upload']) // 转换为JSON字符串
        }
      })

      fastify.log.info('游客上传成功', {
        imageId: image.id,
        filename: image.filename,
        size: image.size
      })

      return {
        success: true,
        message: '游客上传成功',
        image: {
          id: image.id,
          filename: image.filename,
          originalName: image.originalName,
          url: image.url,
          size: image.size,
          width: image.width,
          height: image.height,
          mimetype: image.mimetype,
          uploadTime: image.createdAt,
          isGuest: true
        }
      }

    } catch (error) {
      fastify.log.error('游客文件上传失败', {
        error: error.message,
        stack: error.stack
      })
      
      // 清理临时文件
      if (tempFilePath) {
        try {
          await fs.unlink(tempFilePath)
          fastify.log.debug('已清理游客上传临时文件', { path: tempFilePath })
        } catch (cleanupError) {
          fastify.log.warn('清理游客上传临时文件失败', { 
            path: tempFilePath, 
            error: cleanupError.message 
          })
        }
      }

      // 根据错误类型返回不同的错误信息
      if (error.code === 'P2002') {
        return reply.code(409).send({
          error: 'DUPLICATE_FILE',
          message: '文件已存在'
        })
      }

      return reply.code(500).send({
        error: 'UPLOAD_FAILED',
        message: '游客上传失败，请稍后重试'
      })
    }
  })
}
