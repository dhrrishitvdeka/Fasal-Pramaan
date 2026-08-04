param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$ImagePath,

    [Parameter(Mandatory = $true, Position = 1)]
    [ValidateSet("maize", "paddy", "potato", "wheat")]
    [string]$Crop,

    [string]$AiUrl = "http://localhost:8001",
    [string]$ServiceToken = "local-ai-service-token-change-in-production"
)

$ErrorActionPreference = "Stop"
$resolved = Resolve-Path -LiteralPath $ImagePath
$bytes = [System.IO.File]::ReadAllBytes($resolved)
$encoded = [Convert]::ToBase64String($bytes)
$body = @{
    submission_id = "presentation-$([Guid]::NewGuid().ToString('N'))"
    expected_crop = $Crop
    adapter = "crop_health_v4"
    images = @(
        @{
            angle_type = "closeup_damage"
            image_bytes = $encoded
        }
    )
} | ConvertTo-Json -Depth 5

$result = Invoke-RestMethod `
    -Method Post `
    -Uri "$($AiUrl.TrimEnd('/'))/v1/analyze" `
    -Headers @{ "X-Service-Token" = $ServiceToken } `
    -ContentType "application/json" `
    -Body $body

[pscustomobject]@{
    Adapter = $result.adapter_type
    ModelVersion = $result.model_version
    ExpectedCrop = $Crop
    PredictedCrop = $result.predicted_crop
    Grade = $result.predicted_grade
    GradeLabel = $result.grade_label
    Confidence = $result.grade_confidence
    Recommendation = $result.human_review_recommendation
    ProductionValidated = $result.is_production_validated
    Severity = $result.severity
    AffectedAreaPct = $result.estimated_affected_area_pct
    Warnings = ($result.quality_warnings -join ", ")
}
