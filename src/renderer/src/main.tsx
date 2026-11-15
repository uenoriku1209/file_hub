import './assets/app.css'
import { createRoot } from 'react-dom/client'
import App from './App'

// StrictMode は開発時に effect を2回実行し、ターミナルが二重に起動するため使用しない
createRoot(document.getElementById('root')!).render(<App />)
