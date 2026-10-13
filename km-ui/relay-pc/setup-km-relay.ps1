# 配車コンソール中継（km-relay）セットアップ — 社内PC用（管理者権限は不要）
#
# やること:
#   1. %USERPROFILE%\km-relay\ に cloudflared.exe（Cloudflare 純正）を置く
#   2. 同じフォルダに tunnel_token.txt（トンネル接続トークン）を置く ※このスクリプトと同じフォルダに置いてから実行する
#   3. 「このユーザーがログオンしたら cloudflared を隠しウィンドウで起動する」タスクをタスクスケジューラに登録する
#   4. その場で起動して接続を確認する
#
# 実行方法（PowerShell を開いて、このファイルのあるフォルダで）:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\setup-km-relay.ps1
#
# 解除したいとき:
#   schtasks /Delete /TN "km-relay" /F ;  フォルダ %USERPROFILE%\km-relay を削除
param(
  [string]$TokenFile = (Join-Path $PSScriptRoot 'tunnel_token.txt')
)
$ErrorActionPreference = 'Stop'
$dir = Join-Path $env:USERPROFILE 'km-relay'
$exe = Join-Path $dir 'cloudflared.exe'
$tok = Join-Path $dir 'tunnel_token.txt'
$vbs = Join-Path $dir 'run-km-relay.vbs'
$log = Join-Path $dir 'km-relay.log'

if (-not (Test-Path $TokenFile)) { throw "トークンファイルが見つかりません: $TokenFile  （tunnel_token.txt をこのスクリプトと同じフォルダに置いてください）" }
New-Item -ItemType Directory -Force -Path $dir | Out-Null

# 1. cloudflared.exe（Cloudflare 公式の GitHub リリースから。既にあればスキップ）
if (-not (Test-Path $exe)) {
  Write-Host '[1/4] cloudflared.exe をダウンロード中...'
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile $exe
} else { Write-Host '[1/4] cloudflared.exe は配置済み' }
& $exe --version

# 2. トークン
Write-Host '[2/4] トークンを配置'
(Get-Content $TokenFile -Raw).Trim() | Set-Content -NoNewline -Path $tok

# 3. 隠しウィンドウで起動するランチャー（VBScript）と、ログオン時タスク
Write-Host '[3/4] ログオン時の自動起動タスクを登録'
@"
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
token = fso.OpenTextFile("$tok", 1).ReadAll
sh.Run """$exe"" tunnel --no-autoupdate --logfile ""$log"" --loglevel info run --token " & token, 0, False
"@ | Set-Content -Path $vbs -Encoding ASCII

schtasks /Create /F /SC ONLOGON /TN "km-relay" /TR "wscript.exe `"$vbs`"" /RL LIMITED | Out-Null
# 既に動いていれば止めてから起動し直す
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1

# 4. いま起動して確認
Write-Host '[4/4] 起動して接続を確認中（20秒ほど待ちます）...'
schtasks /Run /TN "km-relay" | Out-Null
Start-Sleep -Seconds 20
$p = Get-Process cloudflared -ErrorAction SilentlyContinue
if ($p) {
  Write-Host "OK: cloudflared が動いています (PID $($p.Id))。ログ: $log"
  if (Test-Path $log) { Get-Content $log -Tail 5 }
  Write-Host '次は、ホシコンの「配車コンソール」を開いて、通知バーに「LIVE 実データ(読み取り専用)」が出ることを確認してください。'
} else {
  Write-Host "NG: cloudflared が起動していません。ログを確認してください: $log"
  if (Test-Path $log) { Get-Content $log -Tail 20 }
  exit 1
}
