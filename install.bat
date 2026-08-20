@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo.
echo ========================================
echo   dsh-memory-plugin 一键安装脚本
echo ========================================
echo.

REM 检查是否以管理员身份运行
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [警告] 建议以管理员身份运行此脚本以获得最佳体验
    echo.
)

REM 获取脚本所在目录
set SCRIPT_DIR=%~dp0
set PLUGIN_PATH=%SCRIPT_DIR:~0,-1%

echo 📍 插件路径: %PLUGIN_PATH%
echo.

REM 查找 DSH Home 目录
echo 🔍 正在查找 DSH 配置目录...
set DSH_HOME=
if defined DSH_HOME (
    echo ✅ 找到 DSH_HOME: %DSH_HOME%
) else if exist "%USERPROFILE%\.dsh" (
    set DSH_HOME=%USERPROFILE%\.dsh
    echo ✅ 找到默认位置: %DSH_HOME%
) else (
    echo ❌ 未找到 DSH 配置目录
    echo.
    echo 请手动设置 DSH_HOME 环境变量或确认 DSH 已安装
    pause
    exit /b 1
)

echo.
echo 📁 DSH Profiles 目录: %DSH_HOME%\profiles
echo.

REM 检查 profiles 目录是否存在
if not exist "%DSH_HOME%\profiles" (
    echo ⚠️  Profiles 目录不存在，正在创建...
    mkdir "%DSH_HOME%\profiles"
    if errorlevel 1 (
        echo ❌ 创建失败，请检查权限
        pause
        exit /b 1
    )
    echo ✅ 创建成功
)

REM 询问安装方式
echo 请选择安装方式:
echo.
echo   1. 复制到 profiles 目录（推荐）
echo   2. 创建符号链接（开发模式）
echo   3. 仅查看安装说明
echo.
set /p CHOICE="请输入选项 (1/2/3): "

if "%CHOICE%"=="1" goto INSTALL_COPY
if "%CHOICE%"=="2" goto INSTALL_SYMLINK
if "%CHOICE%"=="3" goto SHOW_INSTRUCTIONS
goto INVALID_CHOICE

:INSTALL_COPY
echo.
echo 📦 正在复制插件文件...
set TARGET_DIR=%DSH_HOME%\profiles\dsh-memory-plugin

if exist "%TARGET_DIR%" (
    echo ⚠️  目标目录已存在，是否覆盖？(Y/N)
    set /p OVERWRITE=""
    if /i "!OVERWRITE!"=="Y" (
        rmdir /s /q "%TARGET_DIR%"
    ) else (
        echo 安装取消
        pause
        exit /b 0
    )
)

xcopy "%PLUGIN_PATH%" "%TARGET_DIR%" /E /I /Y >nul
if errorlevel 1 (
    echo ❌ 复制失败
    pause
    exit /b 1
)
echo ✅ 复制成功
goto POST_INSTALL

:INSTALL_SYMLINK
echo.
echo 🔗 正在创建符号链接...
set TARGET_DIR=%DSH_HOME%\profiles\dsh-memory-plugin

if exist "%TARGET_DIR%" (
    echo ⚠️  目标已存在，是否删除后重新创建？(Y/N)
    set /p OVERWRITE=""
    if /i "!OVERWRITE!"=="Y" (
        if exist "%TARGET_DIR\" (
            rmdir /s /q "%TARGET_DIR%"
        ) else (
            del "%TARGET_DIR%"
        )
    ) else (
        echo 安装取消
        pause
        exit /b 0
    )
)

mklink /J "%TARGET_DIR%" "%PLUGIN_PATH%" >nul 2>&1
if errorlevel 1 (
    echo ❌ 创建符号链接失败（可能需要管理员权限）
    echo.
    echo 尝试使用复制方式安装...
    goto INSTALL_COPY
)
echo ✅ 符号链接创建成功
goto POST_INSTALL

:SHOW_INSTRUCTIONS
echo.
echo ========================================
echo   手动安装说明
echo ========================================
echo.
echo 方法 1: 复制到 profiles 目录
echo   1. 复制整个 dsh-memory-plugin 文件夹
echo   2. 粘贴到: %DSH_HOME%\profiles\
echo   3. 重启 DSH
echo.
echo 方法 2: 使用 DSH CLI
echo   cd %DSH_HOME%\profiles
echo   dsh plugin add %PLUGIN_PATH%
echo.
echo 方法 3: 在代码中直接集成
echo   const plugin = require('path/to/dsh-memory-plugin');
echo   plugin.apply(ctx, config);
echo.
pause
exit /b 0

:INVALID_CHOICE
echo.
echo ❌ 无效选项
pause
exit /b 1

:POST_INSTALL
echo.
echo ========================================
echo   ✅ 安装成功！
echo ========================================
echo.
echo 📂 安装位置: %TARGET_DIR%
echo.
echo 💡 下一步:
echo   1. 重启 DSH 以加载插件
echo   2. 查看插件文档: README.md
echo   3. 打开 Web 查看器: open-viewer.cmd
echo.
echo 🎨 快速体验:
echo   双击运行: %TARGET_DIR%\open-viewer.cmd
echo.
echo 📚 更多信息:
echo   https://github.com/ly028716/dsh-memory-plugin
echo.
pause
exit /b 0
