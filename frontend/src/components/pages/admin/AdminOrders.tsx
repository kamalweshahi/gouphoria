import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { AdminOrderSummary } from '../../../models/AdminManagement'
import { adminErrorMessage, getAdminOrders } from '../../../services/admin'
import LoadingState from '../../ui/loading-state/LoadingState'
import StatusBadge from '../../ui/status-badge/StatusBadge'
import EmptyState from '../../ui/empty-state/EmptyState'
import { statusLabel } from '../../../utils/status-presentation'
import './Admin.css'

function money(value: number, currency: string) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value)
}

export default function AdminOrders() {
    const [params, setParams] = useSearchParams()
    const [orders, setOrders] = useState<AdminOrderSummary[]>([])
    const [search, setSearch] = useState(params.get('search') || '')
    const [paymentStatus, setPaymentStatus] = useState(params.get('paymentStatus') || '')
    const [fulfillmentStatus, setFulfillmentStatus] = useState(params.get('fulfillmentStatus') || '')
    const [orderStatus, setOrderStatus] = useState(params.get('orderStatus') || '')
    const [itemType, setItemType] = useState(params.get('itemType') || '')
    const [dateFrom, setDateFrom] = useState(params.get('dateFrom') || '')
    const [dateTo, setDateTo] = useState(params.get('dateTo') || '')
    const page = Number(params.get('page')) || 1
    const [pages, setPages] = useState(1)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    useEffect(() => {
        let cancelled = false
        void getAdminOrders({
            page,
            search: params.get('search') || undefined,
            paymentStatus: params.get('paymentStatus') || undefined,
            fulfillmentStatus: params.get('fulfillmentStatus') || undefined,
            orderStatus: params.get('orderStatus') || undefined,
            itemType: params.get('itemType') || undefined,
            dateFrom: params.get('dateFrom') || undefined,
            dateTo: params.get('dateTo') || undefined
        }).then(result => {
            if (cancelled) return
            setOrders(result.orders); setPages(result.pagination.totalPages || 1); setError('')
        }).catch(loadError => {
            if (!cancelled) setError(adminErrorMessage(loadError, 'Could not load orders.'))
        }).finally(() => { if (!cancelled) setLoading(false) })
        return () => { cancelled = true }
    }, [page, params])

    function submit(event: FormEvent) {
        event.preventDefault()
        setLoading(true)
        const next = new URLSearchParams()
        for (const [key, value] of Object.entries({ search, paymentStatus, fulfillmentStatus, orderStatus, itemType, dateFrom, dateTo })) {
            if (value) next.set(key, value)
        }
        setParams(next)
    }

    function goToPage(nextPage: number) {
        setLoading(true)
        setParams(current => {
            const next = new URLSearchParams(current)
            next.set('page', String(nextPage))
            return next
        })
    }

    return <section className="admin-page">
        <header className="admin-heading"><div><span className="eyebrow">Administration</span><h1>Orders</h1><p>Payment, review, shipping, production, and tracking visibility.</p></div></header>
        <form className="admin-filters admin-order-filters" onSubmit={submit}>
            <label className="wide">Search<input aria-label="Search orders" placeholder="Order, customer, PayPal or external order ID" value={search} onChange={event => setSearch(event.target.value)} /></label>
            <label>Payment<select value={paymentStatus} onChange={event => setPaymentStatus(event.target.value)}><option value="">All payments</option><option value="created">Pending</option><option value="approved">Approved</option><option value="captured">Paid</option><option value="failed">Failed</option><option value="refunded">Refunded</option></select></label>
            <label>Order status<select value={orderStatus} onChange={event => setOrderStatus(event.target.value)}><option value="">All order states</option><option value="pending_ai_review">Awaiting AI review</option><option value="ready_for_fulfillment">Fulfillment pending</option><option value="fulfillment_failed">Fulfillment failed</option><option value="printing">In production</option><option value="partially_fulfilled">Partially fulfilled</option><option value="shipped">Shipped</option><option value="delivered">Delivered</option><option value="cancelled">Cancelled</option></select></label>
            <label>Fulfillment<select value={fulfillmentStatus} onChange={event => setFulfillmentStatus(event.target.value)}><option value="">All fulfillment</option><option value="not_ready">Not ready</option><option value="ready">Ready</option><option value="submitted">Submitted</option><option value="in_production">In production</option><option value="partial">Partial</option><option value="shipped">Shipped</option><option value="delivered">Delivered</option><option value="failed">Failed</option></select></label>
            <label>Order type<select value={itemType} onChange={event => setItemType(event.target.value)}><option value="">All order types</option><option value="standard">Standard</option><option value="ai_custom">AI custom</option><option value="mixed">Mixed</option></select></label>
            <label>From<input type="date" value={dateFrom} onChange={event => setDateFrom(event.target.value)} /></label>
            <label>To<input type="date" value={dateTo} onChange={event => setDateTo(event.target.value)} /></label>
            <button>Apply filters</button>
        </form>
        {error && <p className="error" role="alert">{error}</p>}
        {loading ? <LoadingState label="Loading orders" /> : orders.length ? <div className="admin-table-wrap"><table className="admin-table">
            <thead><tr><th>Order</th><th>Customer</th><th>Date</th><th>Type / items</th><th>Payment</th><th>Order</th><th>AI review</th><th>Production / shipping</th><th>External production order</th><th>Total</th></tr></thead>
            <tbody>{orders.map(order => <tr key={order.id}>
                <td><Link to={`/admin/orders/${order.id}`}>{order.orderNumber}</Link></td>
                <td>{order.customer && <Link to={`/admin/customers/${order.customer.id}`}>{order.customer.name}<br /><small>{order.customer.email}</small></Link>}</td>
                <td>{new Date(order.createdAt).toLocaleDateString()}</td>
                <td>{order.orderKind === 'mixed' ? 'Mixed' : order.orderKind === 'ai_custom' ? 'AI custom' : 'Standard'}<br /><small>{order.itemCount} lines · {order.quantity} units</small></td>
                <td><StatusBadge status={order.paymentStatus} audience="admin" /></td>
                <td><StatusBadge status={order.status} audience="admin" /></td>
                <td>{order.awaitingReview ? <StatusBadge status="pending_ai_review" audience="admin" /> : order.customItems ? 'No pending review' : 'Not required'}</td>
                <td><StatusBadge status={order.fulfillmentStatus} audience="admin" /><br /><small>{statusLabel(order.shippingStatus, 'admin')}</small></td>
                <td>{order.printifyOrderId || 'Not submitted'}<br /><small>{order.printifyStatus ? statusLabel(order.printifyStatus, 'admin') : ''}</small></td>
                <td>{money(order.total, order.currency)}</td>
            </tr>)}</tbody>
        </table></div> : <EmptyState title="No matching orders" message="Try changing the order filters or date range." />}
        <div className="admin-pagination"><button disabled={page <= 1 || loading} onClick={() => goToPage(page - 1)}>Previous</button><span>Page {page} of {pages}</span><button disabled={page >= pages || loading} onClick={() => goToPage(page + 1)}>Next</button></div>
    </section>
}
