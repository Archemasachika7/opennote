# Handwritten maths model (CoMER via ink-on)

Files: `encoder_int8.onnx`, `decoder_int8.onnx`, `vocab.json`, from the ink-on v0.1.0 release
(https://github.com/kimseungdae/ink-on/releases/tag/v0.1.0), unmodified.

- ink-on: Apache-2.0, Copyright kimseungdae. https://github.com/kimseungdae/ink-on
- Model: CoMER, "CoMER: Modeling Coverage for Transformer-based Handwritten Mathematical Expression
  Recognition" (ECCV 2022), https://github.com/Green-Wood/CoMER, trained on the CROHME dataset,
  exported to ONNX and INT8-quantized by ink-on.

Used by `src/ai/inkOcr.worker.ts` for handwritten maths → LaTeX, entirely on the device.
