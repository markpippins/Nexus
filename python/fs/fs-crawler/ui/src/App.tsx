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
    <Box sx={{ display: 'flex', minHeight: '100vh', width: '100%' }}>
      <Layout>
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            padding: { xs: 2, sm: 3 },
            width: { sm: `calc(100% - 280px)` },
            minHeight: '100vh',
            backgroundColor: 'background.default',
          }}
        >
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/libraries" element={<Libraries />} />
            <Route path="/scanning" element={<Scanning />} />
            <Route path="/statistics" element={<Statistics />} />
          </Routes>
        </Box>
      </Layout>
    </Box>
  )
}

export default App