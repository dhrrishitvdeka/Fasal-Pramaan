# Paste these files into the Hugging Face Space

Space: https://huggingface.co/spaces/dhrrishitvdeka/fasal-pramaan-api

Copy each file from this folder to the Space repo root (Files tab → Create/replace):

| This folder | Space path |
|---|---|
| `app.py` | `app.py` |
| `requirements.txt` | `requirements.txt` |
| `README.md` | `README.md` (keep the YAML header) |

Space settings already expected:

- `MODEL_REPO_ID=dhrrishitvdeka/fasal-pramaan-model` (variable)
- `MODEL_REVISION=main` (variable)
- `HF_TOKEN` (secret, can read the private model repo)

After saving files, wait for the Space to rebuild. Open the Space UI and confirm Health returns `"onnx_loaded": true`.
