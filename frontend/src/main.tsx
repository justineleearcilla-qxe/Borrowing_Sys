import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
// After index.css: dark-mode overrides win on specificity, not load order,
// but keeping the order explicit makes the layering obvious.
import './theme.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
