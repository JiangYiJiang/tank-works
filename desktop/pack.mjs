/**
 * 打包 Windows 桌面版。
 *
 * electron-builder 默认从 GitHub 下 NSIS/winCodeSign，本机直连会被重置；
 * 这里统一走 npmmirror 镜像，并关掉自动查找代码签名证书（无证书时不要卡住）。
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'

const cli = 'node_modules/electron-builder/cli.js'
if (!existsSync(cli)) {
  console.error('找不到 electron-builder，请先 npm install。')
  process.exit(1)
}

const env = {
  ...process.env,
  ELECTRON_MIRROR: process.env.ELECTRON_MIRROR ?? 'https://npmmirror.com/mirrors/electron/',
  ELECTRON_BUILDER_BINARIES_MIRROR:
    process.env.ELECTRON_BUILDER_BINARIES_MIRROR ??
    'https://npmmirror.com/mirrors/electron-builder-binaries/',
  CSC_IDENTITY_AUTO_DISCOVERY: 'false',
}

console.log('electron-builder --win --x64')
const child = spawn(process.execPath, [cli, '--win', '--x64'], {
  stdio: 'inherit',
  env,
})

child.on('exit', (code) => {
  process.exit(code ?? 1)
})
