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
} from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'
import { getAlerts } from '../api/api'
import MapView from '../components/MapView'
import AlertTable from '../components/AlertTable'

function PoliceDashboard() {
    const [alerts, setAlerts] = useState([])
    const [loading, setLoading] = useState(true)
    const [lastUpdate, setLastUpdate] = useState(null)

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

    // Convert alerts to map markers
    const markers = alerts.map((alert) => ({
        lat: alert.latitude,
        lng: alert.longitude,
        popup: `${alert.alert_type} - ${alert.rider_name}`,
        type: alert.alert_type,
    }))

    // Count alerts by type
    const sosCount = alerts.filter((a) => a.alert_type === 'SOS').length
    const anomalyCount = alerts.filter((a) => a.alert_type === 'ANOMALY').length

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

            {/* Stats */}
            <Grid container spacing={3} sx={{ mb: 3 }}>
                <Grid item xs={12} sm={4}>
                    <Card>
                        <CardContent>
                            <Typography variant="h6" color="text.secondary">
                                Total Alerts
                            </Typography>
                            <Typography variant="h3">
                                {alerts.length}
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
                            <AlertTable alerts={alerts} showRiderName={true} />
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>
        </Container>
    )
}

export default PoliceDashboard
