[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectDir = Split-Path -Parent $PSScriptRoot
$sourceDir = Join-Path $projectDir '动作视频'
$outputDir = Join-Path $projectDir 'assets\processed'

$sourceHashes = [ordered]@{
    '打哈欠.mp4' = 'B6494584B6734DE4B22349B6F7B5CB2F0C039046EC6398764D5E33CD71F80005'
    '害羞.mp4' = 'D121E5CCCEB388038D187F6EC251FD1FD042E7B1DD10D3716100559EA04C2DDF'
    '呼吸.mp4' = '56DE1C3423F86794588FB7E09EE2ECD559C998416EF20981D67A5B50D3F023BE'
    '主视图.png' = 'C84900094D5F8F8D84839E60D6A069DCD4B4F002B103599202135B98F6B813EB'
    '转头.mp4' = '0E37CC7939BD864520136C6AEAF252F8645119A2B3F23CB401B814AD3A9DDFE1'
}

foreach ($entry in $sourceHashes.GetEnumerator()) {
    $sourcePath = Join-Path $sourceDir $entry.Key
    if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
        throw "缺少原素材：$($entry.Key)"
    }

    $actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $sourcePath).Hash
    if ($actualHash -ne $entry.Value) {
        throw "原素材哈希不符，已停止处理：$($entry.Key)"
    }
}

New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

$keyFilter = 'format=rgba,colorkey=0x0bc41b:0.08:0.03,despill=green,drawbox=x=1024:y=785:w=88:h=49:color=black@0:t=fill:replace=1'
$canvasFilter = 'crop=1112:772:0:42'
$normalFilter = "$keyFilter,$canvasFilter"
$pickupFilter = "$keyFilter,trim=start_frame=0:end_frame=73,setpts=N/(60*TB),fps=60,$canvasFilter"
$releaseFilter = "$keyFilter,trim=start_frame=72:end_frame=145,setpts=N/(60*TB),fps=60,$canvasFilter"
$holdFilter = "select='eq(n\,72)',$keyFilter,$canvasFilter"
$webmArgs = @(
    '-c:v', 'libvpx-vp9',
    '-b:v', '0',
    '-crf', '24',
    '-pix_fmt', 'yuva420p',
    '-auto-alt-ref', '0',
    '-metadata:s:v:0', 'alpha_mode=1'
)

$normalAssets = [ordered]@{
    '呼吸.mp4' = 'idle.webm'
    '打哈欠.mp4' = 'click.webm'
    '转头.mp4' = 'message.webm'
}

foreach ($entry in $normalAssets.GetEnumerator()) {
    & ffmpeg -hide_banner -loglevel error -y `
        -i (Join-Path $sourceDir $entry.Key) -an -vf $normalFilter `
        @webmArgs (Join-Path $outputDir $entry.Value)
    if ($LASTEXITCODE -ne 0) { throw "FFmpeg 处理失败：$($entry.Key)" }
}

& ffmpeg -hide_banner -loglevel error -y `
    -i (Join-Path $sourceDir '害羞.mp4') -an -vf $pickupFilter `
    @webmArgs (Join-Path $outputDir 'drag-pickup.webm')
if ($LASTEXITCODE -ne 0) { throw 'FFmpeg 处理失败：drag-pickup.webm' }

& ffmpeg -hide_banner -loglevel error -y `
    -i (Join-Path $sourceDir '害羞.mp4') -an -vf $releaseFilter `
    @webmArgs (Join-Path $outputDir 'drag-release.webm')
if ($LASTEXITCODE -ne 0) { throw 'FFmpeg 处理失败：drag-release.webm' }

& ffmpeg -hide_banner -loglevel error -y `
    -i (Join-Path $sourceDir '害羞.mp4') -an -vf $holdFilter `
    -frames:v 1 (Join-Path $outputDir 'drag-hold.png')
if ($LASTEXITCODE -ne 0) { throw 'FFmpeg 处理失败：drag-hold.png' }

$iconFilter = 'format=rgba,colorkey=0x17cf23:0.08:0.03,despill=green,crop=512:512:176:0,scale=256:256'
& ffmpeg -hide_banner -loglevel error -y `
    -i (Join-Path $sourceDir '主视图.png') -vf $iconFilter `
    -frames:v 1 (Join-Path $outputDir 'app.ico')
if ($LASTEXITCODE -ne 0) { throw 'FFmpeg 处理失败：app.ico' }

& (Join-Path $PSScriptRoot 'verify-assets.ps1')
