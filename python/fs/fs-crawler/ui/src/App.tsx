import React from 'react'
import { Routes, Route } from 'react-router-dom'
import { Box } from '@mui/material'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Libraries from './pages/Libraries'
import Scanning from './pages/Scanning'
import Statistics from './pages/Statistics'

function App() {
  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/libraries" element={<Libraries />} />
          <Route path="/scanning" element={<Scanning />} />
          <Route path="/statistics" element={<Statistics />} />
        </Routes>
      </Layout>
    </Box>
  )
}

export default App