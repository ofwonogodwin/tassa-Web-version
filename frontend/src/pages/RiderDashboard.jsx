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
    Badge,
    IconButton,
    Tooltip,
    LinearProgress,
} from '@mui/material'
import LocationOnIcon from '@mui/icons-material/LocationOn'
import WarningIcon from '@mui/icons-material/Warning'
import GroupIcon from '@mui/icons-material/Group'
import LocalPoliceIcon from '@mui/icons-material/LocalPolice'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import HandshakeIcon from '@mui/icons-material/Handshake'
import { sendLocation, sendSOS, getRiderAlerts, getCommunityAlerts, respondToAlert, escalateAlert, resolveAlert } from '../api/api'
import MapView from '../components/MapView'
import AlertTable from '../components/AlertTable'

function RiderDashboard({ rider }) {
    const [tracking, setTracking] = useState(false)
    const [currentLocation, setCurrentLocation] = useState(null)
    const [alerts, setAlerts] = useState([])
    const [communityAlerts, setCommunityAlerts] = useState([])
    const [message, setMessage] = useState({ type: '', text: '' })
    const [sosLoading, setSosLoading] = useState(false)
    const [respondingTo, setRespondingTo] = useState(null)
    const intervalRef = useRef(null)
    const communityIntervalRef = useRef(null)

    // Fetch rider alerts on mount
    useEffect(() => {
        fetchAlerts()
        fetchCommunityAlerts()

        // Auto-refresh community alerts every 15 seconds (faster than police)
        communityIntervalRef.current = setInterval(fetchCommunityAlerts, 15000)

        return () => {
            if (communityIntervalRef.current) {
                clearInterval(communityIntervalRef.current)
            }
        }
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

    // Fetch community alerts (fellow riders in need)
    const fetchCommunityAlerts = async () => {
        try {
            const data = await getCommunityAlerts(rider.id)
            setCommunityAlerts(data)
        } catch (err) {
            console.error('Failed to fetch community alerts:', err)
        }
    }

    // Handle responding to a community alert
    const handleRespondToAlert = async (alertId) => {
        setRespondingTo(alertId)
        try {
            await respondToAlert(alertId, rider.id)
            setMessage({ type: 'success', text: 'You are now responding to this alert! Fellow rider has been notified.' })
            fetchCommunityAlerts()
        } catch (err) {
            console.error('Failed to respond to alert:', err)
            setMessage({ type: 'error', text: 'Failed to respond to alert' })
        } finally {
            setRespondingTo(null)
        }
    }

    // Handle escalating an alert to police
    const handleEscalateAlert = async (alertId) => {
        try {
            await escalateAlert(alertId, rider.id)
            setMessage({ type: 'warning', text: 'Alert escalated to police!' })
            fetchCommunityAlerts()
        } catch (err) {
            console.error('Failed to escalate alert:', err)
            setMessage({ type: 'error', text: 'Failed to escalate alert' })
        }
    }

    // Handle resolving an alert
    const handleResolveAlert = async (alertId) => {
        try {
            await resolveAlert(alertId, rider.id)
            setMessage({ type: 'success', text: 'Alert marked as resolved!' })
            fetchCommunityAlerts()
            fetchAlerts()
        } catch (err) {
            console.error('Failed to resolve alert:', err)
            setMessage({ type: 'error', text: 'Failed to resolve alert' })
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
            // Always get fresh location for SOS
            const position = await getCurrentPosition()
            setCurrentLocation(position)

            console.log('SOS Location:', position) // Debug log

            await sendSOS({
                rider_id: rider.id,
                latitude: position.latitude,
                longitude: position.longitude,
            })

            setMessage({
                type: 'success',
                text: `SOS sent! Location: ${position.latitude.toFixed(4)}, ${position.longitude.toFixed(4)}`
            })
            fetchAlerts() // Refresh alerts
        } catch (err) {
            console.error('SOS Error:', err)
            setMessage({
                type: 'error',
                text: 'Failed to get your location. Please enable location access and try again.'
            })
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
                                {communityAlerts.length > 0 && (
                                    <Badge badgeContent={communityAlerts.length} color="error">
                                        <Chip
                                            icon={<GroupIcon />}
                                            label="Community Alerts"
                                            color="warning"
                                        />
                                    </Badge>
                                )}
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

            {/* Community Alerts Section - Fellow Riders First! */}
            {communityAlerts.length > 0 && (
                <Card sx={{ mb: 3, border: 2, borderColor: 'warning.main', bgcolor: 'warning.light' }}>
                    <CardContent>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                            <GroupIcon color="warning" />
                            <Typography variant="h6" color="warning.dark">
                                Fellow Riders Need Help! ({communityAlerts.length})
                            </Typography>
                        </Box>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            As a community, we help each other first. Respond to let them know help is on the way!
                        </Typography>
                        
                        {communityAlerts.map((alert) => (
                            <Card key={alert.id} sx={{ mb: 2, bgcolor: 'background.paper' }}>
                                <CardContent>
                                    <Grid container spacing={2} alignItems="center">
                                        <Grid item xs={12} md={6}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                                <Chip 
                                                    label={alert.alert_type} 
                                                    color={alert.alert_type === 'SOS' ? 'error' : 'warning'} 
                                                    size="small" 
                                                />
                                                {alert.response_count > 0 && (
                                                    <Chip 
                                                        icon={<HandshakeIcon />}
                                                        label={`${alert.response_count} responding`} 
                                                        color="success" 
                                                        size="small" 
                                                    />
                                                )}
                                            </Box>
                                            <Typography variant="subtitle1" fontWeight="bold">
                                                {alert.rider_name} ({alert.plate_number})
                                            </Typography>
                                            <Typography variant="body2" color="text.secondary">
                                                {alert.location_name || `${alert.latitude.toFixed(4)}, ${alert.longitude.toFixed(4)}`}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                {new Date(alert.timestamp).toLocaleString()}
                                            </Typography>
                                            
                                            {/* Time until auto-escalation */}
                                            {alert.time_until_escalation > 0 && (
                                                <Box sx={{ mt: 1 }}>
                                                    <Typography variant="caption" color="text.secondary">
                                                        Auto-escalates to police in {Math.floor(alert.time_until_escalation / 60)}:{String(alert.time_until_escalation % 60).padStart(2, '0')}
                                                    </Typography>
                                                    <LinearProgress 
                                                        variant="determinate" 
                                                        value={(1 - alert.time_until_escalation / 180) * 100} 
                                                        color="warning"
                                                        sx={{ mt: 0.5 }}
                                                    />
                                                </Box>
                                            )}
                                        </Grid>
                                        <Grid item xs={12} md={6}>
                                            <Box sx={{ display: 'flex', gap: 1, justifyContent: { md: 'flex-end' }, flexWrap: 'wrap' }}>
                                                <Tooltip title="Click to let them know you're on your way!">
                                                    <Button
                                                        variant="contained"
                                                        color="success"
                                                        size="small"
                                                        startIcon={<HandshakeIcon />}
                                                        onClick={() => handleRespondToAlert(alert.id)}
                                                        disabled={respondingTo === alert.id}
                                                    >
                                                        {respondingTo === alert.id ? 'Responding...' : 'I\'m Responding'}
                                                    </Button>
                                                </Tooltip>
                                                <Tooltip title="Escalate to police immediately">
                                                    <Button
                                                        variant="outlined"
                                                        color="error"
                                                        size="small"
                                                        startIcon={<LocalPoliceIcon />}
                                                        onClick={() => handleEscalateAlert(alert.id)}
                                                    >
                                                        Escalate to Police
                                                    </Button>
                                                </Tooltip>
                                                {alert.response_count > 0 && (
                                                    <Tooltip title="Mark as resolved after helping">
                                                        <Button
                                                            variant="outlined"
                                                            color="success"
                                                            size="small"
                                                            startIcon={<CheckCircleIcon />}
                                                            onClick={() => handleResolveAlert(alert.id)}
                                                        >
                                                            Resolved
                                                        </Button>
                                                    </Tooltip>
                                                )}
                                            </Box>
                                        </Grid>
                                    </Grid>
                                </CardContent>
                            </Card>
                        ))}
                    </CardContent>
                </Card>
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
                                    markers={[
                                        // Your location
                                        ...(currentLocation ? [{
                                            lat: currentLocation.latitude,
                                            lng: currentLocation.longitude,
                                            popup: 'Your current location',
                                            type: 'YOU'
                                        }] : []),
                                        // Community alerts on map
                                        ...communityAlerts.map(alert => ({
                                            lat: alert.latitude,
                                            lng: alert.longitude,
                                            popup: `${alert.alert_type} - ${alert.rider_name}`,
                                            type: alert.alert_type
                                        }))
                                    ]}
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
                                Press SOS in case of emergency. Fellow riders will be notified first to help you.
                                If no one responds within 3 minutes, police will be automatically notified.
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
