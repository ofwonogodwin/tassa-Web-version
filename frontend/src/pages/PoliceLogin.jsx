import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
    Container,
    Card,
    CardContent,
    TextField,
    Button,
    Typography,
    Box,
    Alert,
} from '@mui/material'
import { loginPolice } from '../api/api'

function PoliceLogin({ onLogin }) {
    const navigate = useNavigate()
    const [formData, setFormData] = useState({
        username: '',
        password: '',
    })
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value,
        })
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')
        setLoading(true)

        try {
            const response = await loginPolice(formData)
            if (response.success && response.access_token) {
                onLogin({
                    role: response.role,
                    token: response.access_token,
                    rider: null,
                })
                navigate('/police')
            } else {
                setError(response.message || 'Police login failed')
            }
        } catch (err) {
            setError('Police login failed. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <Container maxWidth="sm" sx={{ mt: 8 }}>
            <Card>
                <CardContent>
                    <Typography variant="h4" component="h1" gutterBottom align="center">
                        Police Login
                    </Typography>

                    {error && (
                        <Alert severity="error" sx={{ mb: 2 }}>
                            {error}
                        </Alert>
                    )}

                    <Box component="form" onSubmit={handleSubmit}>
                        <TextField
                            fullWidth
                            label="Username"
                            name="username"
                            value={formData.username}
                            onChange={handleChange}
                            margin="normal"
                            required
                        />
                        <TextField
                            fullWidth
                            label="Password"
                            name="password"
                            type="password"
                            value={formData.password}
                            onChange={handleChange}
                            margin="normal"
                            required
                        />
                        <Button
                            type="submit"
                            fullWidth
                            variant="contained"
                            size="large"
                            sx={{ mt: 3, mb: 2 }}
                            disabled={loading}
                        >
                            {loading ? 'Logging in...' : 'Login as Police'}
                        </Button>
                    </Box>

                    <Box sx={{ textAlign: 'center', mt: 2 }}>
                        <Typography variant="body2">
                            Rider account? <Link to="/login">Rider Login</Link>
                        </Typography>
                    </Box>
                </CardContent>
            </Card>
        </Container>
    )
}

export default PoliceLogin
