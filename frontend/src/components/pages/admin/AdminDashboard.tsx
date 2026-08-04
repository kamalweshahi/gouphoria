import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { AdminDashboardData } from '../../../models/AdminReview'
import { adminErrorMessage, getAdminDashboard } from '../../../services/admin'
import StatusBadge from '../../ui/status-badge/StatusBadge'
import LoadingState from '../../ui/loading-state/LoadingState'
import './Admin.css'

function money(value: number, currency: string) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value)
}

export default function AdminDashboard() {
    const [dashboard, setDashboard] = useState<AdminDashboardData | null>(null)
    const [error, setError] = useState('')
    useEffect(() => { getAdminDashboard().then(setDashboard).catch(error => setError(adminErrorMessage(error, 'Could not load the admin dashboard.'))) }, [])
    if (error) return <p className="error" role="alert">{error}</p>
    if (!dashboard) return <LoadingState label="Loading admin dashboard" />
    const stats: Array<{ label: string; value: number; to: string }> = [
        { label: 'AI designs awaiting review', value: dashboard.counts.pendingReviews, to: '/admin/reviews?status=pending_design_review' },
        { label: 'Change requested', value: dashboard.counts.changeRequested, to: '/admin/reviews?status=changes_requested' },
        { label: 'Paid, awaiting fulfillment', value: dashboard.counts.paidAwaitingFulfillment, to: '/admin/orders?paymentStatus=captured&fulfillmentStatus=ready' },
        { label: 'Fulfillment failures', value: dashboard.counts.fulfillmentFailures, to: '/admin/orders?fulfillmentStatus=failed' },
        { label: 'In production', value: dashboard.counts.inProduction, to: '/admin/orders?fulfillmentStatus=in_production' },
        { label: 'Shipped orders', value: dashboard.counts.shippedOrders, to: '/admin/orders?fulfillmentStatus=shipped' },
        { label: 'Payment issues', value: dashboard.counts.paymentIssues, to: '/admin/orders?paymentStatus=failed' },
        { label: 'Customers', value: dashboard.counts.customers, to: '/admin/customers' },
        { label: 'Active products', value: dashboard.counts.activeProducts, to: '/admin/products' },
        { label: 'Disabled products/variants', value: dashboard.counts.disabledProducts + dashboard.counts.disabledVariants, to: '/admin/products?availability=disabled' }
    ]
    return <section className="admin-page">
        <header className="admin-heading"><div><span className="eyebrow">Administration</span><h1>Commerce dashboard</h1><p>Manage customers, products, orders, credits, reviews, and fulfillment.</p></div><div className="admin-heading-links"><Link to="/admin/customers">Customers</Link><Link to="/admin/orders">Orders</Link><Link to="/admin/products">Products</Link><Link to="/admin/reviews">AI reviews</Link><Link to="/admin/credits">Credits</Link></div></header>
        <div className="admin-stats">{stats.map(stat => <Link className="admin-stat" key={stat.label} to={stat.to}><span>{stat.label}</span><strong>{stat.value}</strong></Link>)}</div>
        <article className="admin-panel"><h2>Recent paid orders</h2>{!dashboard.recentPaidOrders.length ? <p>No paid orders yet.</p> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Order</th><th>Customer</th><th>Custom items</th><th>Status</th><th>Total</th></tr></thead><tbody>{dashboard.recentPaidOrders.map(order => <tr key={order.id}><td><Link to={`/admin/orders/${order.id}`}>{order.orderNumber}</Link>{order.reviewItemId && <> · <Link to={`/admin/reviews/${order.reviewItemId}`}>Review</Link></>}</td><td>{order.customer}</td><td>{order.customItems}</td><td><StatusBadge status={order.status} audience="admin" /></td><td>{money(order.total, order.currency)}</td></tr>)}</tbody></table></div>}</article>
    </section>
}
