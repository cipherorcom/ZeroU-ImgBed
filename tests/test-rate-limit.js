#!/usr/bin/env node

// 限流功能测试脚本
const baseURL = 'http://localhost:3000';

async function testRateLimit() {
  console.log('🧪 开始测试限流功能...\n');

  // 测试登录接口限流
  console.log('📝 测试登录接口限流 (30次/15分钟)');
  let successCount = 0;
  let rateLimitCount = 0;

  for (let i = 1; i <= 35; i++) {
    try {
      const response = await fetch(`${baseURL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: 'test' + i,
          password: 'test123'
        })
      });

      if (response.status === 429 || response.status === 500) {
        rateLimitCount++;
        const errorData = await response.json();
        if (errorData.error === 'RATE_LIMIT_EXCEEDED') {
          console.log(`❌ 请求 ${i}: 限流生效 - ${errorData.message}`);
          if (rateLimitCount === 1) {
            console.log(`✅ 限流在第 ${i} 次请求时生效`);
          }
        } else {
          console.log(`❌ 请求 ${i}: 状态 ${response.status}`);
        }
      } else {
        successCount++;
        console.log(`✅ 请求 ${i}: 状态 ${response.status}`);
      }

      // 避免请求过快
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.log(`❌ 请求 ${i}: 错误 - ${error.message}`);
    }
  }

  console.log(`\n📊 测试结果:`);
  console.log(`   成功请求: ${successCount}`);
  console.log(`   限流请求: ${rateLimitCount}`);
  console.log(`   总请求数: ${successCount + rateLimitCount}`);

  if (rateLimitCount > 0) {
    console.log(`\n🎉 限流功能正常工作！`);
  } else {
    console.log(`\n⚠️  未触发限流，可能需要调整参数`);
  }
}

async function testHealthEndpoint() {
  console.log('\n🔍 测试健康检查接口...');
  try {
    const response = await fetch(`${baseURL}/health`);
    const data = await response.json();
    console.log(`✅ 健康检查: ${data.status} (运行时间: ${Math.round(data.uptime)}s)`);
  } catch (error) {
    console.log(`❌ 健康检查失败: ${error.message}`);
  }
}

// 主执行函数
async function main() {
  console.log('🔐 ZeroU图床限流功能测试');
  console.log('================================\n');

  await testHealthEndpoint();
  await testRateLimit();

  console.log('\n🏁 测试完成！');
}

// 检查服务器是否可达
async function checkServer() {
  try {
    const response = await fetch(`${baseURL}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

// 启动测试
(async () => {
  if (await checkServer()) {
    await main();
  } else {
    console.log('❌ 无法连接到服务器，请确保服务器运行在 http://localhost:3000');
  }
})();
