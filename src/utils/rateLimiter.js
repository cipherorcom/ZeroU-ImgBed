import { config } from '../config/index.js'

// 不同类型请求的限流配置
export const rateLimitConfigs = {
  // 默认限流 - 适用于大部分API
  default: {
    max: config.security.rateLimitMax,
    timeWindow: config.security.rateLimitWindow,
    errorResponseBuilder: function (request, context) {
      return {
        error: 'RATE_LIMIT_EXCEEDED',
        message: `请求过于频繁，请在 ${Math.ceil(context.ttl / 1000)} 秒后重试`,
        retryAfter: Math.ceil(context.ttl / 1000)
      }
    }
  },

  // 严格限流 - 适用于敏感操作（登录、注册、上传）
  strict: {
    max: Math.floor(config.security.rateLimitMax / 2), // 50次/15分钟
    timeWindow: config.security.rateLimitWindow,
    errorResponseBuilder: function (request, context) {
      return {
        error: 'RATE_LIMIT_EXCEEDED',
        message: `敏感操作限制：请在 ${Math.ceil(context.ttl / 1000)} 秒后重试`,
        retryAfter: Math.ceil(context.ttl / 1000)
      }
    }
  },

  // 宽松限流 - 适用于查看类操作
  relaxed: {
    max: config.security.rateLimitMax * 2, // 200次/15分钟
    timeWindow: config.security.rateLimitWindow,
    errorResponseBuilder: function (request, context) {
      return {
        error: 'RATE_LIMIT_EXCEEDED',
        message: `请求频率过高，请稍后重试`,
        retryAfter: Math.ceil(context.ttl / 1000)
      }
    }
  }
}

// 获取客户端IP的辅助函数
export function getClientIP(request) {
  return request.headers['x-forwarded-for'] || 
         request.headers['x-real-ip'] || 
         request.connection.remoteAddress ||
         request.socket.remoteAddress ||
         request.ip
}

// 创建限流预处理器
export function createRateLimitPreHandler(configType = 'default') {
  return async function rateLimitPreHandler(request, reply) {
    if (!config.security.enableRateLimit) {
      return // 如果限流未启用，直接跳过
    }

    const rateLimitConfig = rateLimitConfigs[configType] || rateLimitConfigs.default
    
    // 这里可以添加更复杂的逻辑，比如：
    // - 基于用户角色的不同限制
    // - 基于IP白名单的豁免
    // - 动态调整限制
    
    // 记录限流信息
    const clientIP = getClientIP(request)
    request.log.debug(`Rate limit check: ${configType} for IP: ${clientIP}`)
  }
}
