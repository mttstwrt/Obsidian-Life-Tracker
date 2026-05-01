---
id: wash-sheets
displayName: Wash sheets
emoji: 🛏️
kind: maintenance
status: active
tags:
  - home
  - chores
created: 2026-01-15
schemaVersion: 1
intervalDays: 14
warningThresholdDays: 10
fieldSchema:
  - key: rooms
    type: list
    itemType: string
    prompt: Which rooms?
  - key: detergent
    type: enum
    options:
      - regular
      - sensitive
      - heavy-duty
    prompt: Detergent
  - key: water_temp
    type: enum
    options:
      - cold
      - warm
      - hot
    prompt: Water temperature
---

# Wash sheets

Maintenance. Target every 14 days; nag starts at day 10.

## Events

- 2026-04-25T11:00 | 1 | also did pillowcases | id="01HW0WS00000000000000001" rooms="primary,guest" detergent="regular" water_temp="hot"
- 2026-04-09T10:15 | 1 |  | id="01HW0WS00000000000000002" rooms="primary" detergent="sensitive" water_temp="warm"
- 2026-03-22T14:30 | 1 | spilled coffee, emergency wash | id="01HW0WS00000000000000003" rooms="primary" detergent="heavy-duty" water_temp="hot"
- 2026-03-08T11:00 | 1 |  | id="01HW0WS00000000000000004" rooms="primary,guest" detergent="bleach" water_temp="hot"
- 2026-04-30T19:12 | 1 |  | id="01KQGE1KQQQ1GPCYRS6W7X708S" detergent="" water_temp=""
- 2026-04-30T19:13 | 1 |  | id="01KQGE4BTZD3D0DNJMVW2KB09N" detergent="" water_temp=""
- 2026-04-30T22:54 | 1 |  | id="01KQGTSKVXD6JZ37TGPPSH2NVR" detergent="" water_temp=""
