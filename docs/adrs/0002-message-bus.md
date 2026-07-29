# ADR-0002: Message bus — in-process with NATS port

- Status: Accepted
- Date: 2026-07-29
- Deciders: Chief Software Architect

## Context

Services must communicate without tight coupling. Options range from direct HTTP between apps, to a broker (NATS/RabbitMQ/Kafka), to ROS2 everywhere. The brain must never talk to motors; cognition services need a clean event catalog; development must work on a laptop without Docker/ROS2.

## Decision

1. All inter-service communication goes through the **`IMessageBus` port** in `@aria/contracts`.
2. **Phase 0–6 default adapter**: `InProcessMessageBus` (same process, typed publish/subscribe).
3. **Multi-process adapter**: `NatsMessageBus` (stub in Phase 0, real client when services split).
4. **ROS2** is used only inside `robot-api` as the bridge to simulation and hardware — cognition layers never import ROS2.

Event schemas live in the contracts event catalog and are validated with Zod.

## Alternatives considered

| Option | Pros | Cons |
|--------|------|------|
| Direct HTTP/gRPC between apps | Simple request/response | Tight coupling; hard fan-out; sync failure modes |
| ROS2 for everything | Native robotics | Heavy for brain/voice on Windows; language friction |
| Kafka | Strong durability | Overkill for home robot; ops heavy |
| **In-process + NATS port** | Zero-ops mid-dev; scales to multi-process | Must keep bus abstraction honest |

## Consequences

- Positive: brain, memory, planner can be developed and tested without brokers.
- Positive: swapping to NATS is a config + adapter change, not a rewrite.
- Positive: ROS2 stays at the execution boundary (safety, realtime topics).
- Negative: in-process bus does not survive process crashes — acceptable until multi-process.
- Negative: NATS stub must not leak into production paths until implemented.
