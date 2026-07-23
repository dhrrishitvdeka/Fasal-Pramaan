param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string[]]$ImagePaths,

    [string]$ApiUrl = "http://localhost:8000",
    [string]$Email = "farmer@fasalpramaan.local",
    [string]$Password = "Demo@12345",
    [int]$TimeoutSeconds = 120
)

$ErrorActionPreference = "Stop"
if ($ImagePaths.Count -ne 3) {
    throw "Provide exactly three distinct JPEG paths: wide field, mid canopy, and close-up."
}
$resolvedImages = @(
    $ImagePaths | ForEach-Object { (Resolve-Path -LiteralPath $_).Path }
)
$api = $ApiUrl.TrimEnd("/")

function Invoke-Api(
    [string]$Method,
    [string]$Path,
    [object]$Body = $null,
    [hashtable]$Headers = @{}
) {
    $arguments = @{
        Method = $Method
        Uri = "$api$Path"
        Headers = $Headers
        ContentType = "application/json"
        TimeoutSec = 30
    }
    if ($null -ne $Body) {
        $arguments.Body = $Body | ConvertTo-Json -Depth 10
    }
    Invoke-RestMethod @arguments
}

$login = Invoke-Api POST "/api/v1/auth/login" @{
    email = $Email
    password = $Password
    device_id = "portable-e2e-verifier"
}
$headers = @{ Authorization = "Bearer $($login.access_token)" }

$cycles = @(Invoke-Api GET "/api/v1/crop-cycles" $null $headers)
if ($cycles.Count -eq 0) {
    throw "No crop cycle is available for the demo farmer."
}

$draft = Invoke-Api POST "/api/v1/submissions/drafts" @{
    crop_cycle_id = $cycles[0].id
    idempotency_key = "portable-e2e-$([Guid]::NewGuid().ToString('N'))"
    capture_lat = 23.2615
    capture_lon = 77.4125
    capture_accuracy_m = 9
    device_id = "portable-e2e-verifier"
    offline_created = $false
    farmer_observations = "Automated local end-to-end v4 verification"
} $headers

$angles = @("wide_field", "mid_canopy", "closeup_damage")
$filesByAngle = @{}
$imageMetadata = for ($index = 0; $index -lt $angles.Count; $index++) {
    $image = Get-Item -LiteralPath $resolvedImages[$index]
    $filesByAngle[$angles[$index]] = $image.FullName
    @{
        angle_type = $angles[$index]
        sequence_order = $index
        content_type = "image/jpeg"
        byte_size = $image.Length
        sha256 = (Get-FileHash -LiteralPath $image.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        width = 1280
        height = 720
        capture_lat = 23.2615
        capture_lon = 77.4125
        capture_accuracy_m = 9
    }
}

$uploadResponse = Invoke-Api POST "/api/v1/submissions/$($draft.id)/upload-urls" @{
    images = $imageMetadata
} $headers

$confirmations = @()
foreach ($upload in @($uploadResponse.uploads)) {
    $putHeaders = @{}
    foreach ($property in $upload.headers.PSObject.Properties) {
        $putHeaders[$property.Name] = [string]$property.Value
    }
    Invoke-WebRequest `
        -Method Put `
        -Uri $upload.upload_url `
        -InFile $filesByAngle[$upload.angle_type] `
        -ContentType "image/jpeg" `
        -Headers $putHeaders `
        -UseBasicParsing `
        -TimeoutSec 30 | Out-Null
    $confirmations += @{ image_id = $upload.image_id }
}

Invoke-Api POST "/api/v1/submissions/$($draft.id)/images/confirm" $confirmations $headers | Out-Null
Invoke-Api POST "/api/v1/submissions/$($draft.id)/finalize" @{} $headers | Out-Null

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
do {
    Start-Sleep -Seconds 2
    $submission = Invoke-Api GET "/api/v1/submissions/$($draft.id)" $null $headers
    if ($null -ne $submission.latest_prediction) {
        break
    }
} while ((Get-Date) -lt $deadline)

if ($null -eq $submission.latest_prediction) {
    throw "Timed out waiting for the worker/model result for submission $($draft.id)."
}

$prediction = $submission.latest_prediction
if ($prediction.adapter_type -ne "crop_health_v4") {
    throw "Expected crop_health_v4, received $($prediction.adapter_type)."
}

[pscustomobject]@{
    SubmissionId = $submission.id
    Status = $submission.status
    Adapter = $prediction.adapter_type
    ModelVersion = $prediction.model_version
    PredictedCrop = $prediction.predicted_crop
    Grade = $prediction.predicted_grade
    GradeLabel = $prediction.grade_label
    Confidence = $prediction.grade_confidence
    Recommendation = $prediction.human_review_recommendation
    ProductionValidated = $prediction.is_production_validated
}
