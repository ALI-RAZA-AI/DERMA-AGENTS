# Model card — DermaAgents skin classifier v1.0.0

**Intended use:** academic simulation and teaching. Not a medical device. Not for diagnosis.

## Data
* Source: user upload `SKIN_DATASET_FOR_DERMAAGENTS.zip` (subset of the 22-class "Skin Disease Dataset";
  14 classes present). No other data used.
* Cleaning: unlabelled HAM10000 images excluded; images in near-duplicate groups (pHash Hamming ≤ 4) with
  conflicting labels removed (25); exact duplicate copies removed (50). Final 3,475 images.
* Split: stratified **grouped** 70/15/15 (train 2,482 / val 497 / test 496), groups = near-duplicate clusters
  (no patient/lesion IDs exist). Leakage check: 0 clusters cross splits.

## Architecture & training
* Backbones (frozen, ImageNet-pretrained, verified on a reference image after conversion):
  MobileNetV2 (Caffe → ONNX, github.com/shicai/MobileNet-Caffe), ResNet50-v2 (ONNX Model Zoo via
  github.com/microsoft/onnxjs-demo), EfficientNet-EdgeTPU-M (Coral TFLite → float ONNX).
* Preprocessing (OpenCV): decode BGR → shorter side resize → centre crop (224/240) → per-backbone normalisation
  → horizontal-flip test-time averaging → L2-normalised embedding.
* Augmentation (training): 4 views per image — random resized crop, flips, ±25° rotation, HSV jitter, light blur.
* Head: PCA(256) + multinomial logistic regression, `class_weight="balanced"` (imbalance 28.5×).
  C selected by grouped 5-fold CV on the training split only.
* Selection: highest **validation** macro-F1 (test untouched).

| Backbone | Val macro-F1 | Test accuracy | Test macro-F1 |
|---|---|---|---|
| **Ensemble (all three)** | **0.406** | **0.615** | **0.409** |
| ResNet50-v2 | 0.385 | 0.540 | 0.338 |
| MobileNetV2 | 0.350 | 0.577 | 0.386 |
| EfficientNet-EdgeTPU-M | 0.345 | 0.554 | 0.356 |

## Evaluation (test split, n=496)
Accuracy 0.615 (bootstrap 95% CI 0.573–0.655); balanced accuracy 0.456; macro-F1 0.409; weighted F1 0.637;
macro OvR ROC-AUC 0.878 (classes with ≥5 positives). Full per-class table:
`backend/artifacts/reports/model/classification_report.txt`, confusion matrix PNG/CSV alongside.

| Enabled class | Precision | Recall | F1 | n |
|---|---|---|---|---|
| Acne | 0.90 | 0.82 | 0.86 | 93 |
| Skin Cancer (unspecified) | 0.78 | 0.64 | 0.70 | 107 |
| Eczema | 0.29 | 0.50 | 0.36 | 16 |
| Seborrheic Keratosis | 0.20 | 0.57 | 0.30 | 7 |

## Uncertainty and rejection (all thresholds fitted on validation, checked on test)
* Temperature scaling: T = 1.52; test ECE 0.089 → 0.066.
* Split-conformal (LAC, α = 0.10): test coverage 0.913, mean set size 3.96.
* Selective threshold τ = 0.864 (smallest τ with 90% Clopper-Pearson lower bound on accepted accuracy ≥ 0.85):
  test accept rate 12.3%, accepted accuracy 93.4%.
* Mahalanobis OOD (99th pct of validation): flags 1.0% of test images, 95% of non-skin photos (n=20),
  but only 6.5% of dermoscopic HAM10000 images (n=245): domain shift to dermoscopy is **not** reliably detected.
* Output statuses: `confident`, `uncertain` (further assessment), `outside_scope` (top class is a non-proposal
  dataset class), `rejected_ood`, `invalid_image`. Psoriasis, Melanoma and BCC are never predicted.

## Limitations
Small, imbalanced, web-scraped clinical photographs; very small test counts for several classes (n = 4–12);
no skin-tone metadata, so no fairness analysis is possible; backbones were not fine-tuned (PyTorch unavailable).
A GPU fine-tuning run (e.g. timm EfficientNet-B0, 15–20 epochs, same grouped split) is the recommended next step.
