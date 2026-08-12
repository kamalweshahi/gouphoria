import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import useAuth from '../../../hooks/useAuth'
import type Order from '../../../models/Order'
import { getOrders } from '../../../services/cart'
import EmptyState from '../../ui/empty-state/EmptyState'
import LoadingState from '../../ui/loading-state/LoadingState'
import StatusBadge from '../../ui/status-badge/StatusBadge'
import { customerOrderStatus } from '../../../utils/status-presentation'
import './Profile.css'

export default function Profile() {
    const { user } = useAuth()
    const [orders, setOrders] = useState<Order[]>([])
    const [loadingOrders, setLoadingOrders] = useState(true)
    const [ordersError, setOrdersError] = useState('')

    useEffect(() => {
        getOrders().then(setOrders).catch(() => setOrdersError('Your orders could not be loaded right now.')).finally(() => setLoadingOrders(false))
    }, [])

    if (!user) return null

    return <section className="profile-page account-dashboard">
        <header className="profile-heading"><span className="eyebrow">My Account</span><h1>Welcome back, {user.name}.</h1><p>Track orders, manage your details, and return to saved designs.</p></header>
        <nav className="account-quick-nav" aria-label="Account sections"><a href="#account-orders">Orders</a><Link to="/designs">Designs</Link><Link to="/credits">Credits</Link><a href="#account-settings">Account settings</a></nav>

        <section className="account-orders" id="account-orders" aria-labelledby="account-orders-title">
            <div className="account-section-heading"><div><span className="eyebrow">First things first</span><h2 id="account-orders-title">My Orders</h2></div>{orders.length > 0 && <Link to="/orders">View all orders →</Link>}</div>
            {loadingOrders
                ? <LoadingState label="Loading your orders" />
                : ordersError
                    ? <p className="error" role="alert">{ordersError}</p>
                    : !orders.length
                        ? <EmptyState title="No orders yet" message="Explore our cases and find one made for you." action={{ label: 'Shop Cases', to: '/products' }} />
                        : <div className="account-order-list">{orders.slice(0, 3).map(order => <Link to={`/orders/${order.id}`} key={order.id}><span><small>Order</small><strong>{order.orderNumber}</strong></span><span>{new Date(order.createdAt).toLocaleDateString()}</span><StatusBadge status={customerOrderStatus(order)} /></Link>)}</div>}
        </section>

        <div className="profile-grid" id="account-settings">
            <article><span className="eyebrow">Account settings</span><h2>Your details</h2><dl><div><dt>Name</dt><dd>{user.name}</dd></div><div><dt>Email</dt><dd>{user.email}</dd></div></dl></article>
            <article><span className="eyebrow">Optional creative tools</span><h2>My Designs</h2><p>Open your private custom artwork and case previews when you want to continue creating.</p><Link to="/designs">Open My Designs →</Link></article>
            <article><span className="eyebrow">Powered by AI</span><h2>Credits</h2><strong>{user.credits.balance}</strong><p>{user.credits.balance === 1 ? 'credit available' : 'credits available'} for custom design generation.</p><Link to="/credits">View credits →</Link></article>
        </div>
    </section>
}
