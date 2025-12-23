#!/usr/bin/env node
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const db = new Database(resolve(__dirname, '../data/sd-webui.db'), { readonly: true });
const tableInfo = db.prepare('PRAGMA table_info(queue)').all();
console.log('Queue table columns:');
tableInfo.forEach(col => console.log('  ', col.cid, col.name, col.type, col.notnull, col.dflt_value));
db.close();
