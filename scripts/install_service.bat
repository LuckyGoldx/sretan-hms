@echo off
echo Installing Sretan EMR Backend as Windows Service...
nssm install Hospital_EMR_Local_Core "C:\Program Files\nodejs\node.exe" "C:\hms\server\dist\server.js"
nssm set Hospital_EMR_Local_Core AppDirectory "C:\hms\server"
nssm set Hospital_EMR_Local_Core Start SERVICE_AUTO_START
nssm set Hospital_EMR_Local_Core AppStdout "C:\hms\logs\server_runtime.log"
nssm set Hospital_EMR_Local_Core AppStderr "C:\hms\logs\server_runtime.log"
nssm set Hospital_EMR_Local_Core AppRestartDelay 10000
nssm set Hospital_EMR_Local_Core DisplayName "Sretan EMR Local Core Service"
echo Service installed successfully.
echo.
echo To start the service manually:
echo net start Hospital_EMR_Local_Core
echo.
echo To verify: Open services.msc and look for "Hospital_EMR_Local_Core"
pause
