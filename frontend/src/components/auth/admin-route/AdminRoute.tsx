import { Navigate, Outlet, useLocation } from 'react-router-dom'
import useAuth from '../../../hooks/useAuth'
import LoadingState from '../../ui/loading-state/LoadingState'

export default function AdminRoute() {
    const { user, loading } = useAuth()
    const location = useLocation()
    if (loading) return <LoadingState label="Restoring your session" />
    if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
    if (user.role !== 'admin') return <Navigate to="/unauthorized" replace />
    return <Outlet />
}
