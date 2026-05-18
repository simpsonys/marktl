---
publish: true
visibility: public-safe
reviewed: true
tags: [study, privacy]
summary: A safe public example about privacy boundaries for Voice Assistant notes.
---

# Privacy Design For Voice Assistant Notes

Privacy design starts by deciding what the publication must never need.

## Data Boundaries

- Prefer derived metadata over raw conversational content.
- Keep debug identifiers separate from reader-facing documents.
- Write examples with synthetic content.

## Publication Checklist

- The note is marked `publish: true`.
- The note is marked `visibility: public-safe`.
- The note was reviewed by a person before export.

## Reader Outcome

A reader should understand the privacy stance without seeing private system details.
