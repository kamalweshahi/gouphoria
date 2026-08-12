import { useEffect, useState } from 'react'
import type Order from '../../../models/Order'
import { cartErrorMessage, getOrders } from '../../../services/cart'
import './OrderHistory.css'
import { Link } from 'react-router-dom'
import LoadingState from '../../ui/loading-state/LoadingState'
import EmptyState from '../../ui/empty-state/EmptyState'
import StatusBadge from '../../ui/status-badge/StatusBadge'
import { customerOrderStatus, orderKind, statusLabel } from '../../../utils/status-presentation'

function price(value: number, currency: string) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value)
}

export default function OrderHistory() {
    const [orders, setOrders] = useState<Order[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    useEffect(() => {
        getOrders()
            .then(setOrders)
            .catch(requestError => setError(cartErrorMessage(requestError, 'Could not load order history.')))
            .finally(() => setLoading(false))
    }, [])

    if (loading) return <LoadingState label="Loading order history" />

    return (
        <section className="orders-page">
            <div className="orders-heading">
                <span className="eyebrow">Order history</span>
                <h1>Your saved orders.</h1>
                <p>Paid orders remain safely stored even when product availability changes.</p>
            </div>
            {error && <p className="error" role="alert">{error}</p>}
            {!orders.length && !error && <EmptyState title="No orders yet" message="Explore our cases and find one made for you." action={{ label: 'Shop Cases', to: '/products' }} />}
            <div className="orders-list">
                {orders.map(order => (
                    <article className="order-card" key={order.id}>
                        <div className="order-card-heading">
                            <div><small>Order number</small><h2>{order.orderNumber}</h2></div>
                            <strong>{price(order.total, order.currency)}</strong>
                        </div>
                        <div className="order-meta">
                            <span>{new Date(order.createdAt).toLocaleDateString()}</span>
                            <span>{order.items.reduce((sum, item) => sum + item.quantity, 0)} {order.items.reduce((sum, item) => sum + item.quantity, 0) === 1 ? 'item' : 'items'}</span>
                            <span>{orderKind(order.items)}</span>
                            <StatusBadge status={customerOrderStatus(order)} prefix="Order" />
                            <StatusBadge status={order.paymentStatus} prefix="Payment" />
                        </div>
                        <ul className="order-item-summary">
                            {order.items.map(item => (
                                <li key={item.id}>
                                    <span>{item.quantity} × {item.productTitle} — {item.phoneModel}, {item.caseType}</span>
                                    <small>{item.itemType === 'ai_custom' ? `AI custom · ${statusLabel(item.status)}` : `Standard · ${statusLabel(item.status)}`}</small>
                                    {item.reviewMessage && <small>Update: {item.reviewMessage}</small>}
                                </li>
                            ))}
                        </ul>
                        <Link className="order-details-link" to={`/orders/${order.id}`}>View order details</Link>
                    </article>
                ))}
            </div>
        </section>
    )
}
