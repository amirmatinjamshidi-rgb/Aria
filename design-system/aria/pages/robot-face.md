# Robot Face Page Overrides

> **PROJECT:** Aria
> **Page Type:** EVE / M-O companion presence

> Rules here **override** `design-system/aria/MASTER.md`.

---

## Visual Direction

Wall-E universe companion (EVE / M-O):
- **Chassis:** High-gloss white, smooth egg-shaped housing
- **Face screen:** Matte dark / deep blue inset display
- **Features:** Neon cyan `#00F0FF` + electric blue `#0066FF` digital glyphs only

## Color Overrides

| Role | Hex |
|------|-----|
| Chassis highlight | `#FFFFFF` → `#CFD8E6` |
| Screen | `#05080F` → `#152038` |
| Primary glow | `#00F0FF` |
| Secondary glow | `#0066FF` |
| Soft glow | `#80F5FF` |
| Error | `#FF4D6D` |

## Face Spec

- Eyes: `oval` · `curved` (happy) · `squint` · `segmented` (thinking) · `dead` (error)
- Brows: glowing bars with rotate / translate / inner tilt
- Mouth: line · smile · frown · o · wave (speaking) · segmented (processing)
- Ambient: blink 3–6s, saccades, breath; `prefers-reduced-motion` respected

## Avoid

- Dark cyberpunk chassis / HUD brackets on the head
- Purple neon palettes
- Emoji icons
