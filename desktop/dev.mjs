/**
 * 开发时一条命令：编译桌面壳 → 起 Vite（若没起）→ 开 Electron 窗口。
 * 打包版不走这里，直接 npm run desktop:pack。
 */

import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const electronPath = require('electron')
const devUrl = process.env.TW_DEV_URL ?? 'http://127.0.0.1:5273/'

const built = spawnSync(process.execPath, ['desktop/build.mjs'], { stdio: 'inherit' })
if (built.status !== 0) process.exit(built.status ?? 1)

async function reachable(): Promise<boolean> {
  try {
    const res = await fetch(devUrl, { signal: AbortSignal.timeout(800) })
    return res.ok
  } catch {
    return false
  }
}

let vite: ReturnType<typeof spawn> | null = null
if (!(await reachable())) {
  console.log('启动 Vite dev server…')
  vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: 'inherit' })
  for (let i = 0; i < 40; i++) {
    await new Promise((resolve) => setTimeout(resolve, 250))
    if (await reachable()) break
  }
}

const electronEnv = { ...process.env, TW_DEV_URL: devUrl }
delete electronEnv.ELECTRON_RUN_AS_NODE

const desktop = spawn(electronPath, ['.'], {
  stdio: 'inherit',
  env: electronEnv,
})

function stop(): void {
  if (vite && !vite.killed) vite.kill()
}

desktop.on('exit', (code) => {
  stop()
  process.exit(code ?? 0)
})

process.on('SIGINT', () => {
  desktop.kill()
  stop()
})
