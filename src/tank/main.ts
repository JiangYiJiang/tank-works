import './ui/style.css'
import { mountBureau } from './ui/bureau'

const root = document.querySelector<HTMLElement>('#app')
if (!root) throw new Error('找不到 #app')

mountBureau(root)
