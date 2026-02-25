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
    <AppBar position="static">
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
              >
                Dashboard
              </Button>
              <Button
                color="inherit"
                onClick={handleLogout}
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
              >
                Login
              </Button>
              <Button
                color="inherit"
                component={Link}
                to="/register"
              >
                Register
              </Button>
              <Button
                color="inherit"
                component={Link}
                to="/police"
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
