# Heretic — automatic censorship removal

[p-e-w/heretic](https://github.com/p-e-w/heretic) is a fully automatic abliteration tool for transformer language models. It removes safety alignment (refusals) while preserving as much of the original model quality as possible by jointly minimizing refusals and KL divergence.

JARVIS does **not** embed Heretic. It is a heavy Python/PyTorch CLI (AGPL-3.0). Use it separately to produce abliterated models, then load those models into Ollama for JARVIS.

## Installation

```bash
# recommended: uv
uv tool install heretic-llm
# or
pip install -U heretic-llm
```

## Basic usage

```bash
heretic Qwen/Qwen3-4B-Instruct-2507
```

Replace the model ID with any supported Hugging Face model. Heretic will:
1. Benchmark your GPU and pick a batch size.
2. Automatically search for good ablation parameters.
3. Offer to save the model, upload to Hugging Face, chat with it, or run benchmarks.

On an RTX 3090 with the default config, a 4B model takes roughly 20–30 minutes.

## Quantization (lower VRAM)

```bash
heretic --quantization bnb_4bit Qwen/Qwen3-4B-Instruct-2507
```

## After abliteration

- Save locally or upload to HF.
- Convert to GGUF if needed (llama.cpp).
- `ollama create` / `ollama pull` the result.
- Point JARVIS at it:

```env
JARVIS_OLLAMA_MODEL=<your-abliterated-model>
JARVIS_LLM_SENSITIVE_PROVIDER=ollama
JARVIS_LLM_LOCAL=1
```

## Current recommended model

`huihui_ai/Qwen3.8-abliterated` (already abliterated Qwen3.8-27B). See `knowledge/llm-uncensored.md`.

## License note

Heretic is AGPL-3.0. Do not copy its source into this repository. Document and invoke it as an external tool only.
