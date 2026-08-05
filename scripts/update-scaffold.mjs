import { copyFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// Scaffold files to copy from extracted source
const SCAFFOLD_FILES = [
  'package.json',
  'tsconfig.json',
  'vite.config.ts',
  'index.html',
  'README.md',
  '.gitignore',
  '.prettierrc',
];

// Sample app files to copy from extracted source
const SAMPLE_APP_FILES = [
  'src/index.css',
  'src/App.tsx',
  'src/main.tsx',
];

async function updateScaffold(sourcePath, version = 'latest') {
  const sourceDir = sourcePath.startsWith('/') ? sourcePath : join(process.cwd(), sourcePath);
  const targetSourceDir = join(rootDir, 'scaffolds', version, 'source');
  const targetSampleDir = join(rootDir, 'scaffolds', version, 'sample-app');

  console.log(`Updating scaffold from: ${sourceDir}`);
  console.log(`Target source scaffold: ${targetSourceDir}`);
  console.log(`Target sample app: ${targetSampleDir}`);

  // Ensure target directories exist
  await mkdir(targetSourceDir, { recursive: true });
  await mkdir(targetSampleDir, { recursive: true });

  // Copy scaffold files
  for (const file of SCAFFOLD_FILES) {
    try {
      const src = join(sourceDir, file);
      const dst = join(targetSourceDir, file);
      await copyFile(src, dst);
      console.log(`✓ ${file}`);
    } catch (err) {
      console.warn(`✗ ${file}: ${err.message}`);
    }
  }

  // Copy sample app files
  for (const file of SAMPLE_APP_FILES) {
    try {
      const src = join(sourceDir, file);
      const dst = join(targetSampleDir, file);
      await mkdir(dirname(dst), { recursive: true });
      await copyFile(src, dst);
      console.log(`✓ ${file}`);
    } catch (err) {
      console.warn(`✗ ${file}: ${err.message}`);
    }
  }

  console.log(`\n✓ Scaffold updated at /scaffolds/${version}`);
  console.log(`Next: git add scaffolds/ && git commit -m "Update scaffold to..."`);
}

const args = process.argv.slice(2);
const sourcePath = args[0];
const version = args[1] || 'latest';

if (!sourcePath) {
  console.error('Usage: npm run update-scaffold <path-to-extracted-source> [version]');
  console.error('Example: npm run update-scaffold ~/Downloads/my-cribl-app');
  process.exit(1);
}

await updateScaffold(sourcePath, version);
