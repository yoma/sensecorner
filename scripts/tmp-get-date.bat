@echo off
powershell -NoProfile -Command "Get-Date -Format 'dd-MM-yyyy HH:mm'" > "%~dp0tmp-build-out.txt"
