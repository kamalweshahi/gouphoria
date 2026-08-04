import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import useCart from '../../../hooks/useCart'
import type Order from '../../../models/Order'
import type ShippingQuote from '../../../models/ShippingQuote'
import { cartErrorMessage, createOrderFromCart, getShippingQuote, protectedCommerceAssetUrl } from '../../../services/cart'
import PayPalCheckout from '../../store/paypal-checkout/PayPalCheckout'
import type { PayPalCapture } from '../../../services/products'
import './CartPage.css'
import ShippingAddressForm from '../../checkout/shipping-address/ShippingAddressForm'
import { emptyShippingAddress, isShippingAddressComplete } from '../../../models/ShippingAddress'
import LoadingState from '../../ui/loading-state/LoadingState'
import EmptyState from '../../ui/empty-state/EmptyState'
import ConfirmAction from '../../ui/confirm-action/ConfirmAction'

function price(value: number, currency: string) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value)
}

export default function CartPage() {
    const { cart, loading, refresh, updateItem, removeItem, clear } = useCart()
    const [error, setError] = useState('')
    const [success, setSuccess] = useState('')
    const [completedOrder, setCompletedOrder] = useState<{ id: number; orderNumber: string; total: number; currency: string } | null>(null)
    const [busyItem, setBusyItem] = useState<number | null>(null)
    const [clearing, setClearing] = useState(false)
    const [creatingOrder, setCreatingOrder] = useState(false)
    const [checkoutOrder, setCheckoutOrder] = useState<Order | null>(null)
    const [shippingQuote, setShippingQuote] = useState<ShippingQuote | null>(null)
    const [shippingOptionId, setShippingOptionId] = useState('')
    const [shippingAddress, setShippingAddress] = useState({ ...emptyShippingAddress })
    const [confirmClear, setConfirmClear] = useState(false)

    function resetCheckout() {
        setCheckoutOrder(null)
        setShippingQuote(null)
        setShippingOptionId('')
        setSuccess('')
    }

    async function changeQuantity(itemId: number, quantity: number) {
        setBusyItem(itemId)
        setError('')
        resetCheckout()
        try {
            await updateItem(itemId, quantity)
        } catch (requestError) {
            setError(cartErrorMessage(requestError, 'Could not update this quantity.'))
        } finally {
            setBusyItem(null)
        }
    }

    async function remove(itemId: number) {
        setBusyItem(itemId)
        setError('')
        resetCheckout()
        try {
            await removeItem(itemId)
        } catch (requestError) {
            setError(cartErrorMessage(requestError, 'Could not remove this item.'))
        } finally {
            setBusyItem(null)
        }
    }

    async function empty() {
        setClearing(true)
        setError('')
        resetCheckout()
        try {
            await clear()
        } catch (requestError) {
            setError(cartErrorMessage(requestError, 'Could not clear your cart.'))
        } finally {
            setClearing(false)
        }
    }

    async function loadShipping() {
        setCreatingOrder(true)
        setError('')
        setSuccess('')
        try {
            const quote = await getShippingQuote({ shippingAddress })
            setShippingQuote(quote)
            setShippingOptionId(quote.shippingOptions.length === 1 ? quote.shippingOptions[0].id : '')
        } catch (requestError) {
            setError(cartErrorMessage(requestError, 'Could not load shipping options.'))
        } finally {
            setCreatingOrder(false)
        }
    }

    async function prepareCheckout() {
        if (!shippingQuote || !shippingOptionId) return
        setCreatingOrder(true)
        setError('')
        try {
            setCheckoutOrder(await createOrderFromCart(shippingAddress, shippingQuote.id, shippingOptionId))
        } catch (requestError) {
            setError(cartErrorMessage(requestError, 'Could not prepare checkout.'))
            setShippingQuote(null)
            setShippingOptionId('')
        } finally {
            setCreatingOrder(false)
        }
    }

    const paymentComplete = useCallback(async (capture: PayPalCapture) => {
        const includesCustom = cart?.items.some(item => item.itemType === 'ai_custom')
        await refresh()
        setCheckoutOrder(null)
        setCompletedOrder({
            id: capture.orderId,
            orderNumber: capture.orderNumber,
            total: capture.total,
            currency: capture.currency
        })
        setSuccess(includesCustom
            ? 'Payment verified. Your customized design is securely waiting for admin print review.'
            : 'Payment verified and your order was saved. Your cart is now clear.')
    }, [cart?.items, refresh])

    if (loading && !cart) return <LoadingState label="Loading your cart" />

    return (
        <section className="cart-page">
            <div className="cart-heading">
                <span className="eyebrow">Your cart</span>
                <h1>Ready when you are.</h1>
                <p>Prices and availability are checked by the backend before checkout.</p>
            </div>

            {error && <p className="error" role="alert">{error}</p>}
            {success && <div className="success" role="status">
                <strong>Payment successful.</strong> {success}
                {completedOrder && <p>Order <strong>{completedOrder.orderNumber}</strong> · verified total <strong>{price(completedOrder.total, completedOrder.currency)}</strong>.</p>}
                {completedOrder && <div className="payment-success-actions"><Link to={`/orders/${completedOrder.id}`}>View order details</Link><Link to="/products">Continue shopping</Link></div>}
            </div>}

            {!cart?.items.length ? (
                <EmptyState title="Your cart is empty" message="Choose a supported phone model and case type, or approve one of your private AI designs." action={{ label: 'Browse phone cases', to: '/products' }} />
            ) : (
                <div className="cart-layout">
                    <div className="cart-items">
                        {cart.items.map(item => (
                            <article className="cart-item" key={item.id}>
                                <div className="cart-item-image">
                                    {(item.itemType === 'ai_custom' ? protectedCommerceAssetUrl(item.mockup) : item.image) ? <img src={item.itemType === 'ai_custom' ? protectedCommerceAssetUrl(item.mockup) : item.image} alt={`${item.productTitle} — ${item.variantTitle}`} loading="lazy" decoding="async" /> : <span>Image unavailable</span>}
                                </div>
                                <div className="cart-item-copy">
                                    {item.itemType === 'ai_custom' && <span className="custom-item-badge">AI customized · preview</span>}
                                    <h2>{item.productTitle}</h2>
                                    <p>{item.phoneModel} · {item.caseType}</p>
                                    <small>{item.variantTitle}</small>
                                    <strong>{price(item.unitPrice, item.currency)} each</strong>
                                    {item.itemType === 'ai_custom' && <small>Printable AI design included</small>}
                                </div>
                                <div className="cart-item-actions">
                                    <label htmlFor={`quantity-${item.id}`}>Quantity</label>
                                    <select
                                        id={`quantity-${item.id}`}
                                        value={item.quantity}
                                        disabled={busyItem === item.id}
                                        onChange={event => void changeQuantity(item.id, Number(event.target.value))}
                                    >
                                        {Array.from({ length: 10 }, (_, index) => index + 1).map(quantity => (
                                            <option key={quantity} value={quantity}>{quantity}</option>
                                        ))}
                                    </select>
                                    <strong>{price(item.lineTotal, item.currency)}</strong>
                                    <button type="button" onClick={() => void remove(item.id)} disabled={busyItem === item.id}>Remove</button>
                                </div>
                            </article>
                        ))}
                    </div>

                    <aside className="cart-summary">
                        <h2>Order summary</h2>
                        <div><span>Items</span><strong>{cart.itemCount}</strong></div>
                        <div><span>Subtotal</span><strong>{price(cart.subtotal, cart.currency)}</strong></div>
                        <p>Product prices and shipping are verified by the server. Review every amount shown in PayPal before approving payment.</p>
                        <ShippingAddressForm
                            value={shippingAddress}
                            disabled={creatingOrder || Boolean(checkoutOrder)}
                            onChange={value => {
                                setShippingAddress(value)
                                resetCheckout()
                            }}
                        />
                        {!isShippingAddressComplete(shippingAddress) && <p className="state-message">Complete the shipping address to continue.</p>}
                        {!shippingQuote && <button type="button" className="checkout-button" onClick={() => void loadShipping()} disabled={creatingOrder || !isShippingAddressComplete(shippingAddress)}>
                            {creatingOrder ? 'Loading shipping options...' : 'Get shipping options'}
                        </button>}
                        {shippingQuote && <fieldset className="shipping-options"><legend>Shipping method</legend>{shippingQuote.shippingOptions.map(option => <label key={option.id}><input type="radio" name="cart-shipping" value={option.id} checked={shippingOptionId === option.id} onChange={() => { setShippingOptionId(option.id); setCheckoutOrder(null) }} /><span>{option.name}</span><strong>{price(option.price, option.currency)}</strong></label>)}</fieldset>}
                        {shippingQuote && shippingOptionId && (() => { const option = shippingQuote.shippingOptions.find(value => value.id === shippingOptionId)!; return <div className="verified-total"><div><span>Shipping</span><strong>{price(option.pricing.shipping, option.currency)}</strong></div><div><span>Total</span><strong>{price(option.pricing.total, option.currency)}</strong></div></div> })()}
                        {shippingQuote && <button type="button" className="checkout-button" onClick={() => void prepareCheckout()} disabled={creatingOrder || !shippingOptionId || Boolean(checkoutOrder)}>
                            {creatingOrder ? 'Preparing checkout...' : 'Continue to PayPal'}
                        </button>}
                        <button type="button" className="clear-button" onClick={() => setConfirmClear(true)} disabled={clearing}>
                            {clearing ? 'Clearing...' : 'Clear cart'}
                        </button>

                        {checkoutOrder && (
                            <div className="saved-order-checkout">
                                <p>Saved order <strong>{checkoutOrder.orderNumber}</strong></p>
                                <PayPalCheckout orderId={checkoutOrder.id} onPaymentComplete={paymentComplete} />
                            </div>
                        )}
                    </aside>
                </div>
            )}
            {confirmClear && <ConfirmAction title="Clear your cart?" message="All items will be removed from this cart. Your saved AI designs and existing orders will not be deleted." confirmLabel="Clear cart" tone="danger" working={clearing} onCancel={() => setConfirmClear(false)} onConfirm={() => { setConfirmClear(false); void empty() }} />}
        </section>
    )
}
