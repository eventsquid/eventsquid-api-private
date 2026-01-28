/**
 * Migration script to convert tedious-promises queries to mssql package queries
 * 
 * Pattern conversion:
 * OLD: await connection.sql(query).parameter('name', TYPES.Int, value).execute()
 * NEW: const request = new sql.Request(); request.input('name', sql.Int, value); const result = await request.query(query); const data = result.recordset;
 * 
 * This script helps identify patterns but manual review is required for each file.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.join(__dirname, '..', 'src');

function findFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      findFiles(filePath, fileList);
    } else if (file.endsWith('.js')) {
      fileList.push(filePath);
    }
  });
  return fileList;
}

const files = findFiles(srcDir);
let totalMatches = 0;

files.forEach(filePath => {
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Count patterns
  const sqlPattern = /\.sql\(/g;
  const parameterPattern = /\.parameter\(/g;
  const executePattern = /\.execute\(\)/g;
  
  const sqlMatches = (content.match(sqlPattern) || []).length;
  const paramMatches = (content.match(parameterPattern) || []).length;
  const execMatches = (content.match(executePattern) || []).length;
  
  if (sqlMatches > 0 || paramMatches > 0 || execMatches > 0) {
    const relPath = path.relative(path.join(__dirname, '..'), filePath);
    console.log(`${relPath}: ${sqlMatches} .sql(), ${paramMatches} .parameter(), ${execMatches} .execute()`);
    totalMatches += Math.max(sqlMatches, paramMatches, execMatches);
  }
});

console.log(`\nTotal files with MSSQL queries: ${files.filter(f => {
  const content = fs.readFileSync(f, 'utf8');
  return /\.sql\(|\.parameter\(|\.execute\(\)/.test(content);
}).length}`);
console.log(`Estimated total query patterns to convert: ${totalMatches}`);
