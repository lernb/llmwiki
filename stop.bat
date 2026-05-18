@echo off
chcp 65001 >nul
title LLM Wiki - 停止服务

echo ========================================
echo   📚 LLM Wiki - 停止服务
echo ========================================
echo.

:: 停止后端 (端口 8000)
echo 🔍 正在停止后端...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000 " ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
    echo   已停止后端进程 (PID: %%a)
)

:: 停止前端 (端口 3000)
echo 🔍 正在停止前端...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000 " ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
    echo   已停止前端进程 (PID: %%a)
)

:: 额外检查是否有残留 node 进程占用端口
echo 🔍 检查残留进程...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000 " ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
    echo   已清理残留 (PID: %%a)
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000 " ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
    echo   已清理残留 (PID: %%a)
)

echo.
echo ✅ 服务已全部停止
echo ========================================
pause
