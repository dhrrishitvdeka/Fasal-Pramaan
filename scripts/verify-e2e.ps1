param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string[]]$ImagePaths,

    [string]$ApiUrl = "http://localhost:8000",
    [string]$Email = "farmer@fasalpramaan.local",
    [string]$Password = "Demo@12345",
    [string]$ReviewerEmail = "reviewer@fasalpramaan.local",
    [string]$ReviewerPassword = "Demo@12345",
    [int]$TimeoutSeconds = 120
)

$ErrorActionPreference = "Stop"
if ($ImagePaths.Count -ne 5) {
    throw "Provide exactly five distinct JPEG paths: wide, left context, mid canopy, right context, and close-up."
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

$cycleResponse = Invoke-Api GET "/api/v1/crop-cycles" $null $headers
$cycles = @($cycleResponse) | Where-Object { $null -ne $_ -and $null -ne $_.id }
if ($cycles.Count -eq 0) {
    $cropResponse = Invoke-Api GET "/api/v1/crops" $null $headers
    $crops = @($cropResponse)
    $crop = $crops | Where-Object { $_.code -eq "paddy" } | Select-Object -First 1
    if ($null -eq $crop) {
        throw "The paddy reference catalog entry is missing."
    }
    $stageResponse = Invoke-Api GET "/api/v1/growth-stages?crop_type_id=$($crop.id)" $null $headers
    $stages = @($stageResponse)
    $stage = $stages | Where-Object {
        $_.code -eq "vegetative" -and $_.crop_type_id -eq $crop.id
    } | Select-Object -First 1
    $farm = Invoke-Api POST "/api/v1/farms" @{
        name = "Local Verification Farm"
        total_area_hectares = 1.0
        notes = "Created by the local end-to-end verifier"
    } $headers
    $plot = Invoke-Api POST "/api/v1/farms/$($farm.id)/plots" @{
        name = "Local Verification Plot"
        area_hectares = 1.0
        centroid_lon = 77.4125
        centroid_lat = 23.2615
    } $headers
    $cycleBody = @{
        plot_id = $plot.id
        crop_type_id = $crop.id
        season_year = (Get-Date).Year
        season = "kharif"
    }
    if ($null -ne $stage) {
        $cycleBody.current_growth_stage_id = $stage.id
    }
    $cycle = Invoke-Api POST "/api/v1/crop-cycles" $cycleBody $headers
    $cycles = @($cycle)
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

$angles = @("wide_field", "left_context", "mid_canopy", "right_context", "closeup_damage")
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

# Verify the same classified submission is available through the authenticated
# reviewer API consumed by the Command Centre, including all evidence images.
$reviewerLogin = Invoke-Api POST "/api/v1/auth/login" @{
    email = $ReviewerEmail
    password = $ReviewerPassword
    device_id = "portable-e2e-reviewer"
}
$reviewerHeaders = @{ Authorization = "Bearer $($reviewerLogin.access_token)" }
$reviewDetail = Invoke-Api GET "/api/v1/review/$($draft.id)" $null $reviewerHeaders
$reviewQueue = Invoke-Api GET "/api/v1/review/queue?status=pending_review&page_size=100" $null $reviewerHeaders
$reviewerVisible = @($reviewQueue.items | Where-Object { $_.id -eq $draft.id }).Count -eq 1
if (-not $reviewerVisible) {
    throw "Submission $($draft.id) did not appear in the reviewer queue."
}
if (@($reviewDetail.images).Count -ne 5) {
    throw "Reviewer detail expected five evidence images, received $(@($reviewDetail.images).Count)."
}
if ($null -eq $reviewDetail.latest_prediction) {
    throw "Reviewer detail did not include the local model classification."
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
    ReviewerQueueVisible = $reviewerVisible
    ReviewerImageCount = @($reviewDetail.images).Count
}
