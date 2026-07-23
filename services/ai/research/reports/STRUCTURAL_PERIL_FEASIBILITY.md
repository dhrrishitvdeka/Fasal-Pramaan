# Structural-peril feasibility

The leaf ViT cannot support lodging, flooding, agricultural waterlogging,
severity, or affected-area estimation. Those are separate workstreams.

Lodging needs ground-level imagery matching the capture protocol or an
explicit aerial workflow. UAV lodging data is a domain mismatch for phone
images. Waterlogging needs agricultural field scenes across water depth,
duration, soil, crop stage, and normal irrigation; urban flood data is only
supplemental. Both should begin with pixel segmentation of visible regions,
not a leaf classifier or object-box area.

Affected area cannot be inferred by dividing bounding-box pixels by image
pixels, and visual severity cannot be converted into field loss without
measured plot-level ground truth. Until independent field studies validate
those targets, API values must stay `null` and reviewers must supply any
separate assessment.

Before a YOLO/Ultralytics experiment, the project must make and record an
explicit AGPL-versus-commercial licensing decision. A permissively licensed
segmentation stack is preferred while that decision is unresolved.
