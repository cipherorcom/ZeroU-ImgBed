import authRoutes from './auth.js'
import uploadRoutes from './upload.js'
import imageRoutes from './image.js'
import userRoutes from './user.js'
import adminRoutes from './admin.js'
import { join } from 'path'

export async function registerRoutes(fastify) {
  // Favicon路由 - 明确处理
  fastify.get('/favicon.ico', async (request, reply) => {
    return reply.sendFile('favicon.ico', join(process.cwd(), 'public'))
  })
  
  // 图片直接访问路由（不在API前缀下）
  await fastify.register(imageRoutes, { prefix: '/image' })
  
  // API前缀
  await fastify.register(async function (fastify) {
    // 认证相关路由
    await fastify.register(authRoutes, { prefix: '/auth' })
    
    // 上传相关路由
    await fastify.register(uploadRoutes, { prefix: '/upload' })
    
    // 图片相关路由 (API版本，用于管理)
    await fastify.register(imageRoutes, { prefix: '/image' })
    
    // 用户相关路由
    await fastify.register(userRoutes, { prefix: '/user' })
    
    // 管理员相关路由
    await fastify.register(adminRoutes, { prefix: '/admin' })
    
  }, { prefix: '/api' })
}
