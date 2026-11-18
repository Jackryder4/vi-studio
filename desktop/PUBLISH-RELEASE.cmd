@echo off
rem Double-click to build WACK MUZIC and publish it to GitHub Releases.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0publish.ps1"
