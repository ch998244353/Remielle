[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectDir = Split-Path -Parent $PSScriptRoot
$sourceDir = Join-Path $projectDir '动作视频'
$assetDir = Join-Path $projectDir 'assets\processed'
$evidenceDir = Join-Path $projectDir 'artifacts\validation\assets'

$expectedHashes = [ordered]@{
    '打哈欠.mp4' = 'B6494584B6734DE4B22349B6F7B5CB2F0C039046EC6398764D5E33CD71F80005'
    '害羞.mp4' = 'D121E5CCCEB388038D187F6EC251FD1FD042E7B1DD10D3716100559EA04C2DDF'
    '呼吸.mp4' = '56DE1C3423F86794588FB7E09EE2ECD559C998416EF20981D67A5B50D3F023BE'
    '主视图.png' = 'C84900094D5F8F8D84839E60D6A069DCD4B4F002B103599202135B98F6B813EB'
    '转头.mp4' = '0E37CC7939BD864520136C6AEAF252F8645119A2B3F23CB401B814AD3A9DDFE1'
}
$expectedFiles = @(
    'app.ico',
    'click.webm',
    'drag-hold.png',
    'drag-pickup.webm',
    'drag-release.webm',
    'idle.webm',
    'message.webm'
)
$webmExpectations = [ordered]@{
    'idle.webm' = @{ frames = 145; rate = '24/1' }
    'click.webm' = @{ frames = 145; rate = '24/1' }
    'message.webm' = @{ frames = 145; rate = '24/1' }
    'drag-pickup.webm' = @{ frames = 73; rate = '60/1' }
    'drag-release.webm' = @{ frames = 73; rate = '60/1' }
}

function Assert-Equal($Actual, $Expected, [string] $Message) {
    if ($Actual -ne $Expected) {
        throw "$Message；实际=$Actual，期望=$Expected"
    }
}

$actualFiles = @(
    Get-ChildItem -LiteralPath $assetDir -File |
        Sort-Object Name |
        Select-Object -ExpandProperty Name
)
Assert-Equal ($actualFiles -join '|') ($expectedFiles -join '|') '运行时素材文件集合不符'

$sourceEvidence = foreach ($entry in $expectedHashes.GetEnumerator()) {
    $actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $sourceDir $entry.Key)).Hash
    Assert-Equal $actualHash $entry.Value "原素材哈希不符：$($entry.Key)"
    [ordered]@{ name = $entry.Key; sha256 = $actualHash }
}

$assetEvidence = foreach ($entry in $webmExpectations.GetEnumerator()) {
    $path = Join-Path $assetDir $entry.Key
    $probeText = & ffprobe -v error -count_frames `
        -show_entries 'stream=index,codec_type,codec_name,width,height,r_frame_rate,avg_frame_rate,nb_read_frames,duration:stream_tags=alpha_mode' `
        -of json -- $path
    if ($LASTEXITCODE -ne 0) { throw "ffprobe 失败：$($entry.Key)" }

    $probe = $probeText | ConvertFrom-Json
    Assert-Equal @($probe.streams).Count 1 "流数量不符：$($entry.Key)"
    $stream = @($probe.streams)[0]
    Assert-Equal $stream.codec_type 'video' "存在非视频流：$($entry.Key)"
    Assert-Equal $stream.codec_name 'vp9' "编码不符：$($entry.Key)"
    Assert-Equal $stream.width 1112 "宽度不符：$($entry.Key)"
    Assert-Equal $stream.height 772 "高度不符：$($entry.Key)"
    Assert-Equal ([int] $stream.nb_read_frames) $entry.Value.frames "帧数不符：$($entry.Key)"
    Assert-Equal $stream.r_frame_rate $entry.Value.rate "帧率不符：$($entry.Key)"
    Assert-Equal $stream.tags.ALPHA_MODE '1' "Alpha 标记缺失：$($entry.Key)"

    [ordered]@{
        name = $entry.Key
        bytes = (Get-Item -LiteralPath $path).Length
        sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash
        probe = $probe
    }
}

$holdProbe = (& ffprobe -v error -show_entries 'stream=codec_name,width,height,pix_fmt' -of json -- (Join-Path $assetDir 'drag-hold.png')) | ConvertFrom-Json
$holdStream = @($holdProbe.streams)[0]
Assert-Equal $holdStream.codec_name 'png' '保持帧格式不符'
Assert-Equal $holdStream.width 1112 '保持帧宽度不符'
Assert-Equal $holdStream.height 772 '保持帧高度不符'
Assert-Equal $holdStream.pix_fmt 'rgba' '保持帧不含 RGBA'

$iconProbe = (& ffprobe -v error -show_entries 'stream=codec_name,width,height,pix_fmt' -of json -- (Join-Path $assetDir 'app.ico')) | ConvertFrom-Json
$iconStream = @($iconProbe.streams)[0]
Assert-Equal $iconStream.width 256 'ICO 宽度不符'
Assert-Equal $iconStream.height 256 'ICO 高度不符'

New-Item -ItemType Directory -Force -Path $evidenceDir | Out-Null
$evidence = [ordered]@{
    verifiedAt = (Get-Date).ToUniversalTime().ToString('o')
    sourceFiles = $sourceEvidence
    runtimeFiles = $assetEvidence
    hold = $holdProbe
    icon = $iconProbe
}
$evidence | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $evidenceDir 'ffprobe.json')
$evidence | ConvertTo-Json -Depth 8
