# 板橋タクシー 乗降ピンデータ収集スクリプト（km-operator → ホシコン）
#
# Cloudflare Workers（ホシコン本体）からkm-operator.smartaxicenter.comへ直接アクセスすると
# 接続がブロックされることが判明したため、社内の常時稼働PCからこのスクリプトを定期実行し、
# km-operatorに直接ログインしてデータを取得→ホシコンへ送り返す方式にした。
# 詳細: docs/KM_OPERATOR_API.md
#
# ===== 事前準備 =====
# 1. 下の $UploadKey に、ホシコン側で `wrangler secret put KM_PINS_UPLOAD_KEY` した値と
#    同じ文字列を入れる。
# 2. $KmLoginId / $KmPassword に km-operator の実際のログインID・パスワードを入れる。
# 3. タスクスケジューラでこのスクリプトを定期実行（例: 1時間おき）に登録する。
#    - プログラム: powershell.exe
#    - 引数: -ExecutionPolicy Bypass -File "このファイルのフルパス"
#    - トリガー: ログオン時 + 1時間ごとに繰り返し、等
#
# このファイルはパスワードを平文で含むため、社内PC以外に置かない・共有しないこと。
#
# ※注意: `-ResponseHeadersVariable` を使っているため PowerShell 7以降(pwsh.exe)が必要。
#   Windows標準の PowerShell 5.1 では動かない可能性がある（未検証）。5.1でエラーになる場合は
#   動作確認済みの collect.py（Python版。Macで実機検証済み）を使うこと。

$ErrorActionPreference = 'Stop'

# ===== 設定（ここを埋める） =====
$HoshikonBase = 'https://bentenclub.com'
$UploadKey    = 'pqHXGmaxfSIsakMPDTZcD6cNrEBsam6e'
$KmLoginId    = 'itabashi1'
$KmPassword   = '1111'

$LogFile   = Join-Path $PSScriptRoot 'collect.log'
$BatchSize = 20   # 何台分まとめて1回のアップロードにするか
$SleepMs   = 300  # km-operatorへの1台ごとの問い合わせ間隔（負荷対策）

function Write-Log {
    param([string]$Message)
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message"
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
    Write-Host $line
}

# km-operatorは "X-CLTFT-Token" という独自ヘッダーを使った、毎回のやりとりで値が変わる
# 合言葉方式の認証を行っている。応答ヘッダーに次回用の新しい値が入っているので、次のリクエストで
# (1)ヘッダー (2)Cookie の両方に同じ値をセットして送り返す必要がある（実機検証で判明。片方だけだと
# アプリ本体ではなくAWS側の入口で401 Unauthorizedになる）。
$script:KmToken = $null

function Set-KmTokenFromResponse {
    param($Session, $Headers, [string]$Url)
    $newToken = $null
    if ($Headers -and $Headers['X-CLTFT-Token']) { $newToken = $Headers['X-CLTFT-Token'] }
    if ($newToken) {
        $script:KmToken = $newToken
        $cookie = New-Object System.Net.Cookie('X-CLTFT-Token', $newToken, '/', 'km-operator.smartaxicenter.com')
        $Session.Cookies.Add($cookie)
    }
}

function Invoke-KmRequest {
    param($Session, [string]$Url, [string]$Method = 'Get', $BodyJson = $null)
    $headers = @{ 'X-Requested-With' = 'XMLHttpRequest'; 'X-Use-Cookie' = 'true' }
    if ($script:KmToken) { $headers['X-CLTFT-Token'] = $script:KmToken }

    $params = @{ Uri = $Url; WebSession = $Session; Headers = $headers; Method = $Method; ResponseHeadersVariable = 'respHeaders' }
    if ($BodyJson) { $params['ContentType'] = 'application/json'; $params['Body'] = $BodyJson }

    $res = Invoke-RestMethod @params
    Set-KmTokenFromResponse -Session $Session -Headers $respHeaders -Url $Url
    return $res
}

function Get-KmSession {
    $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    $loginPageUrl = 'https://km-operator.smartaxicenter.com/kmx/HS/HSHS/HSHS0199.do'
    Invoke-WebRequest -Uri $loginPageUrl -WebSession $session -UseBasicParsing | Out-Null

    $loginUrl = 'https://km-operator.smartaxicenter.com/kmx/api/v1/auth/login'
    $bodyJson = (@{ loginName = $KmLoginId; password = $KmPassword } | ConvertTo-Json)
    $res = Invoke-KmRequest -Session $session -Url $loginUrl -Method 'Post' -BodyJson $bodyJson

    if (-not $res.isSuccess) {
        throw "km-operatorログイン失敗: $($res.msgs[0].msg)"
    }

    # 実画面を1回開く（本体の認証には必須ではないが、ブラウザの挙動に合わせておく）
    Invoke-WebRequest -Uri 'https://km-operator.smartaxicenter.com/kmx/HS/HSHS/HSHS9999.do?pageId=HSHS0062' `
        -WebSession $session -UseBasicParsing -Headers @{ 'X-CLTFT-Token' = $script:KmToken } | Out-Null

    return $session
}

# 戻り値: @{ driverName = ...; trips = @(...) } / 該当なし(勤怠なし等)は trips=@() / 通信失敗は $null
function Get-KmTripInfos {
    param($Session, [int]$RadioNo, [string]$DateParam)
    $encodedDate = [uri]::EscapeDataString($DateParam)
    $url = "https://km-operator.smartaxicenter.com/kmx/api/v1/trip_infos/search?wirelessLineNumber=$RadioNo&userName=&date=$encodedDate"
    try {
        $res = Invoke-KmRequest -Session $Session -Url $url
    } catch {
        Write-Log "  [車両$RadioNo] 通信エラー: $_"
        return $null
    }
    if (-not $res.isSuccess) {
        return @{ driverName = $null; trips = @() }
    }
    return @{ driverName = $res.driverName; trips = $res.tripInfoList }
}

function Send-Batch {
    param($Batch, $RunId, [int]$ErrorCount)
    if ($Batch.Count -eq 0) { return $RunId }
    $payload = (@{ runId = $RunId; vehicles = $Batch; errors = $ErrorCount } | ConvertTo-Json -Depth 8)
    try {
        $res = Invoke-RestMethod -Uri "$HoshikonBase/api/public/km-pins/upload" -Method Post `
            -Headers @{ 'X-Upload-Key' = $UploadKey } -ContentType 'application/json' -Body $payload
        Write-Log "  アップロード成功: $($res.saved)件保存（runId=$($res.runId)）"
        return $res.runId
    } catch {
        Write-Log "  アップロード失敗: $_"
        return $RunId
    }
}

# ===== メイン処理 =====
# 画面が一瞬で閉じてエラーを読めない問題への対策として、全体をtry/finallyで囲み、
# 最後に必ずキー入力待ちで一時停止する（うまくいった場合もエラーの場合も画面は閉じない）。
try {
    Write-Log '===== 収集開始 ====='

    $vehiclesRes = Invoke-RestMethod -Uri "$HoshikonBase/api/public/km-pins/vehicles" -Headers @{ 'X-Upload-Key' = $UploadKey }
    $radioNumbers = $vehiclesRes.radioNumbers
    Write-Log "対象車両数: $($radioNumbers.Count)"

    $session = Get-KmSession
    Write-Log 'km-operatorログイン成功'

    $dateParam = Get-Date -Format 'yyyy/MM/dd HH:mm'
    $runId = $null
    $batch = @()
    $errorCount = 0
    $processed = 0

    foreach ($radioNo in $radioNumbers) {
        $result = Get-KmTripInfos -Session $session -RadioNo $radioNo -DateParam $dateParam
        if ($null -eq $result) {
            $errorCount++
        } elseif ($result.trips -and $result.trips.Count -gt 0) {
            $batch += @{ radioNo = $radioNo; driverName = $result.driverName; trips = $result.trips }
        }
        $processed++

        if ($batch.Count -ge $BatchSize) {
            $runId = Send-Batch -Batch $batch -RunId $runId -ErrorCount $errorCount
            $batch = @()
            $errorCount = 0
        }

        Start-Sleep -Milliseconds $SleepMs
    }

    if ($batch.Count -gt 0) {
        $runId = Send-Batch -Batch $batch -RunId $runId -ErrorCount $errorCount
    }

    Write-Log "===== 収集完了（処理台数: $processed） ====="
} catch {
    Write-Log "!!!!! エラーで停止しました: $_"
    Write-Host ''
    Write-Host '===== エラーが発生しました =====' -ForegroundColor Red
    Write-Host $_ -ForegroundColor Red
} finally {
    Write-Host ''
    Read-Host '処理が終わりました。Enterキーを押すとこのウィンドウを閉じます'
}
