import { copyFile, mkdir, readdir, stat } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// Files/directories to exclude when copying
// Only exclude build artifacts and dependencies
const EXCLUDE = new Set([
  'node_modules', '.git', 'dist', 'build', '.DS_Store',
  'package-lock.json', // npm lock file (not needed in scaffold)
]);

async function copyRecursive(srcDir, dstDir) {
  await mkdir(dstDir, { recursive: true });

  for (const entry of await readdir(srcDir)) {
    if (EXCLUDE.has(entry)) continue;

    const srcPath = join(srcDir, entry);
    const dstPath = join(dstDir, entry);
    const statInfo = await stat(srcPath);

    if (statInfo.isDirectory()) {
      await copyRecursive(srcPath, dstPath);
    } else {
      await mkdir(dirname(dstPath), { recursive: true });
      await copyFile(srcPath, dstPath);
      const relPath = relative(srcDir, srcPath);
      console.log(`✓ ${relPath}`);
    }
  }
}

async function updateScaffold(sourcePath, version = 'latest') {
  const sourceDir = sourcePath.startsWith('/') ? sourcePath : join(process.cwd(), sourcePath);
  const targetSourceDir = join(rootDir, 'scaffolds', version, 'source');
  const targetSampleDir = join(rootDir, 'scaffolds', version, 'sample-app');

  console.log(`Updating scaffold from: ${sourceDir}`);
  console.log(`Target source scaffold: ${targetSourceDir}`);
  console.log(`Target sample app: ${targetSampleDir}\n`);

  try {
    // Copy root-level files and config to source/
    await copyRecursive(sourceDir, targetSourceDir);

    // Copy src/ to sample-app/
    const srcPath = join(sourceDir, 'src');
    const statInfo = await stat(srcPath);
    if (statInfo.isDirectory()) {
      await copyRecursive(srcPath, join(targetSampleDir, 'src'));
    }

    console.log(`\n✓ Scaffold updated at /scaffolds/${version}`);
    console.log(`Next: git add scaffolds/ && git commit -m "Update scaffold to..."`);
  } catch (err) {
    console.error(`\n❌ Failed: ${err.message}`);
    process.exit(1);
  }
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
