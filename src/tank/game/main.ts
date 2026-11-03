/**
 * 游戏外壳入口。
 * 存档走 `SaveStore` 抽象（`src/platform/storage.ts`），将来换 Electron 只要换这一行。
 */
import './style.css'
import { mountGame } from './shell'
import { createWebStorage } from '../../platform/storage'

const root = document.getElementById('app')
if (root) mountGame(root, { storage: createWebStorage() })
