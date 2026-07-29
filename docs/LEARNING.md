# Aria Learning Roadmap

Learn **just in time** with each phase. Depth over breadth. Build a small practice project for every topic.

---

## 1. TypeScript Architecture & Node.js Backend

**Why:** Entire cognition stack is TypeScript; architecture quality determines long-term survival.

**Order:** TS strict mode → modules → async → hexagonal/Clean Architecture → DI → event-driven services

**Time:** 4–6 weeks (parallel with Phase 0–1)

**Resources:**
- TypeScript Handbook (official)
- *Learning Domain-Driven Design* — Vlad Khononov
- Node.js best practices (goldbergyoni)

**Practice:** Rebuild a tiny version of `@aria/core` (container + bus) from scratch

**Connects to Aria:** Every app composition root and port adapter

---

## 2. LLMs, Prompt Engineering, Tool Calling

**Why:** Brain reasoning, planning goals, bilingual conversation

**Order:** Transformer intuition → chat APIs → system prompts → tool/function calling → evaluation

**Time:** 3–4 weeks

**Resources:**
- Hugging Face NLP course
- OpenAI / Ollama tool-calling docs (patterns transfer)
- llama.cpp / Ollama docs

**Practice:** Local Qwen chat CLI with 2–3 tools (clock, notes, fake light switch)

**Connects to Aria:** `ILLMProvider`, Phase 1 brain

---

## 3. Embeddings, RAG, Vector Memory

**Why:** Preferences, recall, routines without stuffing the context window

**Order:** Embeddings → similarity → chunking → RAG pipelines → evaluation

**Time:** 2–3 weeks

**Resources:**
- ChromaDB docs
- Hugging Face embeddings guides

**Practice:** Personal notes RAG over Chroma with Persian + English queries

**Connects to Aria:** `IMemoryStore`, Phase 3

---

## 4. Computer Vision

**Why:** Scene understanding for chores and navigation

**Order:** OpenCV basics → YOLO detection → tracking → MediaPipe pose/hands → SAM segmentation → VLM

**Time:** 6 weeks (Phase 4)

**Resources:**
- OpenCV Python tutorials
- Ultralytics YOLO docs
- MediaPipe solutions docs
- SAM2 / Qwen2.5-VL model cards

**Practice:** Webcam app that labels objects and answers "what do you see?" via a VLM

**Connects to Aria:** `IVisionProvider`, vision sidecars

---

## 5. Planning — Behavior Trees, GOAP, FSMs

**Why:** Safe, interruptible multi-step chores

**Order:** FSM → Behavior Trees → GOAP → hybrid design (read ADR-0003)

**Time:** 3–4 weeks (Phase 5)

**Resources:**
- *Behavior Trees in Robotics and AI* — Colledanchise & Ögren (free PDF)
- Game AI Pro BT chapters
- GOAP primer articles / Jeff Orkin writings

**Practice:** BT that simulates "make tea" with injectable failures and cancel

**Connects to Aria:** `apps/planner`

---

## 6. ROS2, Gazebo, URDF

**Why:** Standard robot middleware and sim-before-hardware

**Order:** ROS2 nodes/topics/services → TF → URDF → Gazebo → bridge to Aria bus

**Time:** 8–10 weeks (Phases 5–7)

**Resources:**
- Official ROS2 tutorials
- Articulated Robotics (YouTube)
- Gazebo docs

**Practice:** Diff-drive robot in Gazebo teleoped via topics; publish odom

**Connects to Aria:** `robot-api` ROS2 bridge; sim assets

---

## 7. Math — Linear Algebra, Transforms, Kinematics

**Why:** Poses, cameras, arms, and debugging TF trees

**Order:** Vectors/matrices → rotations / quaternions → homogeneous transforms → FK → IK intuition

**Time:** 4–6 weeks overlapping Phases 5–10

**Resources:**
- 3Blue1Brown *Essence of Linear Algebra*
- *Modern Robotics* — Lynch & Park (free book + videos)

**Practice:** Pure TS/Python library converting Euler ↔ quaternion ↔ matrix; FK for a 3-DOF arm

**Connects to Aria:** MoveIt frames, grasp poses, camera extrinsics

---

## 8. MoveIt2 & Manipulation

**Why:** One-arm and dual-arm choreography

**Order:** Planning groups → collision scenes → grippers → visual servoing basics

**Time:** 6–8 weeks (Phase 10)

**Resources:**
- MoveIt2 tutorials
- PickNik / ROS manipulation workshops

**Practice:** Pick cube in Gazebo with MoveIt2

**Connects to Aria:** Arm skills behind `IRobotSkill`

---

## 9. Control Systems & Embedded

**Why:** Motors, PID, safety limits, CAN/serial actuators

**Order:** PID intuition → motor drivers → MCU basics → buses (UART/CAN) → watchdogs

**Time:** 6–8 weeks (Phases 8–10)

**Resources:**
- *Feedback Control for Computer Systems* (practical) or similar PID intros
- ODrive / moteus docs
- Vendor MCU getting-started

**Practice:** PID speed control on a single motor with e-stop

**Connects to Aria:** Hardware HAL under robot-api

---

## 10. Isaac Sim & RL (later)

**Why:** Locomotion and sim-to-real for humanoid

**Order:** Isaac basics → domain randomization → simple RL locomotion → export/deploy

**Time:** 2–4 months (Phase 11–12)

**Resources:**
- NVIDIA Isaac Sim docs
- Humanoid loco-manipulation papers / open repos (browse, don't boil ocean)

**Practice:** Train a simple walker in Isaac; play back in viewer

**Connects to Aria:** Secondary sim target; locomotion skills

---

## 11. Mechanical & Electrical Engineering

**Why:** Humanoid prototype needs frames, power, wiring, thermal

**Order:** Learn **just-in-time**; partner or outsource CAD/PCB where possible

**Time:** Ongoing Phases 9–12

**Resources:**
- Basic statics; battery/BMS safety guides; open humanoid BOMs (Open Duck, Berkeley Humanoid, etc.)

**Practice:** Design a 3D-printed bracket with load path awareness; wire a fuse-protected power rail

**Connects to Aria:** Physical platform; does not change cognitive architecture

---

## Suggested calendar vs phases

| When | Focus |
|------|--------|
| Now / Phases 0–3 | TS architecture, LLMs, RAG |
| Phase 4 | Computer vision |
| Phases 5–7 | BTs, ROS2, Gazebo, math |
| Phases 8–10 | Kinematics, MoveIt2, control, embedded |
| Phases 11–12 | Dynamics, Isaac/RL, mech/EE collaboration |
