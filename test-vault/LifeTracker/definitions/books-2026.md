---
id: books-2026
displayName: Books read in 2026
emoji: 📚
kind: counter
status: active
tags:
  - reading
created: 2026-01-01
schemaVersion: 1
unit: books
goal: 24
resetCadence: yearly
fieldSchema:
  - key: title
    type: string
    required: true
    prompt: Title
  - key: author
    type: string
    required: true
    prompt: Author
  - key: rating
    type: number
    range:
      - 1
      - 5
    prompt: Rating (1–5)
  - key: genre
    type: list
    itemType: string
    prompt: Genres
  - key: format
    type: enum
    options:
      - print
      - ebook
      - audio
    prompt: Format
---

# Books read in 2026

Counter. Goal is 24 by year-end. Resets each January.

## Events

- 2026-04-22T21:00 | 1 | finally finished | id="01HW0BK00000000000000001" title="The Three-Body Problem" author="Liu Cixin" rating="5" genre="sci-fi,translated" format="print"
- 2026-04-05T14:00 | 1 | reread, holds up | id="01HW0BK00000000000000002" title="Annihilation" author="Jeff VanderMeer" rating="4" genre="sci-fi,horror" format="ebook"
- 2026-03-12T09:30 | 1 |  | id="01HW0BK00000000000000003" title="The Pragmatic Programmer" author="Hunt and Thomas" rating="3" genre="tech,career" format="audio"
- 2026-02-18T22:00 | 1 | dense but worth it | id="01HW0BK00000000000000004" title="A Pattern Language" author="Christopher Alexander" rating="" genre="design,architecture" format="print"
- 2026-01-09T19:30 | 1 | started the year right | id="01HW0BK00000000000000005" title="Project Hail Mary" author="Andy Weir" rating="5" genre="sci-fi" format="audiobook"
- 2026-05-01T22:31 |  |  | id="01KQKBW4KPBZCY8KYHE9PF825R" title="hello world" author="==" rating="5" format=""
