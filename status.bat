@echo off
chcp 65001 >nul
title LLM Wiki - 状态

echo ========================================
echo   📚 LLM Wiki - 服务状态
echo ========================================
echo.

:: 检查后端
set BACKEND_PID=
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000 " ^| findstr LISTENING') do set BACKEND_PID=%%a
if defined BACKEND_PID (
    echo   🟢 后端: 运行中 (PID: %BACKEND_PID%)
    echo           http://127.0.0.1:8000
) else (
    echo   🔴 后端: 未运行
)

:: 检查前端
set FRONTEND_PID=
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000 " ^| findstr LISTENING') do set FRONTEND_PID=%%a
if defined FRONTEND_PID (
    echo   🟢 前端: 运行中 (PID: %FRONTEND_PID%)
    echo           http://localhost:3000
) else (
    echo   🔴 前端: 未运行
)

echo.
echo ========================================
echo   可用命令:
echo     start.bat    - 启动服务
echo     stop.bat     - 停止服务
echo     restart.bat  - 重启服务
echo     status.bat   - 查看状态
echo ========================================
pause
