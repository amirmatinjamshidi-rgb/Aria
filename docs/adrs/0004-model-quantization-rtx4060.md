# ADR-0004: Local model quantization for RTX 4060 (8 GB)

- Status: Accepted
- Date: 2026-07-29
- Deciders: Chief Software Architect

## Context

Development GPU is an **RTX 4060 (8 GB VRAM)** with 48 GB system RAM. Aria must run local-first: LLM, STT, TTS, and later vision. Models must fit with headroom for the OS and concurrent sidecars. Cloud adapters are optional and off by default.

## Decision

### LLM (Phase 1)

| Setting | Choice |
|---------|--------|
| Family | Qwen 3 |
| Serving | llama.cpp or Ollama behind `ILLMProvider` |
| Quantization | **GGUF Q4_K_M** (primary) |
| Size target | 7B–8B class for interactive chat on 8 GB |
| Context | Start 4k–8k; expand when VRAM allows |
| Fallback | Smaller Qwen / scripted mock when OOM |

14B+ Q4 may run alone but contends with vision — treat as optional upgrade path (see BUDGET: 24 GB GPU).

### Speech (Phase 2)

| Component | Choice |
|-----------|--------|
| STT | Faster-Whisper **small** or **medium** (int8/float16) |
| VAD | Silero VAD (CPU, tiny) |
| TTS | Piper (CPU-friendly ONNX voices, fa + en) |

### Vision (Phase 4)

| Component | Choice |
|-----------|--------|
| Detection | YOLO11n / YOLO11s |
| Segmentation | SAM2 tiny / small — on demand, not always-on |
| VLM | Qwen2.5-VL quantized; **not** co-resident with large LLM if VRAM tight |
| Pose | MediaPipe (CPU/GPU light) |

### Scheduling policy

Graceful degradation ladder (always prefer safe stop over OOM crash):

1. Full stack (LLM + light vision)
2. Drop VLM / heavy vision
3. Drop LLM → scripted / mock responses
4. Safe stop (actuators disabled)

Use CPU offload for Whisper/Piper when GPU is busy with the LLM.

## Alternatives considered

| Option | Pros | Cons |
|--------|------|------|
| Always cloud LLM | Quality, no VRAM worry | Breaks offline / local-first |
| Unquantized FP16 7B+ | Max quality | Won't fit with vision |
| Single huge model for all tasks | Simple | Impossible on 8 GB |
| **Quantized specialists + ports** | Fits hardware; swappable | Tuning burden |

## Consequences

- Positive: Phase 1–4 demos runnable on the existing machine.
- Positive: provider ports mean upgrading GPU later needs no app rewrite.
- Negative: Q4 quality vs FP16 — accept for home assistant; evaluate Q5 when VRAM frees.
- Negative: concurrent LLM + VLM likely requires sequential scheduling or GPU upgrade.
