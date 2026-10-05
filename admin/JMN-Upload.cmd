@echo off
cd /d "%~dp0.."
node scripts/content-upload-server.mjs
pause
