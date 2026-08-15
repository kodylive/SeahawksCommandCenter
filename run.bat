@echo off
cd /d "%~dp0"
echo Serving Seahawks Command Center at http://localhost:5510
python -m http.server 5510
