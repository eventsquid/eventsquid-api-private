/**
 * Script to analyze Mantle routes and generate migration checklist
 * Run: node scripts/analyze-routes.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MANTLE_PATH = path.join(__dirname, '..', '..', 'mantle', 'controllers');

function analyzeController(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const fileName = path.basename(filePath);
  const routes = [];
  
  // Match router.get, router.post, router.put, router.delete, router.patch
  const routeRegex = /router\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/g;
  let match;
  
  while ((match = routeRegex.exec(content)) !== null) {
    const method = match[1].toUpperCase();
    const path = match[2];
    routes.push({ method, path, file: fileName });
  }
  
  return routes;
}

function main() {
  const controllers = fs.readdirSync(MANTLE_PATH)
    .filter(f => f.endsWith('.js') && f !== 'index.js')
    .map(f => path.join(MANTLE_PATH, f));
  
  const allRoutes = [];
  const routesByController = {};
  
  controllers.forEach(controllerPath => {
    const routes = analyzeController(controllerPath);
    const controllerName = path.basename(controllerPath, '.js');
    routesByController[controllerName] = routes;
    allRoutes.push(...routes.map(r => ({ ...r, controller: controllerName })));
  });
  
  console.log('\n=== Route Analysis ===\n');
  console.log(`Total Routes: ${allRoutes.length}\n`);
  console.log('Routes by Controller:\n');
  
  Object.entries(routesByController).forEach(([controller, routes]) => {
    console.log(`${controller}: ${routes.length} routes`);
    routes.forEach(r => {
      console.log(`  ${r.method} ${r.path}`);
    });
    console.log('');
  });
  
  // Generate migration checklist
  const checklist = Object.keys(routesByController).map(controller => {
    const count = routesByController[controller].length;
    return `- [ ] ${controller} (${count} routes)`;
  }).join('\n');
  
  console.log('\n=== Migration Checklist ===\n');
  console.log(checklist);
  
  // Save to file
  const outputPath = path.join(__dirname, '..', 'ROUTE_ANALYSIS.md');
  const output = `# Route Analysis

Generated: ${new Date().toISOString()}

## Summary
- Total Routes: ${allRoutes.length}
- Total Controllers: ${Object.keys(routesByController).length}

## Routes by Controller

${Object.entries(routesByController).map(([controller, routes]) => {
  return `### ${controller} (${routes.length} routes)\n\n${routes.map(r => `- ${r.method} ${r.path}`).join('\n')}`;
}).join('\n\n')}

## Migration Checklist

${checklist}
`;
  
  fs.writeFileSync(outputPath, output);
  console.log(`\n✅ Analysis saved to ${outputPath}`);
}

main();

