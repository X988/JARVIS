# JARVIS knowledge base

Markdown files here are chunked, embedded with Ollama `nomic-embed-text` and
retrieved before the LLM answers. Answers cite the source file.

Rules:
- No passwords, tokens, keys or other secrets. The indexer refuses chunks that look like secrets.
- Facts only. If something is unknown, write "unknown" rather than guessing.
- Operator notes added at runtime ("запомни: …" plus confirmation) go to
  `<state dir>/knowledge/learned.md` on the server, not into git, and every
  append is written to the hash-chained audit log.
