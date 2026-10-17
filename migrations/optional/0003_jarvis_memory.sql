-- Optional memory projection. PGLite does not apply files outside migrations/*.sql.
-- The running store remains data/memory.jsonl. Do not enable pgvector here.

create table if not exists jarvis_memory (
  id text primary key,
  kind text not null,
  at timestamptz not null,
  source text not null,
  body text not null,
  confidence text,
  visibility text,
  system text,
  origin text
);
