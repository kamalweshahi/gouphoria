import './App.css'
import Layout from '../layout/layout/Layout'
import { BrowserRouter } from 'react-router-dom'
import AuthProvider from '../../context/AuthProvider'
import CartProvider from '../../context/CartProvider'
import useAuth from '../../hooks/useAuth'

function SessionScopedApp() {
    const { user, sessionVersion } = useAuth()
    return <div key={`${user?.id ?? 'anonymous'}:${sessionVersion}`}><CartProvider><Layout /></CartProvider></div>
}

function App() {

  return (
    <>
        <BrowserRouter>
            <AuthProvider>
                <SessionScopedApp />
            </AuthProvider>
        </BrowserRouter>
    </>
  )
}

export default App
