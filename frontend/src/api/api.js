import axios from 'axios'

// Backend API base URL - uses environment variable in production, localhost for development
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// Create axios instance
const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
})

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('taasa_token')
    if (token) {
        config.headers.Authorization = `Bearer ${token}`
    }
    return config
})

// Register new rider
export const registerRider = async (data) => {
    const response = await api.post('/register', data)
    return response.data
}

// Login rider
export const loginRider = async (data) => {
    const response = await api.post('/login', data)
    return response.data
}

// Police login
export const loginPolice = async (data) => {
    const response = await api.post('/police/login', data)
    return response.data
}

// Send location update
export const sendLocation = async (data) => {
    const response = await api.post('/location', data)
    return response.data
}

// Send SOS alert
export const sendSOS = async (data) => {
    const response = await api.post('/sos', data)
    return response.data
}

// Get all alerts
export const getAlerts = async () => {
    const response = await api.get('/alerts')
    return response.data
}

// Get alerts with optional filters
export const getAlertsFiltered = async ({ status = null, escalatedOnly = false } = {}) => {
    const params = new URLSearchParams()
    if (status) params.append('status', status)
    if (escalatedOnly) params.append('escalated_only', 'true')
    const query = params.toString()
    const response = await api.get(`/alerts${query ? `?${query}` : ''}`)
    return response.data
}

// Get all riders
export const getRiders = async () => {
    const response = await api.get('/riders')
    return response.data
}

// Get rider locations
export const getRiderLocations = async (riderId) => {
    const response = await api.get(`/rider/${riderId}/locations`)
    return response.data
}

// Get rider alerts
export const getRiderAlerts = async (riderId) => {
    const response = await api.get(`/rider/${riderId}/alerts`)
    return response.data
}

// ============== Community Policing API Functions ==============

// Get community alerts (alerts from fellow riders)
export const getCommunityAlerts = async (riderId) => {
    const response = await api.get(`/community-alerts?rider_id=${riderId}`)
    return response.data
}

// Respond to a community alert (fellow rider is helping)
export const respondToAlert = async (alertId, responderId) => {
    const response = await api.post(`/alerts/${alertId}/respond`, {
        responder_id: responderId
    })
    return response.data
}

// Escalate an alert to police
export const escalateAlert = async (alertId, escalatorId, reason = null) => {
    const response = await api.post(`/alerts/${alertId}/escalate`, {
        escalator_id: escalatorId,
        reason: reason
    })
    return response.data
}

// Resolve an alert
export const resolveAlert = async (alertId, resolverId, notes = null) => {
    const response = await api.post(`/alerts/${alertId}/resolve`, {
        resolver_id: resolverId,
        resolution_notes: notes
    })
    return response.data
}

// Reverse geocode coordinates to place name
export const getPlaceName = async (lat, lng) => {
    const response = await api.get(`/geocode?lat=${lat}&lng=${lng}`)
    return response.data
}

// Analytics summary
export const getAnalyticsSummary = async () => {
    const response = await api.get('/analytics/summary')
    return response.data
}

// Hotspot points for heat-style map
export const getHotspots = async () => {
    const response = await api.get('/analytics/hotspots')
    return response.data
}

// Retention policy information
export const getRetentionInfo = async () => {
    const response = await api.get('/retention')
    return response.data
}

// Manual retention cleanup
export const runRetentionCleanup = async () => {
    const response = await api.post('/retention/cleanup')
    return response.data
}

// Chat feed
export const getChatMessages = async () => {
    const response = await api.get('/chat/messages')
    return response.data
}

export const postChatMessage = async (payload) => {
    const response = await api.post('/chat/messages', payload)
    return response.data
}

export default api
