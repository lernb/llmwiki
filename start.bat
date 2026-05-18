@echo off
chcp 65001 >nul
title LLM Wiki - 启动中...

echo ========================================
echo   📚 LLM Wiki - 启动服务
echo ========================================
echo.

:: 检查 .env 中的 API Key
findstr /b "DEEPSEEK_API_KEY" .env >nul 2>&1
if errorlevel 1 (
    echo ⚠️  未在 .env 中找到 DEEPSEEK_API_KEY
    echo   请先配置 .env 文件后再启动
    echo.
    pause
    exit /b 1
)

echo 🔍 启动后端 (端口 8000)...
start "LLM Wiki - 后端" cmd /c "npm --prefix backend run dev"

echo 🔍 启动前端 (端口 3000)...
start "LLM Wiki - 前端" cmd /c "npm --prefix frontend run dev"

echo.
echo ✅ 服务启动完成！
echo   后端: http://127.0.0.1:8000
echo   前端: http://localhost:3000
echo.
echo   关闭窗口即可停止服务，或运行 stop.bat
echo ========================================
