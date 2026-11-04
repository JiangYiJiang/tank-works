import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// base: './' —— 打包后所有资源用相对路径引用。
// 这一条是将来塞进 Electron / Tauri 用 file:// 直接打开 dist/ 里页面的前提。
export default defineConfig({
  base: './',
  // 入口：根 index.html 只做跳转到 game.html；另有五个页面。
  // tank.html 设计局、game.html 游戏外壳、research.html 研发局、manufacture.html 制造局、nations.html 选国家。
  // 多入口在 file:// 下也能直接开，因为两边都是相对路径引用。
  build: {
    outDir: 'dist',
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, 'index.html'),
        nations: resolve(import.meta.dirname, 'nations.html'),
        tank: resolve(import.meta.dirname, 'tank.html'),
        game: resolve(import.meta.dirname, 'game.html'),
        research: resolve(import.meta.dirname, 'research.html'),
        manufacture: resolve(import.meta.dirname, 'manufacture.html'),
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5273,
    strictPort: true,
    watch: {
      // 编辑器的原子写入会在项目里留下 `..name.<rand>.tmpdir` 临时目录，
      // 某些工具（含备份/同步软件）会锁住里面的文件，让 watcher 抛 EBUSY 把 dev server 整死。
      // 这些目录不参与热更新，直接忽略。
      ignored: ['**/.*.tmpdir/**', '**/*.tmp'],
    },
  },
})
