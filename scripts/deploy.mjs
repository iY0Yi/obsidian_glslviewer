import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const DEFAULT_VAULT_PATH = '/home/andy/GoogleDrive/Obsidian/Tech Art Andy';
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, '..');
const FILES_TO_COPY = ['main.js', 'manifest.json', 'styles.css'];

function parseArgs(argv) {
	const args = { vaultPath: undefined, dryRun: false };

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === '--dry-run') {
			args.dryRun = true;
			continue;
		}
		if (arg.startsWith('--vault=')) {
			args.vaultPath = arg.slice('--vault='.length);
			continue;
		}
		if (arg === '--vault') {
			args.vaultPath = argv[i + 1];
			i++;
		}
	}

	return args;
}

const { vaultPath: cliVaultPath, dryRun } = parseArgs(process.argv.slice(2));
const vaultPath = cliVaultPath || process.env.OBSIDIAN_VAULT_PATH || DEFAULT_VAULT_PATH;

if (!vaultPath) {
	console.error('No vault path provided. Use --vault "<path>" or set OBSIDIAN_VAULT_PATH.');
	process.exit(1);
}

const manifestPath = path.join(ROOT_DIR, 'manifest.json');
if (!existsSync(manifestPath)) {
	console.error(`manifest.json not found at ${manifestPath}`);
	process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const pluginId = manifest.id;
const pluginVersion = manifest.version;

if (!pluginId) {
	console.error('manifest.json is missing required "id" field.');
	process.exit(1);
}

const pluginDir = path.join(vaultPath, '.obsidian', 'plugins', pluginId);

for (const file of FILES_TO_COPY) {
	const sourcePath = path.join(ROOT_DIR, file);
	if (!existsSync(sourcePath)) {
		console.error(`Missing build artifact: ${sourcePath}`);
		console.error('Run "npm run build" before deploy.');
		process.exit(1);
	}
}

if (dryRun) {
	console.log('[dry-run] Vault path:', vaultPath);
	console.log('[dry-run] Plugin directory:', pluginDir);
	for (const file of FILES_TO_COPY) {
		console.log(`[dry-run] Copy ${path.join(ROOT_DIR, file)} -> ${path.join(pluginDir, file)}`);
	}
	process.exit(0);
}

mkdirSync(pluginDir, { recursive: true });

for (const file of FILES_TO_COPY) {
	copyFileSync(path.join(ROOT_DIR, file), path.join(pluginDir, file));
}

const deployedManifestPath = path.join(pluginDir, 'manifest.json');
const deployedManifest = JSON.parse(readFileSync(deployedManifestPath, 'utf8'));

console.log(`Deployed ${pluginId}@${pluginVersion}`);
console.log(`Target: ${pluginDir}`);
console.log(`Verified deployed manifest version: ${deployedManifest.version}`);
