/**
 * 渲染进程与主进程之间唯一的一层桥。
 * 不暴露 ipcRenderer 本身，只给三个白名单方法。
 */

import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('tankWorksDesktop', {
  isDesktop: true,
  getDisplayMode: (): Promise<string> => ipcRenderer.invoke('desktop:get-display-mode'),
  setDisplayMode: (mode: string): Promise<string> => ipcRenderer.invoke('desktop:set-display-mode', mode),
  quit: (): void => ipcRenderer.send('desktop:quit'),
})
