# ADR-0003: Planner — Behavior Trees + GOAP hybrid

- Status: Accepted
- Date: 2026-07-29
- Deciders: Chief Software Architect

## Context

The planner converts LLM-produced goals into executable action graphs for home robotics (chores, cooking assist, navigation, smart-home routines). Candidates:

1. **Finite State Machines (FSM)**
2. **Behavior Trees (BT)**
3. **GOAP (Goal-Oriented Action Planning)**

Requirements: interruptibility ("stop!"), composability, debuggability, safety guards, simulation parity, and dashboard visualization.

## Comparison

| Criterion | FSM | Behavior Trees | GOAP |
|-----------|-----|----------------|------|
| Composability | Poor (state explosion) | Excellent (subtree reuse) | Good (action library) |
| Reactivity / interrupts | Manual | Native (tick + halt) | Replan cost |
| Debuggability | OK for small graphs | Excellent (tree viz) | Harder (search traces) |
| Safety wrapping | Per-transition | Guard decorator nodes | Post-hoc filters |
| Industry use in robotics | Legacy / low-level | Nav2, game AI, humanoids | Games, some research |
| Multi-step chores | Explodes | Strong | Strong for novel goals |
| Authoring cost | High | Medium (pre-authored trees) | Medium (action preconditions) |

### Finite State Machines

Best for **low-level skills** with few states (e.g. gripper open/close, dock charging). Poor as the top-level chore planner — "make tea" alone fans into dozens of states with brittle transitions.

### Behavior Trees

Industry standard for robot task execution. Trees are reactive (re-ticked every cycle), composable, and interruptible — critical when a human says "stop" mid-chore. Easy to visualize on the dashboard. Weakness: mostly **pre-authored**; pure BTs do not invent novel plans from scratch.

### GOAP

Planner searches an action space given preconditions/effects to reach a goal. Great for **emergent** sequences. Weakness: harder to debug, less predictable for safety certification, can thrash on incomplete world models.

## Decision

**Hybrid architecture:**

1. LLM emits a structured `Goal` (never raw motor commands).
2. A **GOAP-style decomposer** selects and parametrizes pre-authored **BT subtrees** from a skill library.
3. A **BT engine** executes the graph with **safety guard nodes** wrapping every actuator skill.
4. **FSMs** may live *inside* individual low-level skills only.

The planner does not know whether skills run in Gazebo or on real hardware (`IRobotSkill` port).

## Alternatives considered

- Pure BT: insufficient for novel goal assembly without a huge hand-authored forest.
- Pure GOAP: weak interrupt story and poor operator visibility for a home product.
- LLM as planner: unsafe, non-deterministic, hard to certify — rejected. LLM proposes goals; planner owns execution graphs.

## Consequences

- Positive: interruptible, visualizable, testable execution.
- Positive: skill library grows independently of the LLM.
- Positive: aligns with ROS2 Nav2 BT patterns — transferable skills.
- Negative: need both a BT runtime and a lightweight decomposer.
- Negative: skill authors must document preconditions/effects for GOAP selection.
