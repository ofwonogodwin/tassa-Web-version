import { useState, useEffect, useRef, useMemo } from 'react'
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
import AccessTimeIcon from '@mui/icons-material/AccessTime'
import { sendLocation, sendSOS, getRiderAlerts, getCommunityAlerts, respondToAlert, escalateAlert, resolveAlert, getPlaceName } from '../api/api'
import MapView from '../components/MapView'
import AlertTable from '../components/AlertTable'

function RiderDashboard({ rider }) {
    const [tracking, setTracking] = useState(false)
    const [currentLocation, setCurrentLocation] = useState(null)
    const [currentPlaceName, setCurrentPlaceName] = useState('')
    const [alerts, setAlerts] = useState([])
    const [communityAlerts, setCommunityAlerts] = useState([])
    const [message, setMessage] = useState({ type: '', text: '' })
    const [sosLoading, setSosLoading] = useState(false)
    const [respondingTo, setRespondingTo] = useState(null)
    const [locationPermission, setLocationPermission] = useState('unknown')
    const [dismissedActiveAlertIds, setDismissedActiveAlertIds] = useState([])
    const [removingActiveAlertIds, setRemovingActiveAlertIds] = useState([])
    const intervalRef = useRef(null)
    const communityIntervalRef = useRef(null)
    const seenCommunityAlertIdsRef = useRef(new Set())
    const hasLoadedCommunityAlertsRef = useRef(false)

    const activeAlerts = useMemo(() => {
        return alerts
            .filter((a) => a.status !== 'RESOLVED' && !dismissedActiveAlertIds.includes(a.id))
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, 5)
    }, [alerts, dismissedActiveAlertIds])

    const getAlertSummary = (alert) => {
        if (alert.status === 'RIDER_PENDING') {
            if (alert.response_count > 0) {
                return `${alert.response_count} rider${alert.response_count > 1 ? 's' : ''} responding`
            }
            if (alert.time_until_escalation > 0) {
                const mins = Math.floor(alert.time_until_escalation / 60)
                const secs = String(alert.time_until_escalation % 60).padStart(2, '0')
                return `Waiting for riders • Escalates in ${mins}:${secs}`
            }
            return 'Waiting for nearby riders'
        }

        if (alert.status === 'ESCALATED') {
            return 'Escalated to police'
        }

        return 'Active alert'
    }

    const getAlertAccentColor = (alert) => {
        if (alert.status === 'ESCALATED') return 'error.main'
        return alert.alert_type === 'SOS' ? 'warning.main' : 'info.main'
    }

    const sharedStatusCardSx = {
        mb: 3,
        borderRadius: 2,
        border: 1,
        borderColor: 'divider',
        boxShadow: '0 4px 14px rgba(15, 23, 42, 0.08)'
    }

    const sharedStatusListSx = {
        maxHeight: 330,
        overflowY: 'auto',
        pr: 0.5
    }

    const sharedAlertRowCardSx = {
        mb: 1,
        position: 'relative',
        borderRadius: 2,
        border: 1,
        borderColor: 'divider',
        boxShadow: '0 2px 10px rgba(15, 23, 42, 0.06)'
    }

    const sharedAlertRowContentSx = {
        py: 1.25,
        px: 1.5,
        '&:last-child': { pb: 1.25 }
    }

    const sharedCompactChipSx = {
        height: 22,
        '& .MuiChip-label': { px: 1, fontSize: '0.72rem' }
    }

    const sharedActionButtonSx = {
        minWidth: 'auto',
        px: 1.1,
        py: 0.2,
        fontSize: '0.72rem'
    }

    // Check location permission on mount
    useEffect(() => {
        const checkLocationPermission = async () => {
            try {
                // Check if Permissions API is available
                if (navigator.permissions) {
                    const result = await navigator.permissions.query({ name: 'geolocation' })
                    setLocationPermission(result.state)
                    console.log('Location permission status:', result.state)

                    // Listen for permission changes
                    result.onchange = () => {
                        setLocationPermission(result.state)
                        console.log('Location permission changed to:', result.state)
                    }
                }
            } catch (err) {
                console.log('Could not check location permission:', err)
            }
        }

        checkLocationPermission()
    }, [])

    useEffect(() => {
        if (typeof window === 'undefined' || !('Notification' in window)) return
        if (Notification.permission === 'default') {
            Notification.requestPermission().catch(() => {})
        }
    }, [])

    // Fetch rider alerts on mount
    useEffect(() => {
        fetchAlerts()
        fetchCommunityAlerts()

        // Auto-refresh community alerts every 5 seconds for near-real-time rider notifications
        communityIntervalRef.current = setInterval(() => {
            fetchCommunityAlerts()
            fetchAlerts() // Also refresh own alerts to see status updates
        }, 5000)

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
            const previousIds = seenCommunityAlertIdsRef.current
            const newAlerts = hasLoadedCommunityAlertsRef.current
                ? data.filter((alert) => !previousIds.has(alert.id))
                : []

            setCommunityAlerts(data)

            if (newAlerts.length > 0) {
                const sosCount = newAlerts.filter((alert) => alert.alert_type === 'SOS').length
                const newCount = newAlerts.length
                const summary = sosCount > 0
                    ? `New rider emergency alert${sosCount > 1 ? 's' : ''} received (${sosCount} SOS).`
                    : `New community alert${newCount > 1 ? 's' : ''} received.`

                setMessage({ type: 'warning', text: summary })

                if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
                    new Notification('TAASA Rider Alert', {
                        body: summary,
                    })
                }
            }

            seenCommunityAlertIdsRef.current = new Set(data.map((alert) => alert.id))
            hasLoadedCommunityAlertsRef.current = true
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
            const errorMsg = err.response?.data?.detail || 'Failed to respond to alert. The alert may have been resolved or escalated.'
            setMessage({ type: 'error', text: errorMsg })
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
            const errorMsg = err.response?.data?.detail || 'Failed to escalate alert. The alert may have already been escalated or resolved.'
            setMessage({ type: 'error', text: errorMsg })
        }
    }

    // Handle resolving an alert
    const handleResolveAlert = async (alertId, options = {}) => {
        const { silent = false } = options
        try {
            await resolveAlert(alertId, rider.id)
            if (!silent) {
                setMessage({ type: 'success', text: 'Alert marked as resolved!' })
            }
            fetchCommunityAlerts()
            fetchAlerts()
            return true
        } catch (err) {
            console.error('Failed to resolve alert:', err)
            const errorMsg = err.response?.data?.detail || 'Failed to resolve alert. The alert may have already been resolved.'
            setMessage({ type: 'error', text: errorMsg })
            return false
        }
    }

    const handleDismissActiveAlert = async (alertId) => {
        const ok = await handleResolveAlert(alertId, { silent: true })
        if (!ok) return

        setRemovingActiveAlertIds((prev) => [...new Set([...prev, alertId])])
        setMessage({ type: 'success', text: 'Alert dismissed.' })

        setTimeout(() => {
            setDismissedActiveAlertIds((prev) => [...new Set([...prev, alertId])])
            setRemovingActiveAlertIds((prev) => prev.filter((id) => id !== alertId))
        }, 220)
    }

    // Get current position using browser geolocation
    const getCurrentPosition = () => {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Geolocation not supported'))
                return
            }

            // Check if we're on HTTPS (required for geolocation on deployed sites)
            const isSecure = window.location.protocol === 'https:' || window.location.hostname === 'localhost'
            if (!isSecure) {
                console.warn('Geolocation requires HTTPS on deployed sites')
            }

            // Try to get position with multiple attempts
            let attempts = 0
            const maxAttempts = 3

            const tryGetPosition = (highAccuracy) => {
                attempts++
                console.log(`Geolocation attempt ${attempts}/${maxAttempts}, highAccuracy: ${highAccuracy}`)

                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        console.log('Geolocation success:', position.coords)
                        resolve({
                            latitude: position.coords.latitude,
                            longitude: position.coords.longitude,
                        })
                    },
                    (error) => {
                        console.error('Geolocation error:', error.code, error.message)

                        // If permission denied, don't retry
                        if (error.code === 1) {
                            reject(error)
                            return
                        }

                        // If timeout or unavailable, retry with different settings
                        if (attempts < maxAttempts) {
                            if (highAccuracy) {
                                console.log('Retrying with low accuracy...')
                                setTimeout(() => tryGetPosition(false), 500)
                            } else {
                                console.log('Retrying again...')
                                setTimeout(() => tryGetPosition(false), 1000)
                            }
                        } else {
                            reject(error)
                        }
                    },
                    {
                        enableHighAccuracy: highAccuracy,
                        timeout: highAccuracy ? 15000 : 30000,
                        maximumAge: 120000  // Accept cached position up to 2 minutes old
                    }
                )
            }

            // Start with high accuracy
            tryGetPosition(true)
        })
    }

    // Fetch place name for coordinates
    const fetchPlaceName = async (lat, lng) => {
        try {
            console.log('Fetching place name for:', lat, lng)
            const result = await getPlaceName(lat, lng)
            console.log('Place name result:', result)
            if (result && result.place_name) {
                setCurrentPlaceName(result.place_name)
            }
        } catch (err) {
            console.error('Failed to get place name:', err)
            setCurrentPlaceName('')
        }
    }

    // Send location to server
    const updateLocation = async () => {
        try {
            const position = await getCurrentPosition()
            setCurrentLocation(position)

            // Fetch place name in background
            fetchPlaceName(position.latitude, position.longitude)

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

            // Fetch place name and wait for it
            let placeName = ''
            try {
                const geoResult = await getPlaceName(position.latitude, position.longitude)
                placeName = geoResult.place_name || ''
                setCurrentPlaceName(placeName)
            } catch (geoErr) {
                console.error('Geocoding failed:', geoErr)
            }

            console.log('SOS Location:', position, 'Place:', placeName) // Debug log

            await sendSOS({
                rider_id: rider.id,
                latitude: position.latitude,
                longitude: position.longitude,
            })

            const locationText = placeName
                ? `${position.latitude.toFixed(4)}, ${position.longitude.toFixed(4)} (${placeName})`
                : `${position.latitude.toFixed(4)}, ${position.longitude.toFixed(4)}`

            setMessage({
                type: 'success',
                text: `SOS sent! Location: ${locationText}`
            })
            fetchAlerts() // Refresh alerts
        } catch (err) {
            console.error('SOS Error:', err)
            // More specific error messages
            let errorMsg = 'Failed to get your location. '
            if (err.code === 1) {
                errorMsg += 'Location permission denied. Try these steps:\n'
                errorMsg += '1. Click the lock/info icon in your browser address bar\n'
                errorMsg += '2. Find "Location" and change it to "Allow"\n'
                errorMsg += '3. Refresh the page and try again'
            } else if (err.code === 2) {
                errorMsg += 'Location unavailable. Please check your device GPS/location settings are turned on.'
            } else if (err.code === 3) {
                errorMsg += 'Location request timed out. Please try again.'
            } else {
                errorMsg += 'Please enable location access and try again.'
            }
            setMessage({
                type: 'error',
                text: errorMsg
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
                <Card sx={{ ...sharedStatusCardSx, borderColor: 'warning.main', bgcolor: 'warning.light' }}>
                    <CardContent>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                            <GroupIcon color="warning" />
                            <Typography variant="h6" color="warning.dark">
                                Fellow Riders Need Help! ({communityAlerts.length})
                            </Typography>
                        </Box>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, fontSize: '0.82rem' }}>
                            As a community, we help each other first. Respond to let them know help is on the way!
                        </Typography>

                        <Box sx={sharedStatusListSx}>
                            {communityAlerts.map((alert) => (
                                <Card key={alert.id} sx={sharedAlertRowCardSx}>
                                    <Box
                                        sx={{
                                            position: 'absolute',
                                            left: 0,
                                            top: 0,
                                            bottom: 0,
                                            width: 4,
                                            bgcolor: alert.alert_type === 'SOS' ? 'warning.main' : 'info.main'
                                        }}
                                    />
                                    <CardContent sx={sharedAlertRowContentSx}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                                                <Chip
                                                    label={alert.alert_type}
                                                    color={alert.alert_type === 'SOS' ? 'error' : 'warning'}
                                                    size="small"
                                                    sx={sharedCompactChipSx}
                                                />
                                                {alert.response_count > 0 && (
                                                    <Chip
                                                        icon={<HandshakeIcon sx={{ fontSize: 14 }} />}
                                                        label={`${alert.response_count} responding`}
                                                        color="success"
                                                        size="small"
                                                        sx={sharedCompactChipSx}
                                                    />
                                                )}
                                            </Box>

                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                    <AccessTimeIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                                                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.72rem' }}>
                                                        {new Date(alert.timestamp).toLocaleString()}
                                                    </Typography>
                                                </Box>

                                                <Tooltip title="Click to let them know you're on your way!">
                                                    <Button
                                                        variant="contained"
                                                        color="success"
                                                        size="small"
                                                        startIcon={<HandshakeIcon sx={{ fontSize: 14 }} />}
                                                        onClick={() => handleRespondToAlert(alert.id)}
                                                        disabled={respondingTo === alert.id}
                                                        sx={sharedActionButtonSx}
                                                    >
                                                        {respondingTo === alert.id ? 'Responding...' : 'I\'M RESPONDING'}
                                                    </Button>
                                                </Tooltip>
                                                <Tooltip title="Escalate to police immediately">
                                                    <Button
                                                        variant="outlined"
                                                        color="error"
                                                        size="small"
                                                        startIcon={<LocalPoliceIcon sx={{ fontSize: 14 }} />}
                                                        onClick={() => handleEscalateAlert(alert.id)}
                                                        sx={sharedActionButtonSx}
                                                    >
                                                        ESCALATE TO POLICE
                                                    </Button>
                                                </Tooltip>
                                            </Box>
                                        </Box>

                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 1 }}>
                                            <GroupIcon sx={{ fontSize: 15, color: 'text.secondary' }} />
                                            <Typography variant="body2" sx={{ fontSize: '0.82rem', lineHeight: 1.35 }}>
                                                {alert.rider_name} ({alert.plate_number})
                                            </Typography>
                                        </Box>

                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.6 }}>
                                            <LocationOnIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                                            <Typography variant="body2" sx={{ fontSize: '0.82rem', lineHeight: 1.35 }}>
                                                {alert.location_name || `${alert.latitude.toFixed(4)}, ${alert.longitude.toFixed(4)}`}
                                            </Typography>
                                        </Box>

                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.6 }}>
                                            <WarningIcon sx={{ fontSize: 15, color: 'warning.main' }} />
                                            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.78rem' }}>
                                                {alert.response_count > 0
                                                    ? `${alert.response_count} rider${alert.response_count > 1 ? 's' : ''} responding`
                                                    : 'Waiting for nearby riders'}
                                            </Typography>
                                        </Box>

                                        {/* Time until auto-escalation */}
                                        {alert.time_until_escalation > 0 && (
                                            <Box sx={{ mt: 0.8 }}>
                                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.72rem' }}>
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

                                        {alert.response_count > 0 && (
                                            <Box sx={{ mt: 1, display: 'flex', justifyContent: 'flex-end' }}>
                                                <Tooltip title="Mark as resolved after helping">
                                                    <Button
                                                        variant="outlined"
                                                        color="success"
                                                        size="small"
                                                        startIcon={<CheckCircleIcon sx={{ fontSize: 14 }} />}
                                                        onClick={() => handleResolveAlert(alert.id)}
                                                        sx={sharedActionButtonSx}
                                                    >
                                                        RESOLVED
                                                    </Button>
                                                </Tooltip>
                                            </Box>
                                        )}
                                    </CardContent>
                                </Card>
                            ))}
                        </Box>
                    </CardContent>
                </Card>
            )}

            {/* Your Active Alert Status - Compact UI */}
            {activeAlerts.length > 0 && (
                <Card sx={sharedStatusCardSx}>
                    <CardContent>
                        <Typography variant="h6" gutterBottom color="info.main" sx={{ mb: 1.5 }}>
                            Your Active Alert Status
                        </Typography>
                        <Box sx={sharedStatusListSx}>
                            {activeAlerts.map((alert) => (
                                <Card
                                    key={alert.id}
                                    sx={{
                                        ...sharedAlertRowCardSx,
                                        transition: 'opacity 220ms ease, transform 220ms ease',
                                        opacity: removingActiveAlertIds.includes(alert.id) ? 0 : 1,
                                        transform: removingActiveAlertIds.includes(alert.id) ? 'translateY(-4px)' : 'translateY(0)'
                                    }}
                                >
                                    <Box
                                        sx={{
                                            position: 'absolute',
                                            left: 0,
                                            top: 0,
                                            bottom: 0,
                                            width: 4,
                                            bgcolor: getAlertAccentColor(alert)
                                        }}
                                    />
                                    <CardContent sx={sharedAlertRowContentSx}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                                {alert.status === 'ESCALATED' ? (
                                                    <LocalPoliceIcon sx={{ fontSize: 18, color: 'error.main' }} />
                                                ) : (
                                                    <WarningIcon sx={{ fontSize: 18, color: 'warning.main' }} />
                                                )}
                                                <Chip
                                                    label={alert.alert_type}
                                                    color={alert.alert_type === 'SOS' ? 'error' : 'warning'}
                                                    size="small"
                                                    sx={sharedCompactChipSx}
                                                />
                                            </Box>

                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                    <AccessTimeIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                                                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.72rem' }}>
                                                        {new Date(alert.timestamp).toLocaleString()}
                                                    </Typography>
                                                </Box>
                                                <Button
                                                    size="small"
                                                    variant={alert.status === 'ESCALATED' ? 'outlined' : 'contained'}
                                                    color={alert.status === 'ESCALATED' ? 'inherit' : 'success'}
                                                    startIcon={<CheckCircleIcon sx={{ fontSize: 14 }} />}
                                                    sx={sharedActionButtonSx}
                                                    onClick={() => handleDismissActiveAlert(alert.id)}
                                                >
                                                    {alert.status === 'ESCALATED' ? 'Dismiss' : 'Resolved'}
                                                </Button>
                                            </Box>
                                        </Box>

                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 1 }}>
                                            <LocationOnIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                                            <Typography variant="body2" sx={{ fontSize: '0.82rem', lineHeight: 1.35 }}>
                                                {alert.location_name || `${alert.latitude.toFixed(4)}, ${alert.longitude.toFixed(4)}`}
                                            </Typography>
                                        </Box>

                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.6 }}>
                                            {alert.status === 'ESCALATED' ? (
                                                <LocalPoliceIcon sx={{ fontSize: 15, color: 'error.main' }} />
                                            ) : (
                                                <GroupIcon sx={{ fontSize: 15, color: 'warning.main' }} />
                                            )}
                                            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.78rem' }}>
                                                {getAlertSummary(alert)}
                                            </Typography>
                                        </Box>
                                    </CardContent>
                                </Card>
                            ))}
                        </Box>
                    </CardContent>
                </Card>
            )}

            {/* Controls - Your Location and Tracking Controls side by side */}
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
                                Your Alerts History
                            </Typography>
                            <AlertTable alerts={alerts} showRiderName={true} showStatus={true} />
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
                                    variant="contained"
                                    color="success"
                                    size="large"
                                    onClick={handleStopTracking}
                                    sx={{ mb: 2 }}
                                >
                                    Tracking Active - Stop
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

                            {locationPermission === 'denied' && (
                                <Alert severity="warning" sx={{ mt: 2 }}>
                                    Location access is blocked. Click the lock icon in your browser's address bar,
                                    find "Location" and change it to "Allow", then refresh the page.
                                </Alert>
                            )}

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
                                    Current Location
                                </Typography>
                                {currentPlaceName && (
                                    <Typography variant="h5" fontWeight="bold" color="primary" gutterBottom>
                                        {currentPlaceName}
                                    </Typography>
                                )}
                                <Typography variant="body2" color="text.secondary">
                                    {currentLocation.latitude.toFixed(4)}, {currentLocation.longitude.toFixed(4)}
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
