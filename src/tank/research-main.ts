import { mountResearch } from './ui/research'
import './ui/research.css'

const root = document.getElementById('app')
if (!root) throw new Error('#app 不存在')

mountResearch(root)
