import { Routes, Route, Navigate } from 'react-router-dom'
import { useState } from 'react'
import Login from './pages/Login'
import Register from './pages/Register'
import RiderDashboard from './pages/RiderDashboard'
import PoliceDashboard from './pages/PoliceDashboard'
import Navbar from './components/Navbar'

function App() {
  // Simple state to track logged in rider
  const [rider, setRider] = useState(null)

  // Handle login success
  const handleLogin = (riderData) => {
    setRider(riderData)
  }

  // Handle logout
  const handleLogout = () => {
    setRider(null)
  }

  return (
    <>
      <Navbar rider={rider} onLogout={handleLogout} />
      <Routes>
        <Route path="/" element={<Navigate to="/login" />} />
        <Route 
          path="/login" 
          element={<Login onLogin={handleLogin} />} 
        />
        <Route path="/register" element={<Register />} />
        <Route 
          path="/rider" 
          element={rider ? <RiderDashboard rider={rider} /> : <Navigate to="/login" />} 
        />
        <Route path="/police" element={<PoliceDashboard />} />
      </Routes>
    </>
  )
}

export default App
