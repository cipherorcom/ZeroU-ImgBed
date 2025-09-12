import dotenv from 'dotenv'

dotenv.config()

export const config = {
  server: {
    port: parseInt(process.env.PORT) || 3000,
    host: process.env.HOST || '0.0.0.0',
    env: process.env.NODE_ENV || 'development'
  },
  
  database: {
    url: process.env.DATABASE_URL
  },
  
  jwt: {
    secret: process.env.JWT_SECRET || 'your_super_secret_jwt_key_here',
    expiresIn: '7d'
  },
  
  upload: {
    storageType: process.env.STORAGE_TYPE || 'local',
    uploadPath: process.env.UPLOAD_PATH || './uploads',
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB
    allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
  },
  
  cdn: {
    url: process.env.CDN_URL || ''
  },
  
  admin: {
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || 'admin123'
  },
  
  image: {
    quality: parseInt(process.env.IMAGE_QUALITY) || 80,
    enableWatermark: process.env.ENABLE_WATERMARK === 'true',
    watermarkText: process.env.WATERMARK_TEXT || 'ZeroU-ImgBed'
  },
  
  security: {
    enableRateLimit: process.env.ENABLE_RATE_LIMIT === 'true',
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX) || 100,
    rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW) || 900000 // 15分钟
  },
  
  features: {
    enableRegistration: process.env.ENABLE_REGISTRATION !== 'false',
    enableGuestUpload: process.env.ENABLE_GUEST_UPLOAD === 'true'
  }
}
