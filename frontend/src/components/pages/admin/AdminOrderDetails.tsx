import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { AdminOrderDetails } from '../../../models/AdminManagement'
import { addAdminOrderNote, adminAssetUrl, adminErrorMessage, getAdminOrder, retryAdminOrder, syncAdminOrder } from '../../../services/admin'
import LoadingState from '../../ui/loading-state/LoadingState'
import StatusBadge from '../../ui/status-badge/StatusBadge'
import ConfirmAction from '../../ui/confirm-action/ConfirmAction'
import { phoneBrand, statusLabel } from '../../../utils/status-presentation'
import './Admin.css'

function money(value: number | undefined, currency = 'USD') {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value ?? 0)
}

function value(entry?: string | number | null) {
    return entry === undefined || entry === null || entry === '' ? '—' : String(entry)
}

export default function AdminOrderDetailsPage() {
    const { orderId } = useParams()
    const id = Number(orderId)
    const [order, setOrder] = useState<AdminOrderDetails | null>(null)
    const [error, setError] = useState('')
    const [success, setSuccess] = useState('')
    const [working, setWorking] = useState(false)
    const [confirmRetry, setConfirmRetry] = useState(false)
    const [note, setNote] = useState('')

    useEffect(() => {
        let cancelled = false
        void getAdminOrder(id).then(next => { if (!cancelled) setOrder(next) })
            .catch(loadError => { if (!cancelled) setError(adminErrorMessage(loadError, 'Could not load this order.')) })
        return () => { cancelled = true }
    }, [id])

    async function action(kind: 'retry' | 'sync') {
        setWorking(true); setError(''); setSuccess('')
        try {
            setOrder(await (kind === 'retry' ? retryAdminOrder(id) : syncAdminOrder(id)))
            setSuccess(kind === 'retry' ? 'The safe production action completed.' : 'Production status synchronized.')
        } catch (actionError) { setError(adminErrorMessage(actionError, `Could not ${kind} fulfillment.`)) }
        finally { setWorking(false) }
    }

    async function submitNote(event: FormEvent) {
        event.preventDefault()
        setWorking(true); setError(''); setSuccess('')
        try {
            setOrder(await addAdminOrderNote(id, note))
            setNote('')
            setSuccess('Internal order note saved.')
        } catch (noteError) { setError(adminErrorMessage(noteError, 'Could not save the internal order note.')) }
        finally { setWorking(false) }
    }

    if (!order) return error ? <p className="error" role="alert">{error}</p> : <LoadingState label="Loading order details" />
    const hasSubmitReadyItem = order.items.some(item => item.itemType === 'ai_custom'
        ? ['approved_for_print', 'fulfillment_failed'].includes(item.status)
        : ['paid', 'fulfillment_failed'].includes(item.status))
    const canRetry = order.paymentStatus === 'captured'
        && ['ready', 'failed', 'partial'].includes(order.fulfillmentStatus)
        && hasSubmitReadyItem
    const canSync = Boolean(order.printifyOrderId || order.items.some(item => item.printify.orderId))
    const address = order.shippingAddress

    return <section className="admin-page">
        <Link className="back-link" to="/admin/orders">← Orders</Link>
        <header className="admin-heading">
            <div><span className="eyebrow">Order #{order.id}</span><h1>{order.orderNumber}</h1><p>{new Date(order.createdAt).toLocaleString()} · {order.orderKind === 'mixed' ? 'Mixed order' : order.orderKind === 'ai_custom' ? 'AI-custom order' : 'Standard order'}</p></div>
            <div className="admin-heading-statuses"><StatusBadge status={order.paymentStatus} prefix="Payment" audience="admin" /><StatusBadge status={order.status} prefix="Order" audience="admin" /><StatusBadge status={order.fulfillmentStatus} prefix="Fulfillment" audience="admin" /></div>
        </header>
        {error && <p className="error" role="alert">{error}</p>}
        {success && <p className="success" role="status">{success}</p>}
        {(order.paypal.environment !== 'live' || order.printify.mode !== 'production') && <div className="admin-notice"><strong>External submission safety</strong><span>PayPal: {order.paypal.environment}. Production integration: {order.printify.mode}. Orders are not silently sent into real production.</span></div>}

        <div className="admin-detail-grid">
            <article className="admin-panel"><h2>Order information</h2><dl className="admin-dl"><div><dt>Customer</dt><dd>{order.customer ? <Link to={`/admin/customers/${order.customer.id}`}>{order.customer.name}<br /><small>{order.customer.email}</small></Link> : '—'}</dd></div><div><dt>Items</dt><dd>{order.itemCount} lines · {order.quantity} units</dd></div><div><dt>Currency</dt><dd>{order.currency}</dd></div><div><dt>Shipping method</dt><dd>{value(order.shippingMethod?.name)}</dd></div></dl></article>
            <article className="admin-panel"><h2>Verified totals</h2><dl className="admin-dl"><div><dt>Subtotal</dt><dd>{money(order.subtotal, order.currency)}</dd></div><div><dt>Shipping</dt><dd>{money(order.shipping, order.currency)}</dd></div><div><dt>Tax</dt><dd>{money(order.tax, order.currency)}</dd></div><div><dt>Total</dt><dd><strong>{money(order.total, order.currency)}</strong></dd></div></dl></article>
            <article className="admin-panel"><h2>Production actions</h2><div className="admin-action-row"><button disabled={!canRetry || working} onClick={() => setConfirmRetry(true)}>{order.fulfillmentStatus === 'failed' ? 'Retry production' : 'Submit to production'}</button><button disabled={!canSync || working} onClick={() => void action('sync')}>{working ? 'Working…' : 'Synchronize production'}</button></div><p><small>{!canRetry && !canSync ? 'No production action is valid for the current payment and integration state.' : 'Each standard and AI-custom item is routed through its matching idempotent production flow without recapturing PayPal.'}</small></p></article>
        </div>

        <article className="admin-panel"><h2>Items</h2>{order.items.map(item => <div className="admin-order-item" key={item.id}>
            <div><span className="review-status">{item.itemType === 'ai_custom' ? 'AI custom' : 'Standard'}</span><h3>{item.productTitle}</h3><dl className="admin-dl"><div><dt>Phone</dt><dd>{phoneBrand(item.phoneModel)} · {item.phoneModel}</dd></div><div><dt>Case type</dt><dd>{item.caseType}</dd></div><div><dt>Variant</dt><dd>{item.variantTitle}</dd></div><div><dt>Pricing</dt><dd>{item.quantity} × {money(item.unitPrice, item.currency)} = {money(item.totalPrice, item.currency)}</dd></div><div><dt>Item status</dt><dd><StatusBadge status={item.status} audience="admin" /></dd></div></dl>{item.aiDesignId && <Link to={`/admin/reviews/${item.id}`}>Open design review</Link>}</div>
            {item.mockup ? <img src={adminAssetUrl(item.mockup)} alt={`Custom case preview for ${item.phoneModel}`} /> : <div className="admin-asset-placeholder">No custom mockup</div>}
            <div><h3>AI design</h3>{item.design ? <><p><strong>Design #{item.design.id}</strong> · {item.design.generationCount} generations</p><p>{item.design.prompt}</p>{item.design.revisionPrompt && <p><b>Revision:</b> {item.design.revisionPrompt}</p>}<StatusBadge status={item.design.approvalStatus} prefix="Review" audience="admin" />{item.approvedArtwork && <p className="admin-approved-artwork">✓ Approved artwork snapshot stored</p>}{item.artwork && <p><a href={adminAssetUrl(item.artwork)} target="_blank" rel="noreferrer">Open secure printable artwork</a></p>}</> : <p>Not an AI-custom item.</p>}</div>
            <div><h3>Integration mapping</h3><p><small>Technical production identifiers are available to administrators when needed.</small></p><details className="admin-integration-details"><summary>Internal integration details</summary><dl className="admin-dl"><div><dt>Printify product ID</dt><dd>{value(item.printify.productId)}</dd></div><div><dt>Printify variant ID</dt><dd>{value(item.printify.variantId)}</dd></div><div><dt>External line order ID</dt><dd>{value(item.printify.orderId)}</dd></div><div><dt>Upload ID</dt><dd>{value(item.printify.uploadId)}</dd></div><div><dt>Raw provider status</dt><dd>{value(item.printify.status)}</dd></div><div><dt>Last sync</dt><dd>{item.printify.synchronizedAt ? new Date(item.printify.synchronizedAt).toLocaleString() : 'Never'}</dd></div><div><dt>Diagnostic failure</dt><dd>{value(item.printify.failure)}</dd></div></dl></details></div>
        </div>)}</article>

        <div className="admin-detail-grid">
            <article className="admin-panel"><h2>Shipping address</h2>{address ? <address>{value(address.firstName)} {value(address.lastName)}<br />{value(address.address1 || address.line1)}<br />{address.address2 || address.line2 ? <>{address.address2 || address.line2}<br /></> : null}{value(address.city)}{address.state ? `, ${address.state}` : ''} {value(address.postalCode)}<br />{value(address.countryCode)}{address.phone ? <><br />{address.phone}</> : null}</address> : <p>No shipping address stored.</p>}<h3>Shipping method</h3><p>{value(order.shippingMethod?.name)} {order.shippingMethod?.code ? `· code ${order.shippingMethod.code}` : ''}</p></article>
            <article className="admin-panel"><h2>PayPal</h2><dl className="admin-dl"><div><dt>Status</dt><dd><StatusBadge status={order.paypal.status} audience="admin" /></dd></div><div><dt>Order ID</dt><dd>{value(order.paypal.orderId)}</dd></div><div><dt>Capture ID</dt><dd>{value(order.paypal.captureId)}</dd></div><div><dt>Paid amount</dt><dd>{order.paypal.amount === undefined ? '—' : money(order.paypal.amount, order.paypal.currency || order.currency)}</dd></div><div><dt>Currency</dt><dd>{value(order.paypal.currency)}</dd></div><div><dt>Captured</dt><dd>{order.paypal.capturedAt ? new Date(order.paypal.capturedAt).toLocaleString() : '—'}</dd></div></dl></article>
            <article className="admin-panel"><h2>Production fulfillment</h2><dl className="admin-dl"><div><dt>External order ID</dt><dd>{value(order.printify.orderId)}</dd></div><div><dt>Production status</dt><dd>{statusLabel(order.printify.status, 'admin')}</dd></div><div><dt>Submitted</dt><dd>{order.printify.submittedAt ? new Date(order.printify.submittedAt).toLocaleString() : '—'}</dd></div><div><dt>Last sync</dt><dd>{order.printify.synchronizedAt ? new Date(order.printify.synchronizedAt).toLocaleString() : 'Never'}</dd></div><div><dt>Tracking</dt><dd>{order.printify.tracking?.url ? <a href={order.printify.tracking.url} target="_blank" rel="noreferrer">{order.printify.tracking.number || 'Open tracking'}</a> : value(order.printify.tracking?.number)}</dd></div></dl><details className="admin-integration-details"><summary>Internal integration details</summary><dl className="admin-dl"><div><dt>Integration</dt><dd>Printify</dd></div><div><dt>Mode</dt><dd>{order.printify.mode}</dd></div><div><dt>Printify order ID</dt><dd>{value(order.printify.orderId)}</dd></div><div><dt>Raw provider status</dt><dd>{value(order.printify.status)}</dd></div><div><dt>Diagnostic failure</dt><dd>{value(order.printify.failure)}</dd></div></dl></details></article>
        </div>

        <div className="admin-detail-grid">
            <article className="admin-panel"><h2>Add internal order note</h2><form className="admin-stack" onSubmit={submitNote}><label htmlFor="order-note">Internal note</label><textarea id="order-note" value={note} onChange={event => setNote(event.target.value)} minLength={3} maxLength={2000} required /><button disabled={working || note.trim().length < 3}>Save note</button></form><h3>Notes</h3>{order.notes.length ? order.notes.map(entry => <div className="admin-list-row" key={entry.id}><p>{entry.note}</p><small>{entry.admin || 'Admin'} · {new Date(entry.createdAt).toLocaleString()}</small></div>) : <p>No internal order notes.</p>}</article>
            <article className="admin-panel"><h2>Audit trail</h2>{order.audits.length ? order.audits.map(entry => <div className="admin-list-row" key={entry.id}><strong>{statusLabel(entry.action, 'admin')}</strong>{(entry.statusBefore || entry.statusAfter) && <span>{statusLabel(entry.statusBefore, 'admin')} → {statusLabel(entry.statusAfter, 'admin')}</span>}<small>{entry.actor || 'System'} · {new Date(entry.createdAt).toLocaleString()}</small></div>) : <p>No commerce audit events.</p>}</article>
            <article className="admin-panel"><h2>Integration webhook events</h2><details className="admin-integration-details"><summary>Internal integration details</summary>{order.webhookEvents.length ? order.webhookEvents.map(entry => <div className="admin-list-row" key={entry.id}><strong>{entry.topic}</strong><span>{entry.outcome}</span><small>{new Date(entry.createdAt).toLocaleString()}</small></div>) : <p>No matching integration webhook events yet.</p>}</details></article>
        </div>

        {confirmRetry && <ConfirmAction title="Run production action?" message="This uses the existing idempotent fulfillment service. Confirm the payment, item mapping, and current integration state before continuing." confirmLabel={order.fulfillmentStatus === 'failed' ? 'Retry production' : 'Submit to production'} tone="standard" working={working} onCancel={() => setConfirmRetry(false)} onConfirm={() => { setConfirmRetry(false); void action('retry') }} />}
    </section>
}
