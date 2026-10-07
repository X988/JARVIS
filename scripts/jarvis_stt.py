#!/usr/bin/env python3
"""Transcribe one WAV with faster-whisper. Arguments are fixed by the caller."""

import json
import math
import os
import sys


def fail(code: str, detail: str) -> None:
    print(json.dumps({"code": code, "detail": detail}))
    raise SystemExit(0)


def main() -> None:
    if len(sys.argv) != 2:
        fail("SCHEMA_INVALID", "wav path required")
    wav = sys.argv[1]
    if not os.path.isfile(wav):
        fail("NOT_CONFIGURED", "audio missing")
    try:
        from faster_whisper import WhisperModel
    except Exception as error:  # noqa: BLE001
        fail("NOT_CONFIGURED", str(error))

    model_name = os.environ.get("JARVIS_STT_MODEL", "small")
    language = os.environ.get("JARVIS_STT_LANGUAGE", "ru")
    requested = os.environ.get("JARVIS_STT_DEVICE", "auto")
    root = os.environ.get("JARVIS_MODEL_DIR") or None
    device = "cpu"
    compute = "int8"
    if requested in ("auto", "cuda"):
        try:
            probe = WhisperModel(model_name, device="cuda", compute_type="int8_float16", download_root=root)
            del probe
            device = "cuda"
            compute = "int8_float16"
        except Exception:
            if requested == "cuda":
                fail("NOT_CONFIGURED", "cuda unavailable")
            device = "cpu"
    try:
        model = WhisperModel(model_name, device=device, compute_type=compute, download_root=root)
        segments, info = model.transcribe(
            wav,
            language=None if language == "auto" else language,
            vad_filter=False,
        )
    except Exception as error:  # noqa: BLE001
        fail("STT_FAILED", str(error))

    parts = []
    weights = []
    for segment in segments:
        text = (segment.text or "").strip()
        if text:
            parts.append(text)
        weights.append(math.exp(segment.avg_logprob))
    confidence = sum(weights) / len(weights) if weights else 0
    print(
        json.dumps(
            {
                "text": " ".join(parts).strip(),
                "language": info.language,
                "confidence": round(max(0, min(1, confidence)), 3),
                "duration_ms": int((info.duration or 0) * 1000),
                "provider": "faster-whisper",
                "model": model_name,
                "device": device,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
