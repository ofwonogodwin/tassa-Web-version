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
    Tabs,
    Tab,
    Stack,
    Divider,
    TextField,
    LinearProgress,
    List,
    ListItem,
    ListItemText,
} from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'
import SendIcon from '@mui/icons-material/Send'
import { getAlerts, getAnalyticsSummary, getHotspots, getRetentionInfo, runRetentionCleanup, getChatMessages, postChatMessage } from '../api/api'
import MapView from '../components/MapView'
import AlertTable from '../components/AlertTable'

function PoliceDashboard() {
    const [alerts, setAlerts] = useState([])
    const [loading, setLoading] = useState(true)
    const [lastUpdate, setLastUpdate] = useState(null)
    const [viewMode, setViewMode] = useState('active') // 'active', 'escalated', 'pending', 'history'
    const [activeTab, setActiveTab] = useState(0)
    const [summary, setSummary] = useState(null)
    const [hotspots, setHotspots] = useState([])
    const [retention, setRetention] = useState(null)
    const [chatMessages, setChatMessages] = useState([])
    const [chatInput, setChatInput] = useState('')
    const [busyCleanup, setBusyCleanup] = useState(false)

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
            const [alertsData, summaryData, hotspotData, retentionData, messagesData] = await Promise.all([
                getAlerts(),
                getAnalyticsSummary(),
                getHotspots(),
                getRetentionInfo(),
                getChatMessages(),
            ])

            setAlerts(alertsData)
            setSummary(summaryData)
            setHotspots(hotspotData)
            setRetention(retentionData)
            setChatMessages(messagesData)
            setLastUpdate(new Date())
        } catch (err) {
            console.error('Failed to fetch alerts:', err)
        } finally {
            setLoading(false)
        }
    }

    const handleCleanup = async () => {
        setBusyCleanup(true)
        try {
            await runRetentionCleanup()
            await fetchAlerts()
        } finally {
            setBusyCleanup(false)
        }
    }

    const handleSendMessage = async () => {
        if (!chatInput.trim()) return
        try {
            await postChatMessage({
                sender_name: 'Police Desk',
                sender_role: 'POLICE',
                message: chatInput.trim(),
            })
            setChatInput('')
            const messagesData = await getChatMessages()
            setChatMessages(messagesData)
        } catch (err) {
            console.error('Failed to send chat message:', err)
        }
    }

    // Active alerts exclude resolved alerts.
    const filteredAlerts = alerts.filter(alert => {
        if (viewMode === 'active') return alert.status === 'ESCALATED' || alert.status === 'RIDER_PENDING'
        if (viewMode === 'escalated') return alert.status === 'ESCALATED'
        if (viewMode === 'pending') return alert.status === 'RIDER_PENDING'
        return true // 'history' includes all
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
    const activeCount = escalatedCount + pendingCount

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
            <Alert severity="info" sx={{ mb: 3 }}>
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
                    size="small"
                >
                    <ToggleButton value="active" aria-label="active alerts">
                        Active ({activeCount})
                    </ToggleButton>
                    <ToggleButton value="escalated" aria-label="escalated alerts">
                        Escalated ({escalatedCount})
                    </ToggleButton>
                    <ToggleButton value="pending" aria-label="pending alerts">
                        Rider Pending ({pendingCount})
                    </ToggleButton>
                    <ToggleButton value="history" aria-label="alert history">
                        History ({alerts.length})
                    </ToggleButton>
                </ToggleButtonGroup>
            </Box>

            {/* Stats */}
            <Grid container spacing={3} sx={{ mb: 3 }}>
                <Grid item xs={12} sm={4}>
                    <Card>
                        <CardContent>
                            <Typography variant="h6" color="text.secondary">
                                {viewMode === 'active' ? 'Active Alerts' : viewMode === 'escalated' ? 'Escalated Alerts' : viewMode === 'pending' ? 'Pending Alerts' : 'Alert History'}
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

            <Card sx={{ mb: 3 }}>
                <CardContent>
                    <Tabs value={activeTab} onChange={(e, value) => setActiveTab(value)}>
                        <Tab label="Operations" />
                        <Tab label="Analytics" />
                        <Tab label="Coordination Chat" />
                    </Tabs>
                </CardContent>
            </Card>

            {activeTab === 0 && (
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
            )}

            {activeTab === 1 && (
                <Grid container spacing={3}>
                    <Grid item xs={12} md={6}>
                        <Card>
                            <CardContent>
                                <Typography variant="h6" gutterBottom>
                                    Incident Type Breakdown
                                </Typography>
                                <Stack spacing={2}>
                                    <Box>
                                        <Typography variant="body2">SOS ({summary?.sos_alerts || 0})</Typography>
                                        <LinearProgress
                                            variant="determinate"
                                            value={summary?.total_alerts ? (summary.sos_alerts / summary.total_alerts) * 100 : 0}
                                            color="error"
                                        />
                                    </Box>
                                    <Box>
                                        <Typography variant="body2">Anomaly ({summary?.anomaly_alerts || 0})</Typography>
                                        <LinearProgress
                                            variant="determinate"
                                            value={summary?.total_alerts ? (summary.anomaly_alerts / summary.total_alerts) * 100 : 0}
                                            color="warning"
                                        />
                                    </Box>
                                    <Divider />
                                    <Typography variant="body2">Escalated: {summary?.escalated_alerts || 0}</Typography>
                                    <Typography variant="body2">Pending: {summary?.pending_alerts || 0}</Typography>
                                    <Typography variant="body2">Resolved: {summary?.resolved_alerts || 0}</Typography>
                                </Stack>
                            </CardContent>
                        </Card>
                    </Grid>

                    <Grid item xs={12} md={6}>
                        <Card>
                            <CardContent>
                                <Typography variant="h6" gutterBottom>
                                    Log Retention
                                </Typography>
                                <Typography variant="body2" sx={{ mb: 1 }}>
                                    Retention Window: {retention?.retention_days || 0} days
                                </Typography>
                                <Typography variant="body2" sx={{ mb: 2 }}>
                                    Oldest Alert: {retention?.oldest_alert_at ? new Date(retention.oldest_alert_at).toLocaleString() : 'No alerts yet'}
                                </Typography>
                                <Button
                                    variant="outlined"
                                    color="warning"
                                    onClick={handleCleanup}
                                    disabled={busyCleanup}
                                >
                                    {busyCleanup ? 'Cleaning...' : 'Run Retention Cleanup'}
                                </Button>
                            </CardContent>
                        </Card>
                    </Grid>

                    <Grid item xs={12}>
                        <Card>
                            <CardContent>
                                <Typography variant="h6" gutterBottom>
                                    Hotspot Heat Map
                                </Typography>
                                <Box sx={{ height: 420, mb: 2 }}>
                                    <MapView markers={[]} hotspots={hotspots} />
                                </Box>
                                <Alert severity="info">
                                    Larger red circles indicate higher incident concentration.
                                </Alert>
                            </CardContent>
                        </Card>
                    </Grid>
                </Grid>
            )}

            {activeTab === 2 && (
                <Grid container spacing={3}>
                    <Grid item xs={12}>
                        <Card>
                            <CardContent>
                                <Typography variant="h6" gutterBottom>
                                    Police-Rider Coordination Feed
                                </Typography>
                                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2 }}>
                                    <TextField
                                        fullWidth
                                        label="Type an operational message"
                                        value={chatInput}
                                        onChange={(e) => setChatInput(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleSendMessage()
                                        }}
                                    />
                                    <Button variant="contained" startIcon={<SendIcon />} onClick={handleSendMessage}>
                                        Send
                                    </Button>
                                </Stack>
                                <List sx={{ maxHeight: 360, overflowY: 'auto' }}>
                                    {chatMessages.map((msg) => (
                                        <ListItem key={msg.id} divider>
                                            <ListItemText
                                                primary={`${msg.sender_name} (${msg.sender_role})`}
                                                secondary={`${msg.message} • ${new Date(msg.timestamp).toLocaleString()}`}
                                            />
                                        </ListItem>
                                    ))}
                                    {chatMessages.length === 0 && (
                                        <ListItem>
                                            <ListItemText secondary="No messages yet." />
                                        </ListItem>
                                    )}
                                </List>
                            </CardContent>
                        </Card>
                    </Grid>
                </Grid>
            )}
        </Container>
    )
}

export default PoliceDashboard
