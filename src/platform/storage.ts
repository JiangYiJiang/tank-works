/**
 * 存档往哪儿放 —— 平台适配层。
 *
 * 这是「打包成 .exe」唯一需要替换的地方：
 *  - 浏览器 / PWA：localStorage（现在）
 *  - Electron：主进程 fs 写 userData 目录
 *  - Tauri：plugin-fs 写 appDataDir
 *
 * 引擎和界面都不认识 localStorage，只认识下面这个接口。
 */

export interface SaveStore {
  read(key: string): string | null
  write(key: string, value: string): void
  remove(key: string): void
}

/** 浏览器实现。隐私模式下 localStorage 可能直接抛异常，所以全部包一层。 */
export function createWebStorage(): SaveStore {
  return {
    read(key) {
      try {
        return window.localStorage.getItem(key)
      } catch {
        return null
      }
    },
    write(key, value) {
      try {
        window.localStorage.setItem(key, value)
      } catch {
        // 存不下就算了，别让游戏崩掉
      }
    },
    remove(key) {
      try {
        window.localStorage.removeItem(key)
      } catch {
        // 同上
      }
    },
  }
}

/** 内存实现：测试、无头模拟、以及「不想落盘」的场合用 */
export function createMemoryStorage(initial: Record<string, string> = {}): SaveStore {
  const data = new Map(Object.entries(initial))
  return {
    read: (key) => data.get(key) ?? null,
    write: (key, value) => void data.set(key, value),
    remove: (key) => void data.delete(key),
  }
}
