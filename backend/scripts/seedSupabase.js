import 'dotenv/config';
import { createClient } from 'supabase';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function ensureTable(name, sql) {
  const { error } = await supabase.rpc('execute_sql', { sql });
  if (error) {
    console.error(`Failed to ensure table ${name}`, error.message);
  } else {
    console.log(`Ensured table ${name}`);
  }
}

const TABLES = [
  {
    name: 'telemetry_location',
    sql: `
      create table if not exists telemetry_location (
        id bigserial primary key,
        latitude double precision not null,
        longitude double precision not null,
        captured_at timestamptz not null default now()
      );
    `
  },
  {
    name: 'telemetry_search',
    sql: `
      create table if not exists telemetry_search (
        id bigserial primary key,
        query text not null,
        latitude double precision,
        longitude double precision,
        searched_at timestamptz not null default now()
      );
    `
  },
  {
    name: 'telemetry_paths',
    sql: `
      create table if not exists telemetry_paths (
        id bigserial primary key,
        start_lat double precision not null,
        start_lon double precision not null,
        end_lat double precision not null,
        end_lon double precision not null,
        algorithm text not null,
        requested_at timestamptz not null default now()
      );
    `
  },
  {
    name: 'poi_feedback',
    sql: `
      create table if not exists poi_feedback (
        id bigserial primary key,
        poi_id text not null,
        score text not null check (score in ('positive','neutral','negative')),
        recorded_at timestamptz not null default now()
      );
    `
  },
  {
    name: 'heatmap_points',
    sql: `
      create table if not exists heatmap_points (
        id bigserial primary key,
        lat double precision not null,
        lng double precision not null,
        period date not null,
        category text not null,
        count integer not null,
        score double precision not null,
        created_at timestamptz not null default now()
      );
    `
  }
];

async function main() {
  for (const table of TABLES) {
    await ensureTable(table.name, table.sql);
  }
  console.log('Supabase bootstrap complete.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
