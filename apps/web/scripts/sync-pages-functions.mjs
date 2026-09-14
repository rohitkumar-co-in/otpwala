import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(webRoot, '..', '..', 'functions');
const destination = join(webRoot, 'functions');

if (!existsSync(source)) {
  throw new Error(`Pages Functions source directory was not found: ${source}`);
}

rmSync(destination, { recursive: true, force: true });
cpSync(source, destination, { recursive: true });

console.log('Synced Pages Functions into the Cloudflare project root.');
