# Local crop ViT asset

The vendored `crop_leaf_diseases_vit.onnx` file is the 22.3 MB quantized ONNX
export published at
[`wambugu71/crop_leaf_diseases_vit_onnx`](https://huggingface.co/wambugu71/crop_leaf_diseases_vit_onnx)
under the MIT license. Its SHA-256 and exact inference contract are recorded in
`model.json`.

The model recognizes healthy/disease leaf classes for maize, potato, rice, and
wheat. FasalPramaan maps those labels into an explicitly non-production crop
health *screening grade*:

- `A`: confident healthy-leaf signal
- `B`: uncertain signal; manual review required
- `C`: confident disease-pattern signal
- `U`: unusable, unsupported, invalid, or crop-mismatched input

These are workflow buckets for the demonstration, not commodity quality grades,
disease severity grades, insurance loss grades, or payout recommendations.
