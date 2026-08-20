/**
 * 将记忆数据导入到浏览器 localStorage
 * 这样 viewer.html 就可以读取数据了
 */

const fs = require('fs');
const path = require('path');

console.log('\n📦 dsh-memory-plugin - 数据导入工具\n');

// 读取数据文件
const dataFile = path.join(__dirname, '.dsh-memory.json');

if (!fs.existsSync(dataFile)) {
    console.log('❌ 错误: 找不到数据文件 .dsh-memory.json');
    console.log('请先运行 quick-start.js 生成示例数据\n');
    process.exit(1);
}

// 读取数据
const data = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));

console.log('✅ 已读取数据文件');
console.log(`   版本: ${data.version}`);
console.log(`   会话数: ${data.metadata?.totalSessions || 0}`);
console.log(`   项目数: ${(data.projectContext?.activeProjects || []).length}`);
console.log(`   主题数: ${(data.sessionHistory?.recentTopics || []).length}\n`);

// 生成 HTML 代码来设置 localStorage
const htmlCode = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>导入数据到 LocalStorage</title>
</head>
<body>
    <h1>正在导入数据...</h1>
    <script>
        // 设置 localStorage
        localStorage.setItem('memory-plugin-data', ${JSON.stringify(JSON.stringify(data))});
        
        // 显示成功消息
        document.body.innerHTML = '<h1>✅ 数据导入成功！</h1>' +
            '<p>现在可以关闭此页面，然后刷新 viewer.html</p>' +
            '<p><a href="viewer.html" target="_blank">打开查看器 →</a></p>';
        
        // 3秒后自动跳转到查看器
        setTimeout(() => {
            window.location.href = 'viewer.html';
        }, 2000);
    </script>
</body>
</html>
`;

// 保存为临时 HTML 文件
const importFile = path.join(__dirname, 'import-to-browser.html');
fs.writeFileSync(importFile, htmlCode, 'utf-8');

console.log('✨ 数据已准备好导入浏览器\n');
console.log('🌐 请在浏览器中打开以下文件来完成导入:\n');
console.log(`   ${importFile}\n`);
console.log('💡 或者双击下面的文件:\n');

// 尝试自动打开
const { exec } = require('child_process');
exec(`start "" "${importFile}"`, (error) => {
    if (error) {
        console.log('⚠️  无法自动打开，请手动打开上面的文件\n');
    } else {
        console.log('✅ 已在浏览器中打开导入页面\n');
    }
    
    console.log('步骤:');
    console.log('1. 浏览器会显示"数据导入成功"');
    console.log('2. 自动跳转到 viewer.html');
    console.log('3. 点击"刷新"按钮查看数据\n');
});
