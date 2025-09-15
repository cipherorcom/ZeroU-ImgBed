import bcrypt from 'bcryptjs'
import prisma from '../utils/database.js'
import { cache } from '../utils/cache.js'
import { rateLimitConfigs } from '../utils/rateLimiter.js'
import { config } from '../config/index.js'

export default async function authRoutes(fastify) {
  
  // 用户注册 - 应用严格限流
  fastify.post('/register', {
    config: {
      rateLimit: {
        max: 20, // 每15分钟最多20次注册尝试
        timeWindow: 900000
      }
    },
    schema: {
      body: {
        type: 'object',
        required: ['username', 'email', 'password'],
        properties: {
          username: { type: 'string', minLength: 3, maxLength: 20 },
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 6 }
        }
      }
    }
  }, async (request, reply) => {
    // 检查是否启用注册功能
    if (!config.features.enableRegistration) {
      return reply.code(403).send({
        error: 'REGISTRATION_DISABLED',
        message: '注册功能已被管理员禁用'
      })
    }

    const { username, email, password } = request.body
    
    try {
      // 检查用户是否已存在
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
      
      // 加密密码
      const hashedPassword = await bcrypt.hash(password, 10)
      
      // 创建用户
      const user = await prisma.user.create({
        data: {
          username,
          email,
          password: hashedPassword
        },
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          createdAt: true
        }
      })
      
      // 生成JWT令牌
      const token = fastify.jwt.sign({ 
        userId: user.id, 
        username: user.username,
        role: user.role 
      })
      
      // 设置Cookie
      reply.setCookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7天
      })
      
      return {
        success: true,
        message: '注册成功',
        user,
        token
      }
      
    } catch (error) {
      fastify.log.error('注册失败:', error)
      return reply.code(500).send({
        error: 'REGISTER_FAILED',
        message: '注册失败，请稍后重试'
      })
    }
  })
  
  // 用户登录 - 应用严格限流
  fastify.post('/login', {
    config: {
      rateLimit: {
        max: 30, // 每15分钟最多30次登录尝试
        timeWindow: 900000
      }
    },
    schema: {
      body: {
        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: { type: 'string' },
          password: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { username, password } = request.body
    
    try {
      // 查找用户
      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { username },
            { email: username }
          ],
          isActive: true
        }
      })
      
      if (!user) {
        return reply.code(401).send({
          error: 'INVALID_CREDENTIALS',
          message: '用户名或密码错误'
        })
      }
      
      // 验证密码
      const isValidPassword = await bcrypt.compare(password, user.password)
      if (!isValidPassword) {
        return reply.code(401).send({
          error: 'INVALID_CREDENTIALS',
          message: '用户名或密码错误'
        })
      }
      
      // 生成JWT令牌
      const token = fastify.jwt.sign({ 
        userId: user.id, 
        username: user.username,
        role: user.role 
      })
      
      // 设置Cookie
      reply.setCookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7天
      })
      
      // 缓存用户信息
      await cache.set(`user:${user.id}`, JSON.stringify({
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      }), 3600)
      
      return {
        success: true,
        message: '登录成功',
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role
        },
        token
      }
      
    } catch (error) {
      fastify.log.error('登录失败:', error)
      return reply.code(500).send({
        error: 'LOGIN_FAILED',
        message: '登录失败，请稍后重试'
      })
    }
  })
  
  // 用户登出
  fastify.post('/logout', async (request, reply) => {
    try {
      // 清除Cookie
      reply.clearCookie('token')
      
      return {
        success: true,
        message: '登出成功'
      }
    } catch (error) {
      return reply.code(500).send({
        error: 'LOGOUT_FAILED',
        message: '登出失败'
      })
    }
  })
  
  // 获取当前用户信息
  fastify.get('/me', {
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
      
      // 先从缓存获取用户信息
      const cachedUser = await cache.get(`user:${userId}`)
      if (cachedUser) {
        return {
          success: true,
          user: JSON.parse(cachedUser)
        }
      }
      
      // 从数据库获取用户信息
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          avatar: true,
          createdAt: true
        }
      })
      
      if (!user) {
        return reply.code(404).send({
          error: 'USER_NOT_FOUND',
          message: '用户不存在'
        })
      }
      
      // 缓存用户信息
      await cache.set(`user:${user.id}`, JSON.stringify(user), 3600)
      
      return {
        success: true,
        user
      }
      
    } catch (error) {
      fastify.log.error('获取用户信息失败:', error)
      return reply.code(500).send({
        error: 'GET_USER_FAILED',
        message: '获取用户信息失败'
      })
    }
  })
}
