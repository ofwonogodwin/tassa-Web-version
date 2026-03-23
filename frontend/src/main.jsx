import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import App from './App'

// Create MUI theme
const theme = createTheme({
    palette: {
        primary: {
            main: '#1E4E8C',
            dark: '#173F70',
            light: '#3A6AA8',
            contrastText: '#FFFFFF',
        },
        secondary: {
            main: '#dc004e',
        },
    },
})

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <BrowserRouter>
                <App />
            </BrowserRouter>
        </ThemeProvider>
    </React.StrictMode>
)
