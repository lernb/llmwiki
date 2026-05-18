@echo off
chcp 65001 >nul
title LLM Wiki - 重启中...

echo ========================================
echo   📚 LLM Wiki - 重启服务
echo ========================================
echo.

:: 先停
echo 🔴 停止旧服务...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000 " ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000 " ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
)
echo   已停止
echo.

:: 再启
echo 🟢 启动后端 (端口 8000)...
start "LLM Wiki - 后端" cmd /c "npm --prefix backend run dev"

echo 🟢 启动前端 (端口 3000)...
start "LLM Wiki - 前端" cmd /c "npm --prefix frontend run dev"

echo.
echo ✅ 重启完成！
echo   后端: http://127.0.0.1:8000
echo   前端: http://localhost:3000
echo ========================================
pause
