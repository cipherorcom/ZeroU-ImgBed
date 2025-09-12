// 创建一个通用的刷新函数
function refreshDashboard() {
    // 刷新统计数据
    loadStats()
    // 刷新图片列表
    loadImages()
}

// 在所有成功的操作后调用 refreshDashboard()
// 例如：删除、屏蔽、恢复图片操作后