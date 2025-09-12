// 简单的内存缓存实现
class MemoryCache {
  constructor() {
    this.cache = new Map()
    this.timers = new Map()
    
    // 定期清理过期缓存
    setInterval(() => {
      this.cleanup()
    }, 300000) // 每5分钟清理一次
  }
  
  async get(key) {
    const item = this.cache.get(key)
    if (!item) return null
    
    if (item.expires && Date.now() > item.expires) {
      this.delete(key)
      return null
    }
    
    return item.value
  }
  
  async set(key, value, ttl = 3600) {
    const expires = ttl ? Date.now() + (ttl * 1000) : null
    
    this.cache.set(key, {
      value,
      expires,
      created: Date.now()
    })
    
    // 设置定时清理
    if (ttl && this.timers.has(key)) {
      clearTimeout(this.timers.get(key))
    }
    
    if (ttl) {
      const timer = setTimeout(() => {
        this.delete(key)
      }, ttl * 1000)
      
      this.timers.set(key, timer)
    }
  }
  
  async del(key) {
    this.delete(key)
  }
  
  delete(key) {
    this.cache.delete(key)
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key))
      this.timers.delete(key)
    }
  }
  
  async exists(key) {
    return this.cache.has(key) && (await this.get(key)) !== null
  }
  
  cleanup() {
    const now = Date.now()
    for (const [key, item] of this.cache.entries()) {
      if (item.expires && now > item.expires) {
        this.delete(key)
      }
    }
  }
  
  // 获取缓存统计信息
  getStats() {
    return {
      size: this.cache.size,
      timers: this.timers.size
    }
  }
  
  // 清空所有缓存
  clear() {
    for (const timer of this.timers.values()) {
      clearTimeout(timer)
    }
    this.cache.clear()
    this.timers.clear()
  }
}

const memoryCache = new MemoryCache()

export const cache = {
  async get(key) {
    return await memoryCache.get(key)
  },
  
  async set(key, value, ttl = 3600) {
    return await memoryCache.set(key, value, ttl)
  },
  
  async del(key) {
    return await memoryCache.del(key)
  },
  
  async exists(key) {
    return await memoryCache.exists(key)
  },
  
  getStats() {
    return memoryCache.getStats()
  },
  
  clear() {
    return memoryCache.clear()
  }
}

export default null
