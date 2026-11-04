/**
 * 把 Electron 主进程和 preload 各打成一个文件，避免 package.json 里的 ESM/CJS 混用。
 * main 是 ESM（package type=module），preload 是 CJS（Electron preload 在 sandbox 下更稳）。
 */

import { build } from 'esbuild'
import { mkdirSync } from 'node:fs'

mkdirSync('desktop-dist', { recursive: true })

const shared = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  external: ['electron'],
  sourcemap: false,
  logLevel: 'info',
}

await build({
  ...shared,
  entryPoints: ['desktop/main.ts'],
  outfile: 'desktop-dist/main.cjs',
  format: 'cjs',
})

await build({
  ...shared,
  entryPoints: ['desktop/preload.ts'],
  outfile: 'desktop-dist/preload.cjs',
  format: 'cjs',
})
