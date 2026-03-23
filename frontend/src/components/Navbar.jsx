import { Link, useNavigate } from 'react-router-dom'
import {
    AppBar,
    Toolbar,
    Typography,
    Button,
    Box,
} from '@mui/material'

function Navbar({ rider, onLogout }) {
    const navigate = useNavigate()

    // Handle logout
    const handleLogout = () => {
        onLogout()
        navigate('/login')
    }

    return (
        <AppBar
            position="static"
            sx={{
                backgroundColor: '#1E4E8C',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
            }}
        >
            <Toolbar>
                <Typography
                    variant="h6"
                    component={Link}
                    to="/"
                    sx={{ flexGrow: 1, textDecoration: 'none', color: 'inherit' }}
                >
                    TAASA
                </Typography>

                <Box sx={{ display: 'flex', gap: 1 }}>
                    {rider ? (
                        <>
                            <Button
                                color="inherit"
                                component={Link}
                                to="/rider"
                                sx={{ '&:hover': { backgroundColor: 'rgba(255,255,255,0.12)' } }}
                            >
                                Dashboard
                            </Button>
                            <Button
                                color="inherit"
                                onClick={handleLogout}
                                sx={{ '&:hover': { backgroundColor: 'rgba(255,255,255,0.12)' } }}
                            >
                                Logout
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button
                                color="inherit"
                                component={Link}
                                to="/login"
                                sx={{ '&:hover': { backgroundColor: 'rgba(255,255,255,0.12)' } }}
                            >
                                Login
                            </Button>
                            <Button
                                color="inherit"
                                component={Link}
                                to="/register"
                                sx={{ '&:hover': { backgroundColor: 'rgba(255,255,255,0.12)' } }}
                            >
                                Register
                            </Button>
                            <Button
                                color="inherit"
                                component={Link}
                                to="/police"
                                sx={{ '&:hover': { backgroundColor: 'rgba(255,255,255,0.12)' } }}
                            >
                                Police
                            </Button>
                        </>
                    )}
                </Box>
            </Toolbar>
        </AppBar>
    )
}

export default Navbar
