// SPDX-License-Identifier: AGPL-3.0-only
// Build a credential-free corresponding-source bundle, not a working-directory archive.
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { zipSync } from 'fflate'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const output = path.resolve(process.argv[2] || path.join(root, 'dist-source/quayloom-source.zip'))
const excluded = /(^|\/)(node_modules|\.git|\.gradle|\.kotlin|\.idea|\.cxx|\.externalNativeBuild|\.android|\.vscode|\.ssh|\.npm|\.cache|build|dist|dist-source|data|private|signing|secrets|credentials|logs|screenshots|test|tests|__tests__|fixtures|__snapshots__|coverage|test-results|playwright-report|verification|evidence|report|reports|deployment|deployments|production|artifacts|backups|captures|tmp|temp|\.temp)(\/|$)|\.(test|spec)\.|\.(jks|keystore|key|pem|pfx|p12|p7b|cer|crt|zip|apk|aab|apks|idsig|dex|class|hprof|sqlite(?:-.*)?|db(?:-.*)?|db3|log|tar|gz|tgz|7z|rar|dump|kdbx|mobileprovision|tsbuildinfo|tmp|bak|pid|sock|trace|har|pcap|pcapng)$|(^|\/)(local|keystore|signing)\.properties$|(^|\/)\.env(?!\.example$)/i
const files = Object.create(null)
async function add(relative) {
  if (excluded.test(relative)) return
  files[relative] = [new Uint8Array(await readFile(path.join(root, relative))), { mtime: new Date('2026-01-01T00:00:00Z') }]
}
async function walk(relative) {
  for (const entry of (await readdir(path.join(root, relative), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    const name = `${relative}/${entry.name}`
    if (excluded.test(name) || entry.isSymbolicLink()) continue
    if (entry.isDirectory()) await walk(name)
    else if (entry.isFile()) await add(name)
  }
}
for (const file of ['package.json','pnpm-lock.yaml','.npmrc','rspack.config.ts','tsconfig.json','.oxlintrc.json','.oxfmtrc.json','Dockerfile','compose.yaml','.env.example','.dockerignore','.gitignore','LICENSE','NOTICE.md','README.md','README.en.md','docs/ACCESS_CODES.md','docs/DEPLOYMENT.md','scripts/build.mjs','scripts/package-source.mjs']) await add(file)
for (const directory of ['src','server','LICENSES','android']) await walk(directory)
await mkdir(path.dirname(output), { recursive: true })
const archive = zipSync(files, { level: 6 })
await writeFile(output, archive)
console.log(`Corresponding source: ${Object.keys(files).length} files, ${archive.length} bytes`)
