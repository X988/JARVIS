#!/usr/bin/env python3
"""Transcribe one WAV with faster-whisper. Arguments are fixed by the caller."""

import json
import math
import os
import sys


def fail(code: str, detail: str) -> None:
    print(json.dumps({"code": code, "detail": detail}, ensure_ascii=False))
    raise SystemExit(0)


def env_int(name: str, fallback: int, minimum: int, maximum: int) -> int:
    try:
        value = int(os.environ.get(name, ""))
    except ValueError:
        return fallback
    return min(maximum, max(minimum, value))


def env_float(name: str, fallback: float, minimum: float, maximum: float) -> float:
    try:
        value = float(os.environ.get(name, ""))
    except ValueError:
        return fallback
    return min(maximum, max(minimum, value))


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

    model_name = os.environ.get("JARVIS_STT_MODEL", "").strip() or "small"
    language = os.environ.get("JARVIS_STT_LANGUAGE", "").strip() or "ru"
    requested = os.environ.get("JARVIS_STT_DEVICE", "").strip() or "auto"
    root = os.environ.get("JARVIS_MODEL_DIR") or None
    # Blank keys copied from .env templates mean "unset": keep the domain prompt.
    prompt = (
        os.environ.get("JARVIS_STT_PROMPT", "").strip()
        or "Джарвис. UTP. Mailcow. MikroTik. WireGuard. SQL. 1С. сервер. резервная копия. проверь состояние."
    )[:600]
    beam_size = env_int("JARVIS_STT_BEAM_SIZE", 5, 1, 10)
    vad_silence = env_int("JARVIS_STT_VAD_SILENCE_MS", 500, 200, 2000)
    speech_pad = env_int("JARVIS_STT_VAD_PAD_MS", 200, 0, 1000)
    no_speech = env_float("JARVIS_STT_NO_SPEECH_THRESHOLD", 0.65, 0.1, 0.95)

    device = "cpu"
    compute = "int8"
    model = None
    if requested in ("auto", "cuda"):
        try:
            model = WhisperModel(
                model_name,
                device="cuda",
                compute_type="int8_float16",
                download_root=root,
            )
            device = "cuda"
            compute = "int8_float16"
        except Exception:
            if requested == "cuda":
                fail("NOT_CONFIGURED", "cuda unavailable")
            model = None
            device = "cpu"
            compute = "int8"
    try:
        if model is None:
            model = WhisperModel(
                model_name,
                device=device,
                compute_type=compute,
                download_root=root,
            )
        segments, info = model.transcribe(
            wav,
            language=None if language == "auto" else language,
            beam_size=beam_size,
            condition_on_previous_text=False,
            initial_prompt=prompt,
            vad_filter=True,
            vad_parameters={
                "min_silence_duration_ms": vad_silence,
                "speech_pad_ms": speech_pad,
            },
            no_speech_threshold=no_speech,
            log_prob_threshold=-1.0,
            compression_ratio_threshold=2.4,
        )
    except Exception as error:  # noqa: BLE001
        fail("STT_FAILED", str(error))

    parts = []
    weighted = 0.0
    total_weight = 0.0
    segment_count = 0
    for segment in segments:
        text = (segment.text or "").strip()
        duration = max(0.05, float(segment.end or 0) - float(segment.start or 0))
        probability = max(0.0, min(1.0, math.exp(float(segment.avg_logprob or -20))))
        speech_probability = max(
            0.0,
            min(1.0, 1.0 - float(getattr(segment, "no_speech_prob", 0.0) or 0.0)),
        )
        confidence = probability * speech_probability
        weighted += confidence * duration
        total_weight += duration
        segment_count += 1
        if text:
            parts.append(text)

    confidence = weighted / total_weight if total_weight else 0.0
    print(
        json.dumps(
            {
                "text": " ".join(parts).strip(),
                "language": info.language,
                "language_confidence": round(
                    float(getattr(info, "language_probability", 0.0) or 0.0), 3
                ),
                "confidence": round(max(0, min(1, confidence)), 3),
                "duration_ms": int((info.duration or 0) * 1000),
                "segments": segment_count,
                "provider": "faster-whisper",
                "model": model_name,
                "device": device,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
