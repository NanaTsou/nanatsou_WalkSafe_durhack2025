import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'csv-parse/sync';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RAW_DIR = path.join(__dirname, '..', 'data', 'raw');
const OUTPUT = path.join(__dirname, '..', 'data', 'processed', 'heatmap.json');

function loadCsvFiles() {
  const files = fs.readdirSync(RAW_DIR).filter((file) => file.endsWith('.csv'));
  return files.flatMap((file) => {
    const content = fs.readFileSync(path.join(RAW_DIR, file), 'utf-8');
    return parse(content, {
      columns: ['lat', 'lng', 'period', 'category', 'resolution'],
      skip_empty_lines: true,
      from_line: 2
    });
  });
}

function enrich(records) {
  return records.map((row) => ({
    lat: Number(row.lat),
    lng: Number(row.lng),
    period: row.period,
    category: row.category,
    count: 1,
    score: riskScore(row)
  }));
}

function riskScore(row) {
  const base = row.resolution === 'Under investigation' ? 0.2 : row.resolution === 'No further action' ? 0.4 : 0.6;
  const month = Number(row.period.split('-')[1]);
  const seasonBoost = [12, 1, 2].includes(month) ? 0.1 : 0;
  return Math.min(1, base + seasonBoost);
}

function aggregate(enriched) {
  const map = new Map();
  enriched.forEach((row) => {
    const key = `${row.lat.toFixed(4)}-${row.lng.toFixed(4)}-${row.category}-${row.period}`;
    if (!map.has(key)) {
      map.set(key, { ...row });
    } else {
      const existing = map.get(key);
      existing.count += 1;
      existing.score = Math.max(existing.score, row.score);
    }
  });
  return Array.from(map.values());
}

export function processCrimeData() {
  const raw = loadCsvFiles();
  const enriched = enrich(raw);
  const aggregated = aggregate(enriched);
  fs.writeFileSync(OUTPUT, JSON.stringify(aggregated, null, 2));
  console.log(`Saved ${aggregated.length} heatmap points to ${OUTPUT}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  processCrimeData();
}
