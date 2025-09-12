import pino from 'pino'
import { config } from '../config/index.js'

const isDevelopment = config.server.env === 'development'

export const logger = pino({
  level: isDevelopment ? 'debug' : 'info',
  transport: isDevelopment ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      ignore: 'pid,hostname',
      translateTime: 'yyyy-mm-dd HH:MM:ss'
    }
  } : undefined,
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      headers: req.headers,
      remoteAddress: req.ip
    }),
    res: (res) => ({
      statusCode: res.statusCode,
      headers: res.getHeaders()
    })
  }
})
