import postgres, { type Sql } from "postgres";

// Lazy singleton Postgres client (Supabase/Neon). Serverless-friendly:
// prepared statements off (required by Supabase's transaction pooler) and a
// small pool. Use the POOLER connection string (port 6543) on Vercel.
let _sql: Sql | null = null;

export function getSql(): Sql {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    _sql = postgres(url, { prepare: false, max: 5, idle_timeout: 20 });
  }
  return _sql;
}
