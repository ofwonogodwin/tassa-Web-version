import { useState, useEffect } from 'react'
import {
    Container,
    Grid,
    Card,
    CardContent,
    Typography,
    Box,
    Button,
    Chip,
    ToggleButton,
    ToggleButtonGroup,
    Alert,
} from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'
import LocalPoliceIcon from '@mui/icons-material/LocalPolice'
import GroupIcon from '@mui/icons-material/Group'
import { getAlerts } from '../api/api'
import MapView from '../components/MapView'
import AlertTable from '../components/AlertTable'

function PoliceDashboard() {
    const [alerts, setAlerts] = useState([])
    const [loading, setLoading] = useState(true)
    const [lastUpdate, setLastUpdate] = useState(null)
    const [viewMode, setViewMode] = useState('escalated') // 'escalated', 'all', 'pending'

    // Fetch alerts on mount
    useEffect(() => {
        fetchAlerts()

        // Auto-refresh every 30 seconds
        const interval = setInterval(fetchAlerts, 30000)
        return () => clearInterval(interval)
    }, [])

    // Fetch all alerts
    const fetchAlerts = async () => {
        try {
            const data = await getAlerts()
            setAlerts(data)
            setLastUpdate(new Date())
        } catch (err) {
            console.error('Failed to fetch alerts:', err)
        } finally {
            setLoading(false)
        }
    }

    // Filter alerts based on view mode
    const filteredAlerts = alerts.filter(alert => {
        if (viewMode === 'escalated') return alert.status === 'ESCALATED'
        if (viewMode === 'pending') return alert.status === 'RIDER_PENDING'
        return true // 'all'
    })

    // Convert alerts to map markers
    const markers = filteredAlerts.map((alert) => ({
        lat: alert.latitude,
        lng: alert.longitude,
        popup: `${alert.alert_type} - ${alert.rider_name} (${alert.status})`,
        type: alert.alert_type,
    }))

    // Count alerts by type and status
    const sosCount = filteredAlerts.filter((a) => a.alert_type === 'SOS').length
    const anomalyCount = filteredAlerts.filter((a) => a.alert_type === 'ANOMALY').length
    const escalatedCount = alerts.filter((a) => a.status === 'ESCALATED').length
    const pendingCount = alerts.filter((a) => a.status === 'RIDER_PENDING').length

    return (
        <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
            {/* Header */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h4">
                    Police Dashboard
                </Typography>
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                    {lastUpdate && (
                        <Typography variant="body2" color="text.secondary">
                            Last updated: {lastUpdate.toLocaleTimeString()}
                        </Typography>
                    )}
                    <Button
                        variant="outlined"
                        startIcon={<RefreshIcon />}
                        onClick={fetchAlerts}
                        disabled={loading}
                    >
                        Refresh
                    </Button>
                </Box>
            </Box>

            {/* Community Policing Info */}
            <Alert severity="info" sx={{ mb: 3 }} icon={<GroupIcon />}>
                <strong>Community Policing Active:</strong> Alerts go to fellow riders first.
                You see alerts after they've been escalated (no rider response within 3 minutes)
                or manually escalated by a rider.
            </Alert>

            {/* View Mode Toggle */}
            <Box sx={{ mb: 3, display: 'flex', justifyContent: 'center' }}>
                <ToggleButtonGroup
                    value={viewMode}
                    exclusive
                    onChange={(e, newMode) => newMode && setViewMode(newMode)}
                    aria-label="alert view mode"
                >
                    <ToggleButton value="escalated" aria-label="escalated alerts">
                        <LocalPoliceIcon sx={{ mr: 1 }} />
                        Escalated ({escalatedCount})
                    </ToggleButton>
                    <ToggleButton value="pending" aria-label="pending alerts">
                        <GroupIcon sx={{ mr: 1 }} />
                        Rider Pending ({pendingCount})
                    </ToggleButton>
                    <ToggleButton value="all" aria-label="all alerts">
                        All ({alerts.length})
                    </ToggleButton>
                </ToggleButtonGroup>
            </Box>

            {/* Stats */}
            <Grid container spacing={3} sx={{ mb: 3 }}>
                <Grid item xs={12} sm={4}>
                    <Card>
                        <CardContent>
                            <Typography variant="h6" color="text.secondary">
                                {viewMode === 'escalated' ? 'Escalated Alerts' : viewMode === 'pending' ? 'Pending Alerts' : 'Total Alerts'}
                            </Typography>
                            <Typography variant="h3">
                                {filteredAlerts.length}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} sm={4}>
                    <Card sx={{ borderLeft: 4, borderColor: 'error.main' }}>
                        <CardContent>
                            <Typography variant="h6" color="text.secondary">
                                SOS Alerts
                            </Typography>
                            <Typography variant="h3" color="error">
                                {sosCount}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} sm={4}>
                    <Card sx={{ borderLeft: 4, borderColor: 'warning.main' }}>
                        <CardContent>
                            <Typography variant="h6" color="text.secondary">
                                Anomaly Alerts
                            </Typography>
                            <Typography variant="h3" color="warning.main">
                                {anomalyCount}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            {/* Map and Table */}
            <Grid container spacing={3}>
                <Grid item xs={12}>
                    <Card>
                        <CardContent>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                <Typography variant="h6">
                                    Alert Locations
                                </Typography>
                                <Box sx={{ display: 'flex', gap: 1 }}>
                                    <Chip label="SOS" color="error" size="small" />
                                    <Chip label="ANOMALY" color="warning" size="small" />
                                </Box>
                            </Box>
                            <Box sx={{ height: 400 }}>
                                <MapView markers={markers} />
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12}>
                    <Card>
                        <CardContent>
                            <Typography variant="h6" gutterBottom>
                                Alert History
                            </Typography>
                            <AlertTable alerts={filteredAlerts} showRiderName={true} showStatus={true} />
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>
        </Container>
    )
}

export default PoliceDashboard
