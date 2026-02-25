import { useState, useEffect, useRef } from 'react'
import {
    Container,
    Grid,
    Card,
    CardContent,
    Button,
    Typography,
    Box,
    Alert,
    Chip,
} from '@mui/material'
import LocationOnIcon from '@mui/icons-material/LocationOn'
import WarningIcon from '@mui/icons-material/Warning'
import { sendLocation, sendSOS, getRiderAlerts } from '../api/api'
import MapView from '../components/MapView'
import AlertTable from '../components/AlertTable'

function RiderDashboard({ rider }) {
    const [tracking, setTracking] = useState(false)
    const [currentLocation, setCurrentLocation] = useState(null)
    const [alerts, setAlerts] = useState([])
    const [message, setMessage] = useState({ type: '', text: '' })
    const [sosLoading, setSosLoading] = useState(false)
    const intervalRef = useRef(null)

    // Fetch rider alerts on mount
    useEffect(() => {
        fetchAlerts()
    }, [rider.id])

    // Cleanup interval on unmount
    useEffect(() => {
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current)
            }
        }
    }, [])

    // Fetch rider's alerts
    const fetchAlerts = async () => {
        try {
            const data = await getRiderAlerts(rider.id)
            setAlerts(data)
        } catch (err) {
            console.error('Failed to fetch alerts:', err)
        }
    }

    // Get current position using browser geolocation
    const getCurrentPosition = () => {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Geolocation not supported'))
                return
            }
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    resolve({
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                    })
                },
                (error) => {
                    reject(error)
                },
                { enableHighAccuracy: true }
            )
        })
    }

    // Send location to server
    const updateLocation = async () => {
        try {
            const position = await getCurrentPosition()
            setCurrentLocation(position)

            await sendLocation({
                rider_id: rider.id,
                latitude: position.latitude,
                longitude: position.longitude,
            })
        } catch (err) {
            console.error('Location update failed:', err)
            setMessage({ type: 'error', text: 'Failed to get location' })
        }
    }

    // Start tracking
    const handleStartTracking = async () => {
        setMessage({ type: '', text: '' })

        try {
            // Get initial position
            await updateLocation()
            setTracking(true)
            setMessage({ type: 'success', text: 'Tracking started' })

            // Send location every 30 seconds
            intervalRef.current = setInterval(updateLocation, 30000)
        } catch (err) {
            setMessage({ type: 'error', text: 'Failed to start tracking. Please enable location.' })
        }
    }

    // Stop tracking
    const handleStopTracking = () => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current)
            intervalRef.current = null
        }
        setTracking(false)
        setMessage({ type: 'info', text: 'Tracking stopped' })
    }

    // Send SOS alert
    const handleSOS = async () => {
        setSosLoading(true)
        setMessage({ type: '', text: '' })

        try {
            let position = currentLocation

            // Get current position if not available
            if (!position) {
                position = await getCurrentPosition()
                setCurrentLocation(position)
            }

            await sendSOS({
                rider_id: rider.id,
                latitude: position.latitude,
                longitude: position.longitude,
            })

            setMessage({ type: 'success', text: 'SOS alert sent successfully!' })
            fetchAlerts() // Refresh alerts
        } catch (err) {
            setMessage({ type: 'error', text: 'Failed to send SOS. Please try again.' })
        } finally {
            setSosLoading(false)
        }
    }

    return (
        <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
            {/* Rider Info */}
            <Card sx={{ mb: 3 }}>
                <CardContent>
                    <Grid container alignItems="center" spacing={2}>
                        <Grid item xs={12} md={6}>
                            <Typography variant="h5">
                                Welcome, {rider.name}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                Plate: {rider.plate_number} | Area: {rider.area}
                            </Typography>
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <Box sx={{ display: 'flex', gap: 1, justifyContent: { md: 'flex-end' } }}>
                                <Chip
                                    icon={<LocationOnIcon />}
                                    label={tracking ? 'Tracking Active' : 'Tracking Off'}
                                    color={tracking ? 'success' : 'default'}
                                />
                            </Box>
                        </Grid>
                    </Grid>
                </CardContent>
            </Card>

            {/* Messages */}
            {message.text && (
                <Alert severity={message.type} sx={{ mb: 3 }} onClose={() => setMessage({ type: '', text: '' })}>
                    {message.text}
                </Alert>
            )}

            {/* Controls */}
            <Grid container spacing={3}>
                <Grid item xs={12} md={8}>
                    {/* Map */}
                    <Card sx={{ mb: 3 }}>
                        <CardContent>
                            <Typography variant="h6" gutterBottom>
                                Your Location
                            </Typography>
                            <Box sx={{ height: 400 }}>
                                <MapView
                                    center={currentLocation ? [currentLocation.latitude, currentLocation.longitude] : null}
                                    markers={currentLocation ? [{
                                        lat: currentLocation.latitude,
                                        lng: currentLocation.longitude,
                                        popup: 'Your current location'
                                    }] : []}
                                />
                            </Box>
                        </CardContent>
                    </Card>

                    {/* Recent Alerts */}
                    <Card>
                        <CardContent>
                            <Typography variant="h6" gutterBottom>
                                Your Alerts
                            </Typography>
                            <AlertTable alerts={alerts} />
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12} md={4}>
                    {/* Action Buttons */}
                    <Card sx={{ mb: 3 }}>
                        <CardContent>
                            <Typography variant="h6" gutterBottom>
                                Tracking Controls
                            </Typography>
                            {!tracking ? (
                                <Button
                                    fullWidth
                                    variant="contained"
                                    color="primary"
                                    size="large"
                                    startIcon={<LocationOnIcon />}
                                    onClick={handleStartTracking}
                                    sx={{ mb: 2 }}
                                >
                                    Start Tracking
                                </Button>
                            ) : (
                                <Button
                                    fullWidth
                                    variant="outlined"
                                    color="primary"
                                    size="large"
                                    onClick={handleStopTracking}
                                    sx={{ mb: 2 }}
                                >
                                    Stop Tracking
                                </Button>
                            )}

                            <Button
                                fullWidth
                                variant="contained"
                                color="error"
                                size="large"
                                startIcon={<WarningIcon />}
                                onClick={handleSOS}
                                disabled={sosLoading}
                            >
                                {sosLoading ? 'Sending SOS...' : 'Send SOS'}
                            </Button>

                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
                                Press SOS in case of emergency. Your location will be sent to authorities.
                            </Typography>
                        </CardContent>
                    </Card>

                    {/* Current Location Info */}
                    {currentLocation && (
                        <Card>
                            <CardContent>
                                <Typography variant="h6" gutterBottom>
                                    Current Coordinates
                                </Typography>
                                <Typography variant="body2">
                                    Lat: {currentLocation.latitude.toFixed(6)}
                                </Typography>
                                <Typography variant="body2">
                                    Lng: {currentLocation.longitude.toFixed(6)}
                                </Typography>
                            </CardContent>
                        </Card>
                    )}
                </Grid>
            </Grid>
        </Container>
    )
}

export default RiderDashboard
