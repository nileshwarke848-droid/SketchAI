# 333-class model source archive

The two files on the remote branch `nileshwarke848-droid-patch-1` were joined in order into `autodraw_333_best.keras`. The joined archive is the original Keras 3 model package; `class_indices.json` is the attached class-to-output-index map. The map has 333 unique contiguous indices, but the source package does not tie it to the trained model, so its semantic alignment to the model's 333 output neurons has not been independently verified. The app currently uses it provisionally for display labels.

- Source branch commit: `0e6880e340cc076d42df5c91f0c44d4f4f97d81f`
- Source archive SHA-256: `2d8f8a814a9565ee52785fe63c14abdb7f2dd27cdfaf46a3e184669a809164fd`
- Input/output: `96 × 96 × 1` grayscale to 333 softmax outputs
- Conversion output used by the app: `public/model-333/`

The source archive only includes Keras `metadata.json`, model `config.json`, and `model.weights.h5`; it does **not** include the training script, dataset provenance, class-wise sample counts, or evaluation metrics. Do not describe it as trained on all 50 million drawings or assume it outperforms the existing model until those details and a held-out evaluation are supplied.
