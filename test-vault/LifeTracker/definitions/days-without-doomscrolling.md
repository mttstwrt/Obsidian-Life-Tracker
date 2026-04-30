---
id: days-without-doomscrolling
displayName: Days without doomscrolling
emoji: 📵
kind: reverse-habit
status: active
tags:
  - mental-health
  - phone
created: 2026-02-01
schemaVersion: 1
noteRequired: true
milestones:
  - 7
  - 14
  - 30
  - 60
  - 90
fieldSchema:
  - key: severity
    type: number
    range:
      - 1
      - 5
    prompt: How bad was it (1=brief, 5=hours)?
  - key: trigger
    type: enum
    options:
      - boredom
      - stress
      - news
      - social
    prompt: What triggered it?
---

# Days without doomscrolling

Reverse habit. Goal is to maximize the gap between events. Note required so future-me knows what happened.

## Events

- 2026-04-12T22:30 | 1 | got pulled into election coverage for two hours | id="01HW0DS00000000000000001" severity="5" trigger="news"
- 2026-03-20T19:45 | 1 | scrolling while waiting for the bus, caught it quickly | id="01HW0DS00000000000000002" severity="2" trigger="boredom"
- 2026-02-28T23:10 | 1 | bad day at work, defaulted to phone | id="01HW0DS00000000000000003" severity="4" trigger="stress" entered_at="2026-03-01T09:12"
- 2026-02-14T20:00 | 1 | big lapse, lost the whole evening | id="01HW0DS00000000000000004" severity="6" trigger="loneliness"
