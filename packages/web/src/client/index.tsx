import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { NavBar } from './components/NavBar'
import { TestRunHistory } from './pages/TestRunHistory'
import { TestRunDetail } from './pages/TestRunDetail'
import { PerTestAnalytics } from './pages/PerTestAnalytics'
import { ScilHistory } from './pages/ScilHistory'
import { ScilDetail } from './pages/ScilDetail'
import { AcilHistory } from './pages/AcilHistory'
import { AcilDetail } from './pages/AcilDetail'
import './index.css'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Root element not found')

createRoot(rootEl).render(
  <React.StrictMode>
    <BrowserRouter>
      <div className="min-h-screen bg-[#131413]">
        <NavBar />
        <Routes>
          <Route path="/" element={<TestRunHistory />} />
          <Route path="/runs/:runId" element={<TestRunDetail />} />
          <Route path="/scil" element={<ScilHistory />} />
          <Route path="/scil/:runId" element={<ScilDetail />} />
          <Route path="/acil" element={<AcilHistory />} />
          <Route path="/acil/:runId" element={<AcilDetail />} />
          <Route path="/analytics" element={<PerTestAnalytics />} />
        </Routes>
      </div>
    </BrowserRouter>
  </React.StrictMode>
)
