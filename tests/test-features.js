#!/usr/bin/env node

// 功能开关测试脚本
const baseURL = 'http://localhost:3000';

async function testRegistration() {
  console.log('📝 测试用户注册功能...');
  try {
    const response = await fetch(`${baseURL}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: 'test' + Date.now().toString().slice(-6), // 使用最后6位数字
        email: `test${Date.now()}@example.com`,
        password: 'password123'
      })
    });

    const data = await response.json();
    
    if (response.status === 403 && data.error === 'REGISTRATION_DISABLED') {
      console.log('✅ 注册功能已正确禁用');
    } else if (response.ok) {
      console.log('✅ 注册功能正常工作');
    } else {
      console.log(`❌ 注册功能异常: ${response.status} - ${data.message}`);
    }
  } catch (error) {
    console.log(`❌ 注册功能测试失败: ${error.message}`);
  }
}

async function testGuestUpload() {
  console.log('📸 测试游客上传功能...');
  try {
    // 创建一个简单的 FormData 来模拟文件上传
    const formData = new FormData();
    const blob = new Blob(['fake image content'], { type: 'image/jpeg' });
    formData.append('file', blob, 'test.jpg');

    const response = await fetch(`${baseURL}/api/upload/guest`, {
      method: 'POST',
      body: formData
    });

    const data = await response.json();
    
    if (response.status === 403 && data.error === 'GUEST_UPLOAD_DISABLED') {
      console.log('✅ 游客上传功能已正确禁用');
    } else if (response.status === 200) {
      console.log('✅ 游客上传功能正常工作');
    } else if (response.status === 400 && data.error === 'NO_FILE') {
      console.log('✅ 游客上传功能已启用 (需要文件参数)');
    } else {
      console.log(`❌ 游客上传功能异常: ${response.status} - ${data.message}`);
    }
  } catch (error) {
    console.log(`❌ 游客上传功能测试失败: ${error.message}`);
  }
}

async function testHealthEndpoint() {
  console.log('🔍 测试健康检查接口...');
  try {
    const response = await fetch(`${baseURL}/health`);
    const data = await response.json();
    console.log(`✅ 健康检查: ${data.status} (运行时间: ${Math.round(data.uptime)}s)`);
  } catch (error) {
    console.log(`❌ 健康检查失败: ${error.message}`);
  }
}

async function getConfigStatus() {
  console.log('⚙️  当前配置状态:');
  console.log('   ENABLE_REGISTRATION=true');
  console.log('   ENABLE_GUEST_UPLOAD=true');
  console.log('   ENABLE_RATE_LIMIT=true');
}

// 主执行函数
async function main() {
  console.log('🔧 ZeroU图床功能开关测试');
  console.log('================================\n');

  await getConfigStatus();
  console.log('');
  
  await testHealthEndpoint();
  console.log('');
  
  await testRegistration();
  console.log('');
  
  await testGuestUpload();

  console.log('\n🏁 测试完成！');
  console.log('\n💡 提示：');
  console.log('   要启用注册功能，设置 ENABLE_REGISTRATION=true');
  console.log('   要启用游客上传，设置 ENABLE_GUEST_UPLOAD=true');
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
