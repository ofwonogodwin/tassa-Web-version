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

function AlertTable({ alerts, showRiderName = false }) {
    // Format timestamp for display
    const formatDate = (timestamp) => {
        const date = new Date(timestamp)
        return date.toLocaleString()
    }

    // Get chip color based on alert type
    const getChipColor = (type) => {
        return type === 'SOS' ? 'error' : 'warning'
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
                            <TableCell>
                                {alert.latitude.toFixed(4)}, {alert.longitude.toFixed(4)}
                                {alert.location_name && `, ${alert.location_name}`}
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
