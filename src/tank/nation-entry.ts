import './menu.css'
import './nation.css'
import { mountNationSelect } from './nation-main'

const root = document.getElementById('nation')
if (root) mountNationSelect(root)
