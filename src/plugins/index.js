import multipart from '@fastify/multipart'
import staticFiles from '@fastify/static'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import cookie from '@fastify/cookie'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { config } from '../config/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export async function registerPlugins(fastify) {
  // CORS配置
  await fastify.register(cors, {
    origin: true,
    credentials: true
  })
  
  // JWT认证
  await fastify.register(jwt, {
    secret: config.jwt.secret,
    cookie: {
      cookieName: 'token',
      signed: false
    }
  })
  
  // Cookie支持
  await fastify.register(cookie)
  
  // 文件上传
  await fastify.register(multipart, {
    limits: {
      fileSize: config.upload.maxFileSize,
      files: 10
    }
  })
  
  // 静态文件服务 - 前端页面
  await fastify.register(staticFiles, {
    root: join(__dirname, '../../public'),
    prefix: '/'
  })
  
  // 静态文件服务 - 上传的图片 (使用子上下文)
  await fastify.register(async function (fastify) {
    await fastify.register(staticFiles, {
      root: join(__dirname, '../../uploads'),
      prefix: '/uploads/',
      decorateReply: false,
      setHeaders: (res, path, stat) => {
        // 设置合理的缓存头
        res.setHeader('Cache-Control', 'public, max-age=31536000')
        res.setHeader('ETag', `"${stat.size}-${stat.mtime.getTime()}"`)
        res.setHeader('Last-Modified', stat.mtime.toUTCString())
      }
    })
  })
  
  // 健康检查
  fastify.get('/health', async (request, reply) => {
    return { 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    }
  })
}
