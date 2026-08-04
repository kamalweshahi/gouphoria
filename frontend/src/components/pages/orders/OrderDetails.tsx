import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type Order from '../../../models/Order'
import { cartErrorMessage, getOrder, protectedCommerceAssetUrl } from '../../../services/cart'
import './OrderDetails.css'
import StatusBadge from '../../ui/status-badge/StatusBadge'
import LoadingState from '../../ui/loading-state/LoadingState'
import { recoverPayPalOrder } from '../../../services/products'
import { customerOrderStatus, orderKind, orderTimeline, phoneBrand, statusLabel } from '../../../utils/status-presentation'

function price(value: number, currency: string) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value)
}

export default function OrderDetails() {
    const { orderId } = useParams()
    const [order, setOrder] = useState<Order | null>(null)
    const [error, setError] = useState('')
    const [recoveryMessage, setRecoveryMessage] = useState('')
    const [recovering, setRecovering] = useState(false)

    useEffect(() => {
        if (!orderId) return
        getOrder(Number(orderId))
            .then(setOrder)
            .catch(requestError => setError(cartErrorMessage(requestError, 'Could not load this order.')))
    }, [orderId])

    if (error) return <p className="error" role="alert">{error}</p>
    if (!order) return <LoadingState label="Loading order details" />

    const address = order.shippingAddress
    const timeline = orderTimeline(order)
    async function recoverPayment(targetOrder: Order) {
        if (!targetOrder.paypalOrderId || recovering) return
        setRecovering(true)
        setError('')
        setRecoveryMessage('Checking PayPal for a completed payment…')
        try {
            const result = await recoverPayPalOrder(targetOrder.paypalOrderId, targetOrder.id)
            if (result.paymentStatus === 'captured') {
                setOrder(await getOrder(targetOrder.id))
                setRecoveryMessage(`Payment verified for ${result.orderNumber}.`)
            } else {
                setRecoveryMessage('PayPal has not completed this payment. Return to the original PayPal approval window or retry later; do not create a second payment.')
            }
        } catch (requestError) {
            setRecoveryMessage(cartErrorMessage(requestError, 'Payment status could not be recovered yet. No second payment was created; retry shortly.'))
        } finally {
            setRecovering(false)
        }
    }

    return (
        <section className="order-details-page">
            <Link to="/orders" className="back-link">← Back to order history</Link>
            <div className="order-details-heading">
                <span className="eyebrow">Order details</span>
                <h1>{order.orderNumber}</h1>
                <p>Created {new Date(order.createdAt).toLocaleString()} · {orderKind(order.items)} · {order.items.reduce((sum, item) => sum + item.quantity, 0)} items</p>
                <div className="order-heading-statuses">
                    <StatusBadge status={customerOrderStatus(order)} prefix="Order" />
                    <StatusBadge status={order.paymentStatus} prefix="Payment" />
                </div>
            </div>

            <div className="order-details-grid">
                <article className="order-items-card">
                    <h2>Items</h2>
                    {order.items.map(item => (
                        <div className="order-detail-item" key={item.id}>
                            {(item.itemType === 'ai_custom' ? item.mockup : item.image) && <img src={item.itemType === 'ai_custom' ? protectedCommerceAssetUrl(item.mockup) : item.image} alt={`${item.productTitle} — ${item.variantTitle}`} loading="lazy" decoding="async" />}
                            <div className="order-item-copy">
                                <span className="custom-order-badge">{item.itemType === 'ai_custom' ? 'AI customized' : 'Standard case'}</span>
                                <strong>{item.productTitle}</strong>
                                <dl className="order-item-specs">
                                    <div><dt>Phone brand</dt><dd>{phoneBrand(item.phoneModel)}</dd></div>
                                    <div><dt>Phone model</dt><dd>{item.phoneModel || 'Not specified'}</dd></div>
                                    <div><dt>Case type</dt><dd>{item.caseType || 'Not specified'}</dd></div>
                                    <div><dt>Variant</dt><dd>{item.variantTitle}</dd></div>
                                    <div><dt>Quantity</dt><dd>{item.quantity}</dd></div>
                                    <div><dt>Unit price</dt><dd>{price(item.unitPrice, item.currency)}</dd></div>
                                    <div><dt>Item total</dt><dd>{price(item.lineTotal, item.currency)}</dd></div>
                                </dl>
                                <div className="item-status-breakdown" aria-label={`${item.productTitle} status`}>
                                    <StatusBadge status={order.paymentStatus} prefix="Payment" />
                                    {item.itemType === 'ai_custom' && <StatusBadge status={item.status} prefix="Design" />}
                                    <StatusBadge status={item.status} prefix="Fulfillment" />
                                </div>
                                {item.itemType === 'ai_custom' && <>
                                    <p className="approved-artwork-indicator">{item.status === 'approved_for_print' ? '✓ Approved artwork is locked for production.' : 'Artwork will not enter production until review is complete.'}</p>
                                    {item.reviewMessage && <p className="customer-review-message"><strong>Design feedback:</strong> {item.reviewMessage}</p>}
                                    {item.aiDesignId && <Link to={`/designs/${item.aiDesignId}`}>View design and feedback</Link>}
                                </>}
                            </div>
                        </div>
                    ))}
                </article>
                <article className="order-timeline-card">
                    <h2>Order timeline</h2>
                    <ol className="order-timeline">
                        {timeline.map((step, index) => <li className={`timeline-${step.state}`} key={`${step.label}-${index}`}>
                            <span className="timeline-marker" aria-hidden="true" />
                            <div><strong>{step.label}</strong>{step.detail && <small>{step.detail}</small>}</div>
                        </li>)}
                    </ol>
                    <p className="fulfillment-provider-note">{order.productionStarted ? 'This order has been submitted for production.' : order.paymentStatus === 'captured' ? 'Payment is complete; production is awaiting its next valid processing step.' : 'Production begins only after verified payment and any required design review.'}</p>
                    {order.fulfillmentSummary?.partial && <p className="fulfillment-provider-note"><strong>Partially fulfilled:</strong> each item’s status above is authoritative while the remaining items continue through review or production.</p>}
                    {order.paypalOrderId && order.paymentStatus !== 'captured' && order.status === 'pending' && <>
                        <button type="button" className="payment-recovery-button" disabled={recovering} onClick={() => void recoverPayment(order)}>
                            {recovering ? 'Checking PayPal…' : 'Retry payment recovery'}
                        </button>
                        {recoveryMessage && <p className="fulfillment-provider-note" role="status">{recoveryMessage}</p>}
                    </>}
                    {order.fulfillmentFailure && <p className="error">{order.fulfillmentFailure}</p>}
                </article>
                <article>
                    <h2>Shipping address</h2>
                    {address ? <address>
                        {address.firstName} {address.lastName}<br />
                        {address.address1}<br />
                        {address.address2 && <>{address.address2}<br /></>}
                        {address.city}{address.state ? `, ${address.state}` : ''} {address.postalCode}<br />
                        {address.countryCode}<br />
                        {address.email}<br />{address.phone}
                    </address> : <p>No shipping address is stored.</p>}
                </article>
                <article>
                    <h2>Totals</h2>
                    <dl>
                        <div><dt>Subtotal</dt><dd>{price(order.subtotal, order.currency)}</dd></div>
                        <div><dt>Shipping</dt><dd>{price(order.shippingAmount, order.currency)}</dd></div>
                        {order.shippingMethod?.name && <div><dt>Method</dt><dd>{order.shippingMethod.name}</dd></div>}
                        {order.taxAmount > 0 && <div><dt>Tax</dt><dd>{price(order.taxAmount, order.currency)}</dd></div>}
                        <div><dt>Total</dt><dd><strong>{price(order.total, order.currency)}</strong></dd></div>
                        <div><dt>Payment</dt><dd>{statusLabel(order.paymentStatus)}</dd></div>
                        {order.paypalOrderId && <div><dt>PayPal reference</dt><dd className="reference-value">{order.paypalOrderId}</dd></div>}
                    </dl>
                </article>
                {order.tracking && (
                    <article className="tracking-card">
                        <h2>Tracking</h2>
                        {order.tracking.carrier && <p>Carrier: {order.tracking.carrier}</p>}
                        <p>Tracking number: {order.tracking.number}</p>
                        {order.tracking.url && <a href={order.tracking.url} target="_blank" rel="noreferrer">Track shipment</a>}
                    </article>
                )}
            </div>
        </section>
    )
}
