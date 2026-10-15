# Uncensored local LLM for JARVIS

Recommended model: **huihui_ai/Qwen3.8-abliterated** (abliterated Qwen3.8-27B).

## Why
- No safety refusals (abliterated layers 18–51).
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
