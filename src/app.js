import Fastify from 'fastify'
import { config } from './config/index.js'
import { registerPlugins } from './plugins/index.js'
import { registerRoutes } from './routes/index.js'
import { logger } from './utils/logger.js'

const fastify = Fastify({
  logger: logger,
  maxParamLength: 200,
  bodyLimit: config.upload.maxFileSize
})

// 注册插件
await registerPlugins(fastify)

// 注册路由
await registerRoutes(fastify)

// 优雅关闭处理
const gracefulShutdown = async (signal) => {
  fastify.log.info(`收到 ${signal} 信号，开始优雅关闭...`)
  try {
    await fastify.close()
    process.exit(0)
  } catch (error) {
    fastify.log.error('关闭服务器时出错:', error)
    process.exit(1)
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

// 启动服务器
const start = async () => {
  try {
    await fastify.listen({
      port: config.server.port,
      host: config.server.host
    })
    
    fastify.log.info(`🚀 ZeroU图床服务已启动`)
    fastify.log.info(`📱 服务地址: http://${config.server.host}:${config.server.port}`)
    fastify.log.info(`🌍 环境: ${config.server.env}`)
    
  } catch (error) {
    fastify.log.error('启动服务器失败:', error)
    process.exit(1)
  }
}

start()
