import { Routes, Route, Navigate } from 'react-router-dom'
import { useState } from 'react'
import Login from './pages/Login'
import Register from './pages/Register'
import RiderDashboard from './pages/RiderDashboard'
import PoliceDashboard from './pages/PoliceDashboard'
import PoliceLogin from './pages/PoliceLogin'
import Navbar from './components/Navbar'

function App() {
    const [auth, setAuth] = useState(() => {
        const token = localStorage.getItem('taasa_token')
        const role = localStorage.getItem('taasa_role')
        const riderRaw = localStorage.getItem('taasa_rider')
        const rider = riderRaw ? JSON.parse(riderRaw) : null
        return {
            token: token || null,
            role: role || null,
            rider,
        }
    })

    // Handle login success
    const handleLogin = ({ token, role, rider }) => {
        localStorage.setItem('taasa_token', token)
        localStorage.setItem('taasa_role', role)
        if (rider) {
            localStorage.setItem('taasa_rider', JSON.stringify(rider))
        } else {
            localStorage.removeItem('taasa_rider')
        }
        setAuth({ token, role, rider: rider || null })
    }

    // Handle logout
    const handleLogout = () => {
        localStorage.removeItem('taasa_token')
        localStorage.removeItem('taasa_role')
        localStorage.removeItem('taasa_rider')
        setAuth({ token: null, role: null, rider: null })
    }

    return (
        <>
            <Navbar auth={auth} onLogout={handleLogout} />
            <Routes>
                <Route path="/" element={<Navigate to="/login" />} />
                <Route
                    path="/login"
                    element={<Login onLogin={handleLogin} />}
                />
                <Route path="/police-login" element={<PoliceLogin onLogin={handleLogin} />} />
                <Route path="/register" element={<Register />} />
                <Route
                    path="/rider"
                    element={auth.role === 'RIDER' && auth.rider ? <RiderDashboard rider={auth.rider} /> : <Navigate to="/login" />}
                />
                <Route
                    path="/police"
                    element={auth.role === 'POLICE' ? <PoliceDashboard /> : <Navigate to="/police-login" />}
                />
            </Routes>
        </>
    )
}

export default App
