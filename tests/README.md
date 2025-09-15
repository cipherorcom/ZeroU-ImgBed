# 测试文件

这个目录包含了项目的测试文件：

## 功能测试
- `test-features.js` - 测试核心功能开关（注册、游客上传）
- `test-rate-limit.js` - 测试限流功能

## 运行测试

确保服务器运行在 http://localhost:3000，然后运行：

```bash
# 测试功能开关
node tests/test-features.js

# 测试限流功能  
node tests/test-rate-limit.js
```

## 注意事项

- 测试需要服务器处于运行状态
- 限流测试会产生大量请求，可能触发限流保护
- 游客上传测试会创建测试文件，可以手动清理
