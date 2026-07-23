# Source and licence record

Raw training/evaluation images are not redistributed in this repository.
The locally derived ONNX weights were trained from the versioned, checksum-
locked manifest and the following attributed sources.

## Pretrained encoder

- DINOv2 ViT-S/14 via timm/Hugging Face, pinned revision
  `bdc84086a163e3e7e6745d534c5f44c97dd493ef`, Apache-2.0.

## Training and validation data

- [Multi-Crop Leaf Disease Dataset](https://data.mendeley.com/datasets/z6jp232g5j/1),
  CC BY 4.0.
- [Paddy Doctor](https://www.kaggle.com/datasets/imbikramsaha/paddy-doctor),
  CC0 1.0.
- [Wheat Nitrogen Deficiency & Leaf Rust](https://www.kaggle.com/datasets/jocelyndumlao/wheat-nitrogen-deficiency-and-leaf-rust-image),
  CC0 1.0.
- [Digital Green Crop Disease Images](https://huggingface.co/datasets/DigiGreen/Crop_Disease_Images),
  CC BY 4.0.
- [Potato Leaf Disease in Uncontrolled Environment](https://huggingface.co/datasets/Project-AgML/potato_leaf_disease_classification),
  CC BY 4.0.
- [RiceyLeafDisease](https://data.mendeley.com/datasets/t46kkgh2yw/1),
  CC BY 4.0.
- [Potato Leaf Healthy and Late Blight](https://data.mendeley.com/datasets/v4w72bsts5/1),
  CC BY 4.0.
- [Seasonal Corn Leaf Disease Dataset](https://data.mendeley.com/datasets/vy629dngm8/1),
  CC BY 4.0.
- [PLDD-UP](https://data.mendeley.com/datasets/3j4nfkvp2n/1),
  CC BY 4.0.
- [RiceLeafBD](https://data.mendeley.com/datasets/kx9rx8p2mz/1),
  CC BY 4.0.
- [Rice Field Weed Dataset V3](https://data.mendeley.com/datasets/mt72bmxz73/3),
  CC BY 4.0.
- [Enhanced Field-Based Detection of Potato Leaf Blight sample](https://data.mendeley.com/datasets/pbnw43s6kt/1),
  CC BY 4.0.

## Frozen evaluation-only data

- [MLD maize dataset](https://data.mendeley.com/datasets/3myfctrgk3/1),
  CC BY 4.0.
- [Potato Leaf Disease Dataset](https://data.mendeley.com/datasets/d5b3fzpw3g/1),
  CC BY 4.0.
- [Rice Leaf Disease Image Samples](https://data.mendeley.com/datasets/fwcj7stb8r/1),
  CC BY 4.0.
- [Cropped PlantDoc](https://github.com/pratikkayal/PlantDoc-Dataset),
  CC BY 4.0, pinned commit
  `5467f6012d78d1c446145d5f582da6096f852ae8`.

PlantVillage was isolated and did not enter the selected weights because its
share-alike implications require separate legal approval.
