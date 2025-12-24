/**
 * Database Migrations System
 * Handles schema migrations for the sd-webui database
 */

import { getDatabase } from './database.js';
import { existsSync, readdirSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Migrations directory
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

// Migration tracking table
const MIGRATIONS_TABLE = '_migrations';

/**
 * Get all migration files sorted by version number
 */
function getMigrationFiles() {
  if (!existsSync(MIGRATIONS_DIR)) {
    return [];
  }

  const files = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.js'))
    .sort((a, b) => {
      // Extract version numbers (assuming format: 001_name.js, 002_name.js, etc.)
      const aNum = parseInt(a.split('_')[0], 10);
      const bNum = parseInt(b.split('_')[0], 10);
      return aNum - bNum;
    });

  return files;
}

/**
 * Get list of applied migrations from database
 */
function getAppliedMigrations() {
  const db = getDatabase();

  // Create migrations table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      version TEXT PRIMARY KEY,
      name TEXT,
      applied_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
    )
  `);

  const stmt = db.prepare(`SELECT version FROM ${MIGRATIONS_TABLE} ORDER BY version`);
  return stmt.all().map(row => row.version);
}

/**
 * Apply a single migration
 */
async function applyMigration(migrationFile) {
  const db = getDatabase();
  const version = migrationFile.split('_')[0];
  const migrationPath = path.join(MIGRATIONS_DIR, migrationFile);

  // Import and run the migration
  const migration = await import(migrationPath);

  console.log(`[Migrations] Applying migration ${version}: ${migration.description || migrationFile}`);

  // Start transaction
  const transaction = db.transaction(() => {
    // Run the migration up function
    if (migration.up) {
      migration.up(db);
    }

    // Record the migration
    const stmt = db.prepare(`INSERT INTO ${MIGRATIONS_TABLE} (version, name) VALUES (?, ?)`);
    stmt.run(version, migration.description || migrationFile);
  });

  transaction();
  console.log(`[Migrations] Applied migration ${version}`);
}

/**
 * Run all pending migrations
 */
export async function runMigrations() {
  const migrationFiles = getMigrationFiles();
  const appliedMigrations = getAppliedMigrations();

  const pendingMigrations = migrationFiles.filter(f => {
    const version = f.split('_')[0];
    return !appliedMigrations.includes(version);
  });

  if (pendingMigrations.length === 0) {
    console.log('[Migrations] No pending migrations');
    return { applied: 0, total: migrationFiles.length };
  }

  console.log(`[Migrations] Found ${pendingMigrations.length} pending migration(s)`);

  for (const migrationFile of pendingMigrations) {
    await applyMigration(migrationFile);
  }

  return { applied: pendingMigrations.length, total: migrationFiles.length };
}

/**
 * Get migration status
 */
export function getMigrationStatus() {
  const migrationFiles = getMigrationFiles();
  const appliedMigrations = getAppliedMigrations();

  return {
    total: migrationFiles.length,
    applied: appliedMigrations.length,
    pending: migrationFiles.length - appliedMigrations.length,
    migrations: migrationFiles.map(f => {
      const version = f.split('_')[0];
      return {
        version,
        file: f,
        applied: appliedMigrations.includes(version)
      };
    })
  };
}

/**
 * Create a new migration file
 */
export async function createMigration(name) {
  const version = String(Date.now()).slice(-6); // Use last 6 digits of timestamp
  const filename = `${version}_${name}.js`;
  const filepath = path.join(MIGRATIONS_DIR, filename);

  const template = `/**
 * Migration: ${name}
 * Version: ${version}
 */

export const description = '${name}';

export function up(db) {
  // Add your migration SQL here
  db.exec(\`
    -- Example: ALTER TABLE table_name ADD COLUMN new_column TEXT;
  \`);
}

export function down(db) {
  // Add rollback SQL here (optional)
  // Note: SQLite has limited ALTER TABLE support for dropping columns
  // You may need to recreate the table without the column
}
`;

  const { writeFile } = await import('fs/promises');
  await writeFile(filepath, template);

  console.log(`[Migrations] Created migration: ${filename}`);
  return filename;
}

/**
 * Run migrations from CLI
 */
export async function migrateCLI() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'status':
      const status = getMigrationStatus();
      console.log(`\nMigration Status:`);
      console.log(`  Total: ${status.total}`);
      console.log(`  Applied: ${status.applied}`);
      console.log(`  Pending: ${status.pending}\n`);
      for (const m of status.migrations) {
        console.log(`  ${m.applied ? '✓' : '○'} ${m.version} - ${m.file}`);
      }
      break;

    case 'up':
    case 'migrate':
      await runMigrations();
      break;

    case 'create':
      if (!args[1]) {
        console.error('Usage: node migrations.js create <migration-name>');
        process.exit(1);
      }
      await createMigration(args[1]);
      break;

    default:
      console.log(`
Usage: node migrations.js <command>

Commands:
  status    - Show migration status
  up        - Run pending migrations
  migrate   - Alias for 'up'
  create    - Create a new migration file

Examples:
  node migrations.js status
  node migrations.js up
  node migrations.js create add_user_table
      `);
  }
}
