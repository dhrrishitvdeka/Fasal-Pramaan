"""Transfer the vendored MIT HuggingFace ViT-Tiny ONNX weights into timm."""

from __future__ import annotations

import re
from functools import partial
from pathlib import Path

import numpy as np
import onnx
import timm
import torch
from onnx import numpy_helper
from torch import nn


def _initializer_arrays(path: Path) -> dict[str, np.ndarray]:
    model = onnx.load(path)
    return {item.name: numpy_helper.to_array(item).copy() for item in model.graph.initializer}


def load_vit_tiny_from_onnx(
    onnx_path: Path,
    num_classes: int,
    keep_source_head: bool = False,
) -> tuple[nn.Module, dict[str, object]]:
    """Return a timm ViT-Tiny initialized from the local 13-class ONNX model."""
    arrays = _initializer_arrays(onnx_path)
    source_classes = int(arrays["classifier.weight"].shape[0])
    head_classes = source_classes if keep_source_head else num_classes
    model = timm.create_model(
        "vit_tiny_patch16_224",
        pretrained=False,
        num_classes=head_classes,
        norm_layer=partial(nn.LayerNorm, eps=1e-12),
    )
    state = model.state_dict()

    def put(key: str, array: np.ndarray) -> None:
        tensor = torch.from_numpy(np.asarray(array)).to(dtype=state[key].dtype)
        if tensor.shape != state[key].shape:
            raise ValueError(f"shape mismatch {key}: {tuple(tensor.shape)} != {tuple(state[key].shape)}")
        state[key] = tensor

    put("cls_token", arrays["vit.embeddings.cls_token"])
    put("pos_embed", arrays["vit.embeddings.position_embeddings"])
    put("patch_embed.proj.weight", arrays["vit.embeddings.patch_embeddings.projection.weight"])
    put("patch_embed.proj.bias", arrays["vit.embeddings.patch_embeddings.projection.bias"])
    anonymous = sorted(
        (name for name in arrays if name.startswith("onnx::MatMul_")),
        key=lambda name: int(re.search(r"(\d+)$", name).group(1)),  # type: ignore[union-attr]
    )
    if len(anonymous) != 72:
        raise ValueError(f"expected 72 transformer matrices, found {len(anonymous)}")
    for layer in range(12):
        prefix = f"vit.encoder.layer.{layer}"
        k_w, v_w, q_w, proj_w, fc1_w, fc2_w = [
            arrays[name] for name in anonymous[layer * 6 : layer * 6 + 6]
        ]
        put(
            f"blocks.{layer}.attn.qkv.weight",
            np.concatenate([q_w.T, k_w.T, v_w.T], axis=0),
        )
        put(
            f"blocks.{layer}.attn.qkv.bias",
            np.concatenate(
                [
                    arrays[f"{prefix}.attention.attention.query.bias"],
                    arrays[f"{prefix}.attention.attention.key.bias"],
                    arrays[f"{prefix}.attention.attention.value.bias"],
                ]
            ),
        )
        put(f"blocks.{layer}.attn.proj.weight", proj_w.T)
        put(
            f"blocks.{layer}.attn.proj.bias",
            arrays[f"{prefix}.attention.output.dense.bias"],
        )
        put(f"blocks.{layer}.mlp.fc1.weight", fc1_w.T)
        put(f"blocks.{layer}.mlp.fc1.bias", arrays[f"{prefix}.intermediate.dense.bias"])
        put(f"blocks.{layer}.mlp.fc2.weight", fc2_w.T)
        put(f"blocks.{layer}.mlp.fc2.bias", arrays[f"{prefix}.output.dense.bias"])
        put(f"blocks.{layer}.norm1.weight", arrays[f"{prefix}.layernorm_before.weight"])
        put(f"blocks.{layer}.norm1.bias", arrays[f"{prefix}.layernorm_before.bias"])
        put(f"blocks.{layer}.norm2.weight", arrays[f"{prefix}.layernorm_after.weight"])
        put(f"blocks.{layer}.norm2.bias", arrays[f"{prefix}.layernorm_after.bias"])
    put("norm.weight", arrays["vit.layernorm.weight"])
    put("norm.bias", arrays["vit.layernorm.bias"])
    if keep_source_head:
        put("head.weight", arrays["classifier.weight"])
        put("head.bias", arrays["classifier.bias"])
    model.load_state_dict(state)
    return model, {
        "source_classes": source_classes,
        "transferred_tensors": len(state) - (0 if keep_source_head else 2),
        "source": str(onnx_path),
        "source_head_loaded": keep_source_head,
    }
