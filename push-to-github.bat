@echo off
setlocal EnableExtensions DisableDelayedExpansion
title Push project to GitHub
cd /d "%~dp0"
if errorlevel 1 goto failed

where git >nul 2>nul
if errorlevel 1 (
  echo ERROR: Git was not found. Install Git for Windows and run this file again.
  goto failed
)

for /f "delims=" %%R in ('git rev-parse --show-toplevel 2^>nul') do set "GIT_ROOT=%%R"
if defined GIT_ROOT (
  cd /d "%GIT_ROOT%"
  if errorlevel 1 goto failed
) else (
  echo Initializing a Git repository on branch main...
  git init -b main
  if errorlevel 1 (
    git init
    if errorlevel 1 goto failed
    git branch -M main
    if errorlevel 1 goto failed
  )
)

git remote get-url origin >nul 2>nul
if errorlevel 1 goto add_remote
goto remote_ready

:add_remote
echo Enter the HTTPS or SSH URL of your GitHub repository.
set /p "REPO_URL=GitHub URL: "
if not defined REPO_URL goto no_remote
git remote add origin "%REPO_URL%"
if errorlevel 1 goto failed

:remote_ready
for /f "delims=" %%U in ('git remote get-url origin 2^>nul') do set "REMOTE_URL=%%U"
echo.
echo Destination: %REMOTE_URL%
choice /C YN /N /M "Continue and push to this repository? [Y/N] "
if errorlevel 2 goto cancelled

for /f "delims=" %%B in ('git branch --show-current 2^>nul') do set "BRANCH=%%B"
if not defined BRANCH (
  set "BRANCH=main"
  git checkout -b main
  if errorlevel 1 goto failed
)

echo.
echo Staging non-ignored project files...
git add -A
if errorlevel 1 goto failed

git diff --cached --quiet
if errorlevel 1 (
  call :ensure_identity
  if errorlevel 1 goto failed
  git commit -m "Update project files"
  if errorlevel 1 goto failed
)

git rev-parse --verify HEAD >nul 2>nul
if errorlevel 1 (
  echo ERROR: There is no commit to push.
  goto failed
)

echo.
echo Checking the GitHub branch...
git fetch origin
if errorlevel 1 goto failed
git show-ref --verify --quiet "refs/remotes/origin/%BRANCH%"
if errorlevel 1 goto push

git merge-base HEAD "origin/%BRANCH%" >nul 2>nul
if errorlevel 1 goto unrelated_history

echo Rebasing local changes onto origin/%BRANCH%...
git rebase "origin/%BRANCH%"
if errorlevel 1 goto failed
goto push

:unrelated_history
echo The GitHub branch has a separate initial commit; merging without force-pushing...
git merge --no-edit --allow-unrelated-histories -X ours "origin/%BRANCH%"
if errorlevel 1 goto failed

:push
echo Pushing branch %BRANCH% to GitHub...
git push -u origin "%BRANCH%"
if errorlevel 1 goto failed

echo.
echo Push completed successfully.
pause
exit /b 0

:ensure_identity
for /f "delims=" %%N in ('git config user.name 2^>nul') do set "GIT_NAME=%%N"
for /f "delims=" %%E in ('git config user.email 2^>nul') do set "GIT_EMAIL=%%E"
if not defined GIT_NAME set /p "GIT_NAME=Git author name: "
if not defined GIT_EMAIL set /p "GIT_EMAIL=Git author email: "
if not defined GIT_NAME exit /b 1
if not defined GIT_EMAIL exit /b 1
git config user.name "%GIT_NAME%"
if errorlevel 1 exit /b 1
git config user.email "%GIT_EMAIL%"
if errorlevel 1 exit /b 1
exit /b 0

:no_remote
echo No repository URL was entered. Nothing was pushed.
goto finish_error

:cancelled
echo Push cancelled. No files were pushed.
pause
exit /b 1

:failed
echo.
echo Push did not complete. Review the Git error above.
:finish_error
pause
exit /b 1
