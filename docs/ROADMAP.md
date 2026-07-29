# Aria Roadmap

Durations assume **solo, part-time** development. Every phase ends with: passing tests, updated docs/ADRs, and a demo scenario.

---

## Phase 0 — Research & Foundation

**Duration:** 4–6 weeks

### Objectives
- Prove hexagonal + plugin architecture before any real model integration
- Lock contracts, bus, DI, and documentation

### Deliverables
- npm workspaces + Turborepo monorepo
- `@aria/contracts`, `@aria/core`
- Mock/Echo LLM swap demo + tests
- ADRs 0001–0004
- Architecture, roadmap, learning, budget, contributing docs

### Skills
TypeScript, Node.js, Clean Architecture, DI

### Technologies
npm workspaces, Turborepo, Zod, Vitest, ESLint

### Acceptance criteria
- Two `ILLMProvider` plugins swap via `ARIA_LLM_PROVIDER` with **zero** brain code changes
- `npm run build` and `npm test` pass

### Testing
Unit tests for contracts/core; integration test for provider swap

### Future expansion
Ollama adapter registration without touching conversation service

---

## Phase 1 — Brain

**Duration:** 8–10 weeks

### Objectives
Local bilingual conversation with tool calling and personality

### Deliverables
- `ILLMProvider` Ollama / llama.cpp adapter for Qwen 3 (GGUF Q4)
- Tool registry + structured tool-call handling
- Personality / system-prompt engine
- Persian + English multi-turn chat

### Skills
LLM APIs, prompt engineering, tool calling

### Technologies
Qwen 3, Ollama or llama.cpp, Zod tool schemas

### Acceptance criteria
- Coherent bilingual multi-turn chat
- Tool calls emit validated events
- Provider still swappable by config

### Testing
Golden conversation fixtures (en/fa); tool-call schema tests

### Future expansion
Streaming tokens; multi-agent specialist brains behind same port

---

## Phase 2 — Voice

**Duration:** 6–8 weeks

### Objectives
Hands-free voice loop offline

### Deliverables
- Faster-Whisper sidecar, Silero VAD, Piper TTS (fa + en)
- Streaming pipeline + barge-in
- `ISTTProvider` / `ITTSProvider` adapters

### Skills
Audio DSP basics, WebSocket/HTTP sidecar design

### Technologies
Faster-Whisper, Piper, Silero VAD, Python FastAPI/uvicorn

### Acceptance criteria
- Hands-free bilingual conversation
- End-to-end latency **< 2 s** on the RTX 4060 machine

### Testing
Fixture WAV transcription; TTS smoke; latency budgets in CI (soft)

### Future expansion
Wake word; multi-mic array beamforming

---

## Phase 3 — Memory

**Duration:** 6–8 weeks

### Objectives
Persistent recall and preference adaptation

### Deliverables
- ChromaDB `IMemoryStore` adapter
- Episodic / semantic / preference / routine stores
- RAG injection into brain context
- Basic routine detection

### Skills
Embeddings, RAG, vector DBs

### Technologies
ChromaDB, local embedding model

### Acceptance criteria
- Recalls facts from prior sessions
- Adapts to stated preferences

### Testing
Store/query unit tests; cross-session integration test

### Future expansion
Graph memory; user multi-profile

---

## Phase 4 — Vision

**Duration:** 8–12 weeks

### Objectives
Scene understanding from a webcam feeding the world model

### Deliverables
- YOLO11, SAM2, MediaPipe, Qwen2.5-VL sidecars
- `IVisionProvider` facade + tracking
- Privacy-aware optional face recognition (opt-in)

### Skills
OpenCV, YOLO, VLM prompting

### Technologies
Ultralytics YOLO11, SAM2, MediaPipe, Qwen2.5-VL

### Acceptance criteria
- Accurate "what do you see?" from webcam
- Persistent object tracks across frames

### Testing
Labeled image fixtures; tracking ID stability tests

### Future expansion
Depth fusion; affordance detection for grasping

---

## Phase 5 — Planner

**Duration:** 8–10 weeks

### Objectives
Multi-step task execution with failure recovery

### Deliverables
- BT engine + skill library format
- GOAP-style goal decomposer
- Safety guard nodes
- Dashboard BT visualizer (basic)

### Skills
Behavior Trees, planning theory

### Technologies
Custom BT runtime (TS), skill manifests

### Acceptance criteria
- Mock "make tea" planned and executed with failure recovery
- E-stop / cancel interrupts running tree

### Testing
BT node unit tests; scenario integration with mock skills

### Future expansion
Learning new skills from demonstration

---

## Phase 6 — Smart Home

**Duration:** 4–6 weeks

### Objectives
Voice-controlled home devices as planner skills

### Deliverables
- Home Assistant WebSocket adapter
- MQTT adapter
- Device skills implementing `IRobotSkill`

### Skills
Home automation protocols, MQTT

### Technologies
Home Assistant, MQTT, Matter (as available)

### Acceptance criteria
- Voice controls real devices
- Routine like "movie night" runs multi-device plan

### Testing
Mock HA sandbox; contract tests per adapter

### Future expansion
Zigbee/Bluetooth direct adapters if needed

---

## Phase 7 — Simulation

**Duration:** 10–14 weeks

### Objectives
Full cognitive loop against Gazebo before buying a base

### Deliverables
- Aria URDF, kitchen/living-room worlds
- ROS2 bridge in `robot-api`
- Sim cameras into vision pipeline

### Skills
ROS2, Gazebo, URDF, TF

### Technologies
ROS2 Humble/Jazzy, Gazebo, rviz2

### Acceptance criteria
- Voice → plan → simulated navigation with **zero** cognition code changes
- Same skills later bind to hardware

### Testing
Simulation scenarios as CI gate (where runners allow)

### Future expansion
Isaac Sim secondary world for RL locomotion

---

## Phase 8 — Robot SDK

**Duration:** 6–8 weeks

### Objectives
Third-party-style skill authoring

### Deliverables
- Public `@aria/sdk`
- Skill authoring toolkit + docs
- HAL spec + safety checklist

### Skills
API design, documentation

### Technologies
TypeScript SDK, examples package

### Acceptance criteria
- New skill authored using only SDK + docs

### Testing
Example skill CI; semver contract tests

### Future expansion
Skill marketplace format

---

## Phase 9 — Mobile Robot

**Duration:** 3–5 months (first hardware)

### Objectives
Real wheeled platform in the home

### Deliverables
- Chassis + lidar + Jetson Orin + depth camera
- Nav2 integration via robot-api
- Dashboard live teleop/status

### Skills
Embedded Linux, Nav2, power systems

### Technologies
Jetson Orin Nano, RPLidar, OAK-D / RealSense, Nav2

### Acceptance criteria
- Navigates home, responds to voice, streams to dashboard

### Testing
On-robot smoke checklist; geofenced test area

### Future expansion
Docking; multi-floor maps

---

## Phase 10 — One Arm

**Duration:** 4–6 months

### Objectives
Pick-and-place with vision feedback

### Deliverables
- Arm integration, MoveIt2, grasp pipeline
- Chore skills (fetch object, clear table item)

### Skills
Kinematics, MoveIt2, grasping

### Technologies
SO-ARM100 or Lite 6, MoveIt2

### Acceptance criteria
- Reliable pick-and-place of household objects in known scenes

### Testing
Repeated grasp trials; force/torque limits verified

### Future expansion
Tool use (spatula, cloth)

---

## Phase 11 — Dual Arm

**Duration:** 4–6 months

### Objectives
Bimanual cooking-assist tasks

### Deliverables
- Dual-arm coordination
- Skills: stir, hand over utensil, hold bowl

### Skills
Bimanual planning, coordination

### Technologies
Second arm, synchronized MoveIt / custom BT skills

### Acceptance criteria
- Demonstrated cooking-assist sequence in kitchen sim + real

### Testing
Collision checks; human-in-loop safety trials

### Future expansion
Learned bimanual policies

---

## Phase 12 — Humanoid

**Duration:** 12+ months

### Objectives
140 cm platform; balance and full chore scenarios

### Deliverables
- Integrated humanoid
- Locomotion (likely RL in Isaac Sim → deploy)
- End-to-end home assistant demos

### Skills
Dynamics, WBC, RL, mech/EE collaboration

### Technologies
Custom/open humanoid stack, Isaac Sim, onboard compute

### Acceptance criteria
- Walk + manipulate in controlled home environment
- Offline bilingual assistant behaviors intact

### Testing
Harnessed fall-safe tests; staged environment expansion

### Future expansion
Near-commercial reliability, certifications, fleet updates
