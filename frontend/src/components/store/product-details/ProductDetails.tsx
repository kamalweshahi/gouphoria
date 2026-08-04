import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import type Product from '../../../models/Product'
import type ShippingQuote from '../../../models/ShippingQuote'
import { getOneProduct } from '../../../services/products'
import PayPalCheckout from '../paypal-checkout/PayPalCheckout'
import useAuth from '../../../hooks/useAuth'
import useCart from '../../../hooks/useCart'
import { cartErrorMessage } from '../../../services/cart'
import ShippingAddressForm from '../../checkout/shipping-address/ShippingAddressForm'
import { emptyShippingAddress, isShippingAddressComplete } from '../../../models/ShippingAddress'
import './ProductDetails.css'
import LoadingState from '../../ui/loading-state/LoadingState'
import EmptyState from '../../ui/empty-state/EmptyState'
import StatusBadge from '../../ui/status-badge/StatusBadge'
import { getShippingQuote } from '../../../services/cart'

function formatPrice(product: Product) {
    if (product.price === null) return 'Select an option'
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: product.currency || 'USD'
    }).format(product.price)
}

function formatVariantPrice(price: number, currency = 'USD') {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(price)
}

function unique(values: string[]) {
    return [...new Set(values)]
}

export default function ProductDetails() {
    const { productId } = useParams()
    const { user } = useAuth()
    const { addItem } = useCart()
    const navigate = useNavigate()
    const location = useLocation()
    const [product, setProduct] = useState<Product | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [selectedPhoneModel, setSelectedPhoneModel] = useState('')
    const [selectedCaseType, setSelectedCaseType] = useState('')
    const [cartMessage, setCartMessage] = useState('')
    const [cartError, setCartError] = useState('')
    const [adding, setAdding] = useState(false)
    const [shippingAddress, setShippingAddress] = useState({ ...emptyShippingAddress, email: user?.email ?? '' })
    const [quantity, setQuantity] = useState(1)
    const [selectedImage, setSelectedImage] = useState('')
    const [shippingQuote, setShippingQuote] = useState<ShippingQuote | null>(null)
    const [shippingOptionId, setShippingOptionId] = useState('')
    const [shippingLoading, setShippingLoading] = useState(false)

    function invalidateShipping() {
        setShippingQuote(null)
        setShippingOptionId('')
    }

    useEffect(() => {
        if (!productId) return

        getOneProduct(productId)
            .then(setProduct)
            .catch((err) => setError(err.response?.data?.message || 'Could not load product.'))
            .finally(() => setLoading(false))
    }, [productId])

    const enabledVariants = useMemo(
        () => (product?.variants ?? []).filter(variant => variant.isEnabled),
        [product]
    )
    const phoneModels = useMemo(
        () => unique(enabledVariants.map(variant => variant.phoneModel)),
        [enabledVariants]
    )
    const caseTypesForModel = useMemo(
        () => unique(enabledVariants
            .filter(variant => variant.phoneModel === selectedPhoneModel)
            .map(variant => variant.caseType)),
        [enabledVariants, selectedPhoneModel]
    )
    const selectedVariant = useMemo(() => {
        const matches = enabledVariants.filter(variant =>
            variant.phoneModel === selectedPhoneModel && variant.caseType === selectedCaseType
        )
        return matches.find(variant => variant.available) ?? matches[0]
    }, [enabledVariants, selectedPhoneModel, selectedCaseType])
    const galleryImages = useMemo(() => unique([
        selectedVariant?.image ?? '',
        product?.image ?? '',
        ...(product?.images ?? []).map(image => image.src ?? '')
    ].filter(Boolean)), [product, selectedVariant])

    const effectiveImage = selectedImage || selectedVariant?.image || product?.image || galleryImages[0] || ''
    const canDirectPurchase = product?.allowDirectPurchase !== false && !product?.aiCustomOnly

    function selectPhoneModel(phoneModel: string) {
        setSelectedPhoneModel(phoneModel)
        setSelectedImage('')
        invalidateShipping()
        const types = unique(enabledVariants
            .filter(variant => variant.phoneModel === phoneModel)
            .map(variant => variant.caseType))
        const onlyVariant = enabledVariants.find(variant =>
            variant.phoneModel === phoneModel && variant.caseType === types[0] && variant.available
        )
        setSelectedCaseType(types.length === 1 && onlyVariant ? types[0] : '')
    }

    async function loadShippingOptions() {
        if (!product || !selectedVariant || !isShippingAddressComplete(shippingAddress)) return
        setShippingLoading(true)
        setError('')
        try {
            const quote = await getShippingQuote({
                shippingAddress,
                productId: product.id,
                variantId: selectedVariant.id,
                quantity: 1
            })
            setShippingQuote(quote)
            setShippingOptionId(quote.shippingOptions.length === 1 ? quote.shippingOptions[0].id : '')
        } catch (requestError) {
            setError(cartErrorMessage(requestError, 'Could not load shipping options.'))
        } finally {
            setShippingLoading(false)
        }
    }

    async function addSelectedToCart() {
        if (!selectedVariant?.available || !product) return
        if (!user) {
            navigate('/login', { state: { from: location.pathname } })
            return
        }
        setAdding(true)
        setCartMessage('')
        setCartError('')
        try {
            await addItem(product.id, selectedVariant.id, quantity)
            setCartMessage(`${quantity} ${quantity === 1 ? 'case' : 'cases'} added to your cart.`)
        } catch (error) {
            setCartError(cartErrorMessage(error, 'Could not add this phone case to your cart.'))
        } finally {
            setAdding(false)
        }
    }

    if (loading) return <LoadingState label="Loading phone case" />
    if (error) return <p className="error">{error}</p>
    if (!product) return <EmptyState title="Phone case not found" message="This product may no longer be available in the connected catalog." action={{ label: 'Return to the catalog', to: '/products' }} />

    return (
        <section className="product-details-page">
            <Link to="/products" className="back-link">← Back to products</Link>

            <div className="product-details-card">
                <div className="details-gallery">
                    <div className="details-image-wrap">
                        {effectiveImage
                            ? <img src={effectiveImage} alt={`${product.title}${selectedVariant ? ` — ${selectedVariant.title}` : ''}`} decoding="async" />
                            : <div className="image-placeholder">Image unavailable</div>}
                    </div>
                    {galleryImages.length > 1 && <div className="gallery-thumbnails" aria-label="Product images">{galleryImages.slice(0, 5).map((image, index) => <button type="button" className={effectiveImage === image ? 'selected' : ''} key={image} onClick={() => setSelectedImage(image)} aria-label={`Show product image ${index + 1}`} aria-pressed={effectiveImage === image}><img src={image} alt="" loading="lazy" decoding="async" /></button>)}</div>}
                </div>

                <div className="details-info">
                    <p className="product-category">{product.storefrontCategory || 'Phone case'}</p>
                    <h1>{product.displayName || product.title}</h1>
                    <p>{product.description || 'A custom phone case available in supported models.'}</p>
                    <div className="fulfillment-assurance"><span>Secure payment with PayPal</span><span>Made to order</span><span>Model-specific fit</span></div>
                    {product.allowAiCustomization && <div className="ai-product-callout"><StatusBadge status="AI Custom" /><p>{product.aiCustomOnly ? 'This case must be customized with finalized artwork before purchase.' : 'Make this case personal with the guided AI design studio.'}</p><Link className="ai-design-button" to={`/create-ai?productId=${encodeURIComponent(product.id)}`}>{product.aiCustomOnly ? 'Start designing' : 'Customize with AI'}</Link></div>}

                    <div className="details-meta">
                        <strong>{selectedVariant
                            ? formatVariantPrice(selectedVariant.price, selectedVariant.currency)
                            : `${formatPrice(product)}${product.price === null ? '' : ' starting price'}`}</strong>
                        <span>{product.variantsCount} variants</span>
                    </div>

                    <div className="variant-selector" aria-label="Phone case options">
                        <div>
                            <label htmlFor="phone-model">Phone model</label>
                            <select
                                id="phone-model"
                                value={selectedPhoneModel}
                                onChange={event => selectPhoneModel(event.target.value)}
                            >
                                <option value="">Select your phone model</option>
                                {phoneModels.map(phoneModel => {
                                    const hasAvailableVariant = enabledVariants.some(variant =>
                                        variant.phoneModel === phoneModel && variant.available
                                    )
                                    return <option key={phoneModel} value={phoneModel} disabled={!hasAvailableVariant}>{phoneModel}</option>
                                })}
                            </select>
                        </div>

                        {selectedPhoneModel && caseTypesForModel.length > 1 && (
                            <div>
                                <label htmlFor="case-type">Case type</label>
                                <select
                                    id="case-type"
                                    value={selectedCaseType}
                                    onChange={event => { setSelectedCaseType(event.target.value); setSelectedImage(''); invalidateShipping() }}
                                >
                                    <option value="">Select a case type</option>
                                    {caseTypesForModel.map(caseType => {
                                        const available = enabledVariants.some(variant =>
                                            variant.phoneModel === selectedPhoneModel
                                            && variant.caseType === caseType
                                            && variant.available
                                        )
                                        return <option key={caseType} value={caseType} disabled={!available}>{caseType}</option>
                                    })}
                                </select>
                            </div>
                        )}

                        {selectedPhoneModel && caseTypesForModel.length === 1 && (
                            <p><b>Case type:</b> {caseTypesForModel[0]}</p>
                        )}

                        {selectedVariant && <div className="variant-selection-status"><StatusBadge status={selectedVariant.available ? 'active' : 'disabled'} /><span>{selectedVariant.available ? `${selectedVariant.title} is available.` : `${selectedVariant.title} is currently unavailable.`}</span></div>}
                    </div>

                    {canDirectPurchase && <div className="cart-architecture-box">
                        <h3>Add to cart</h3>
                        <p>Your exact phone model, case type, and current verified price will be saved in your account cart.</p>
                        <label className="quantity-field" htmlFor="product-quantity">Quantity<select id="product-quantity" value={quantity} onChange={event => setQuantity(Number(event.target.value))}>{Array.from({ length: 10 }, (_, index) => index + 1).map(value => <option key={value} value={value}>{value}</option>)}</select></label>
                        <button
                            type="button"
                            className="add-cart-button"
                            disabled={!selectedVariant?.available || adding}
                            onClick={() => void addSelectedToCart()}
                        >
                            {adding ? 'Adding...' : user ? (product.allowAiCustomization ? 'Buy this design' : 'Add to cart') : 'Log in to add to cart'}
                        </button>
                        {cartMessage && <p className="success">{cartMessage} <Link to="/cart">View cart</Link></p>}
                        {cartError && <p className="error" role="alert">{cartError}</p>}
                    </div>}

                    {canDirectPurchase && <div className="checkout-box">
                        <h2>Pay for this product</h2>
                        <p>Direct checkout purchases one case. Use the cart above to order a larger quantity or combine items.</p>
                        {user ? (
                            <>
                                <ShippingAddressForm value={shippingAddress} onChange={value => { setShippingAddress(value); invalidateShipping() }} disabled={shippingLoading} />
                                {!isShippingAddressComplete(shippingAddress) && <p className="state-message">Complete the shipping address before payment.</p>}
                                {!shippingQuote && <button type="button" className="shipping-quote-button" onClick={() => void loadShippingOptions()} disabled={shippingLoading || !selectedVariant?.available || !isShippingAddressComplete(shippingAddress)}>{shippingLoading ? 'Loading shipping options...' : 'Get shipping options'}</button>}
                                {shippingQuote && <fieldset className="shipping-options"><legend>Shipping method</legend>{shippingQuote.shippingOptions.map(option => <label key={option.id}><input type="radio" name="direct-shipping" value={option.id} checked={shippingOptionId === option.id} onChange={() => setShippingOptionId(option.id)} /><span>{option.name}</span><strong>{formatVariantPrice(option.price, option.currency)}</strong></label>)}</fieldset>}
                                {shippingQuote && shippingOptionId && (() => { const option = shippingQuote.shippingOptions.find(value => value.id === shippingOptionId)!; return <div className="checkout-price-summary"><div><span>Product</span><strong>{formatVariantPrice(option.pricing.subtotal, option.currency)}</strong></div><div><span>Shipping</span><strong>{formatVariantPrice(option.pricing.shipping, option.currency)}</strong></div><div><span>Total</span><strong>{formatVariantPrice(option.pricing.total, option.currency)}</strong></div></div> })()}
                                {shippingQuote && <PayPalCheckout
                                    productId={product.id}
                                    variantId={selectedVariant?.id}
                                    shippingAddress={shippingAddress}
                                    shippingQuoteId={shippingQuote.id}
                                    shippingOptionId={shippingOptionId}
                                    disabled={!selectedVariant || !selectedVariant.available || !isShippingAddressComplete(shippingAddress) || !shippingOptionId}
                                    selectionPrompt={selectedPhoneModel && caseTypesForModel.length > 1
                                        ? 'Select a case type to continue to PayPal.'
                                        : undefined}
                                />}
                            </>
                        ) : <p className="state-message"><Link to="/login" state={{ from: location.pathname }}>Log in</Link> to use checkout.</p>}
                    </div>}
                </div>
            </div>
        </section>
    )
}
