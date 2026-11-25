import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
const require = createRequire(import.meta.url)
const cli = path.join(path.dirname(require.resolve('@rspack/cli/package.json')), 'bin', 'rspack.js')
const child = spawn(process.execPath, [cli, 'build', '-c', 'rspack.config.ts'], { stdio: 'inherit', env: { ...process.env, NODE_ENV: 'production' } })
child.on('error', error => { console.error(error.message); process.exitCode = 1 })
child.on('exit', code => { process.exitCode = code ?? 1 })
