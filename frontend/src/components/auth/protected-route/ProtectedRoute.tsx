import { Navigate, Outlet, useLocation } from 'react-router-dom'
import useAuth from '../../../hooks/useAuth'
import LoadingState from '../../ui/loading-state/LoadingState'

export default function ProtectedRoute() {
    const { user, loading, restorationError, refreshUser } = useAuth()
    const location = useLocation()

    if (loading) return <LoadingState label="Restoring your session" />
    if (restorationError) return <section className="state-message" role="alert"><p>{restorationError}</p><button type="button" onClick={() => void refreshUser()}>Try again</button></section>
    if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
    return <Outlet />
}
