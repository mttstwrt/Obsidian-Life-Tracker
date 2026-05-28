---
id: obsidian-plugin
displayName: Obsidian plugin
emoji: 🧩
kind: project
status: active
tags:
  - coding
  - side-project
created: 2026-04-15
schemaVersion: 1
dormantAfterDays: 14
fieldSchema:
  - key: minutes
    type: number
    prompt: Minutes spent
  - key: area
    type: enum
    options:
      - design
      - parser
      - ui
      - tests
      - docs
    prompt: What did you work on?
  - key: commits
    type: number
    prompt: Number of commits
  - key: blocked
    type: boolean
    prompt: Did you hit a blocker?
  - key: tags
    type: list
    itemType: string
    retired: true
    prompt: Tags (retired — use 'area' instead)
---

# Obsidian plugin

Project. No cadence target; just track what gets done. The 'tags' field is retired but old events still carry it.

## Events

- 2026-04-29T22:30 | 90 | wrote phase 1 data layer with tests | id="01HW0PL00000000000000001" minutes="90" area="parser" commits="3" blocked="false"
- 2026-04-28T20:15 | 45 | sketched out fieldSchema parsing | id="01HW0PL00000000000000002" minutes="45" area="design" commits="1" blocked="false"
- 2026-04-27T19:00 | 30 | spent on tooling, irritated | id="01HW0PL00000000000000003" minutes="30" area="docs" commits="0" blocked="true"
- 2026-04-20T14:00 | 60 | initial spike before today's restart | id="01HW0PL00000000000000004" minutes="60" area="ui" commits="2" blocked="false" tags="setup,scaffolding"
- 2026-04-15T21:30 | 20 | scaffolded repo from template | id="01HW0PL00000000000000005" minutes="20" area="bootstrap" commits="1" blocked="false" tags="bootstrap"
- 2026-05-01T22:31 |  |  | id="01KQKBVMHXSJZKED1G83FWT4E2" area="" blocked=""
- 2026-05-21T19:51 |  |  | id="01KS6JN0AP85VGEAMHYVG0CEJF" area="" blocked=""
