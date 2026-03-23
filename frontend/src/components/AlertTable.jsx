import {
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    Chip,
    Typography,
} from '@mui/material'

function AlertTable({ alerts, showRiderName = false, showStatus = false }) {
    // Format timestamp for display
    const formatDate = (timestamp) => {
        const date = new Date(timestamp)
        return date.toLocaleString()
    }

    // Get chip color based on alert type
    const getChipColor = (type) => {
        return type === 'SOS' ? 'error' : 'warning'
    }

    // Get chip color based on status
    const getStatusColor = (status) => {
        switch (status) {
            case 'ESCALATED': return 'error'
            case 'RIDER_PENDING': return 'warning'
            case 'RESOLVED': return 'success'
            default: return 'default'
        }
    }

    // Get status display text
    const getStatusText = (status) => {
        switch (status) {
            case 'ESCALATED': return 'Police Notified'
            case 'RIDER_PENDING': return 'With Riders'
            case 'RESOLVED': return 'Resolved'
            default: return status
        }
    }

    if (alerts.length === 0) {
        return (
            <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 3 }}>
                No alerts to display
            </Typography>
        )
    }

    return (
        <TableContainer component={Paper} variant="outlined">
            <Table size="small">
                <TableHead>
                    <TableRow>
                        <TableCell>ID</TableCell>
                        {showRiderName && <TableCell>Rider</TableCell>}
                        {showRiderName && <TableCell>Plate No.</TableCell>}
                        <TableCell>Type</TableCell>
                        {showStatus && <TableCell>Status</TableCell>}
                        <TableCell>Location</TableCell>
                        <TableCell>Timestamp</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {alerts.map((alert) => (
                        <TableRow key={alert.id}>
                            <TableCell>{alert.id}</TableCell>
                            {showRiderName && <TableCell>{alert.rider_name}</TableCell>}
                            {showRiderName && <TableCell>{alert.plate_number}</TableCell>}
                            <TableCell>
                                <Chip
                                    label={alert.alert_type}
                                    color={getChipColor(alert.alert_type)}
                                    size="small"
                                />
                            </TableCell>
                            {showStatus && (
                                <TableCell>
                                    <Typography variant="caption" color={`${getStatusColor(alert.status)}.main`}>
                                        {getStatusText(alert.status)}
                                    </Typography>
                                </TableCell>
                            )}
                            <TableCell>
                                {alert.latitude.toFixed(4)}, {alert.longitude.toFixed(4)}
                                {alert.location_name && (
                                    <Typography variant="caption" display="block" color="text.secondary">
                                        {alert.location_name}
                                    </Typography>
                                )}
                            </TableCell>
                            <TableCell>{formatDate(alert.timestamp)}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
    )
}

export default AlertTable
