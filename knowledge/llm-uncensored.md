# Uncensored local LLM for JARVIS

Recommended model: **huihui_ai/Qwen3.8-abliterated** (abliterated Qwen3.8-27B).

## Why
- No safety refusals (abliterated).
- Multimodal base (Qwen3.8-27B), Apache 2.0.
- Strong for general, coding and agent tasks.
- Fits ~16–20 GB VRAM at Q4/Q5.

## Install (Ollama)
```bash
ollama pull huihui_ai/Qwen3.8-abliterated
```

Then in `.env`:
```
JARVIS_OLLAMA_MODEL=huihui_ai/Qwen3.8-abliterated
JARVIS_LLM_SENSITIVE_PROVIDER=ollama
JARVIS_LLM_LOCAL=1
```

## Alternative: GGUF
Download from https://huggingface.co/huihui-ai/Huihui-Qwen3.8-27B-abliterated-GGUF
Create a Modelfile and `ollama create`.

Source weights: https://huggingface.co/huihui-ai/Huihui-Qwen3.8-27B-abliterated

## Creating your own abliterated models with Heretic

[Heretic](https://github.com/p-e-w/heretic) is the automatic censorship-removal tool used to produce high-quality abliterated models (including many of the ones available on Hugging Face).

It is a separate Python CLI (PyTorch + Optuna). Do not vendor it into this Node.js repo.

Quick usage:
```bash
pip install -U heretic-llm
# or: uv run heretic <model>
heretic Qwen/Qwen3-4B-Instruct-2507
```

After it finishes you can save the model, upload to HF, or convert to GGUF for Ollama.

See also: [docs/HERETIC.md](../docs/HERETIC.md)
