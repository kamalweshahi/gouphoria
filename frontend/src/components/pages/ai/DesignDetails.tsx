import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type AIDesign from '../../../models/AIDesign'
import type Product from '../../../models/Product'
import {
    aiAssetUrl,
    aiErrorMessage,
    approveAIDesign,
    changeAIDesignVariant,
    generateAIDesign,
    getAIDesign,
    reviseAIDesign
} from '../../../services/ai'
import { getAIProducts } from '../../../services/products'
import useAuth from '../../../hooks/useAuth'
import useCart from '../../../hooks/useCart'
import './AI.css'
import LoadingState from '../../ui/loading-state/LoadingState'
import StatusBadge from '../../ui/status-badge/StatusBadge'
import { statusLabel } from '../../../utils/status-presentation'
import { createId } from '../../../utils/create-id'

export default function DesignDetails() {
    const { designId } = useParams()
    const { user, refreshUser } = useAuth()
    const { addDesign } = useCart()
    const [design, setDesign] = useState<AIDesign | null>(null)
    const [revision, setRevision] = useState('')
    const [loading, setLoading] = useState(true)
    const [working, setWorking] = useState(false)
    const [error, setError] = useState('')
    const [products, setProducts] = useState<Product[]>([])
    const [selectedProductId, setSelectedProductId] = useState('')
    const [selectedVariantId, setSelectedVariantId] = useState('')

    useEffect(() => {
        if (!designId) return
        getAIDesign(Number(designId))
            .then(setDesign)
            .catch(error => setError(aiErrorMessage(error, 'Could not load this design.')))
            .finally(() => setLoading(false))
    }, [designId])

    useEffect(() => {
        if (!design?.artwork.currentUrl || !['waiting_for_user', 'generated', 'revision_requested', 'approved', 'failed'].includes(design.status)) return
        getAIProducts().then(values => {
            setProducts(values)
            setSelectedProductId(design.product?.id ?? '')
            setSelectedVariantId(design.variant?.id ?? '')
        }).catch(() => undefined)
    }, [design?.id, design?.artwork.currentUrl, design?.product?.id, design?.variant?.id, design?.status])

    const selectedProduct = products.find(product => product.id === selectedProductId)
    const availableVariants = (selectedProduct?.variants ?? []).filter(variant => variant.isEnabled && variant.available && variant.mockupTemplateId)

    async function retryInitial() {
        if (!design) return
        setWorking(true); setError('')
        try {
            const result = await generateAIDesign(design.id, createId())
            setDesign(result.design)
            await refreshUser()
        } catch (error) {
            setError(aiErrorMessage(error, 'Generation could not be completed.'))
        } finally { setWorking(false) }
    }

    async function requestRevision() {
        if (!design) return
        setWorking(true); setError('')
        try {
            const result = await reviseAIDesign(design.id, revision, createId())
            setDesign(result.design)
            setRevision('')
            await refreshUser()
        } catch (error) {
            setError(aiErrorMessage(error, 'Revision could not be completed.'))
        } finally { setWorking(false) }
    }

    async function approve() {
        if (!design) return
        setWorking(true); setError('')
        try { setDesign(await approveAIDesign(design.id)) }
        catch (error) { setError(aiErrorMessage(error, 'Design could not be approved.')) }
        finally { setWorking(false) }
    }

    async function addToCart() {
        if (!design) return
        setWorking(true); setError('')
        try {
            await addDesign(design.id, 1)
            setDesign(await getAIDesign(design.id))
        } catch (error) { setError(aiErrorMessage(error, 'This design could not be added to your cart.')) }
        finally { setWorking(false) }
    }

    async function updateVariant() {
        if (!design || !selectedProductId || !selectedVariantId) return
        setWorking(true); setError('')
        try {
            const result = await changeAIDesignVariant(design.id, selectedProductId, selectedVariantId)
            setDesign(result.design)
        } catch (error) {
            setError(aiErrorMessage(error, 'The realistic preview could not be updated for that phone case.'))
        } finally { setWorking(false) }
    }

    if (loading) return <LoadingState label="Loading design details" />
    if (!design) return <section className="ai-page"><p className="error">{error || 'Design not found.'}</p></section>

    return (
        <section className="ai-page design-details">
            <Link to="/designs">← Back to My Designs</Link>
            <header className="ai-result-header">
                <div><span className="eyebrow">Design #{design.id}</span><h1>{design.variant?.phoneModel} · {design.variant?.caseType}</h1><p>Created {new Date(design.createdAt).toLocaleString()}</p></div>
                {design.status === 'failed' ? <span className="design-retry-label">Ready to retry</span> : <StatusBadge status={design.status} />}
            </header>

            <div className="ai-preview-grid details-preview">
                {design.artwork.originalUrl && <figure><img src={aiAssetUrl(design.artwork.originalUrl)} alt="Original printable artwork" decoding="async" /><figcaption>Original printable artwork</figcaption></figure>}
                {design.artwork.currentUrl && <figure><img src={aiAssetUrl(design.artwork.currentUrl)} alt="Current printable artwork" decoding="async" /><figcaption>Current printable artwork</figcaption></figure>}
                {design.artwork.mockupUrl && <figure><img src={aiAssetUrl(design.artwork.mockupUrl)} alt="Phone-case preview" decoding="async" /><figcaption>Preview only</figcaption></figure>}
            </div>

            {design.status === 'failed' && <section className="friendly-generation-failure" role="status"><span className="eyebrow">Your work is saved</span><h2>We couldn't finish your design.</h2><p>You haven't lost your work, and no credit was used for this failed attempt. Try again with the same idea.</p><button className="ai-primary" disabled={working || (user?.credits.balance ?? 0) < 1} onClick={() => void retryInitial()}>Try Again</button></section>}

            <div className="design-details-grid">
                <article><h2>Design brief</h2><p>Your original request is saved privately. Open the retry action above to continue without starting over.</p>{design.revisionPrompt && <><h3>Revision saved</h3><p>Your latest revision instructions are preserved.</p></>}</article>
                <article><h2>Selected product</h2>{design.product?.available === false && <p className="error">This product is no longer available for a new purchase. Your saved design remains preserved.</p>}<dl className="design-meta"><div><dt>Product</dt><dd>{design.product?.title}</dd></div><div><dt>Variant</dt><dd>{design.variant?.title}</dd></div><div><dt>Phone</dt><dd>{design.variant?.phoneModel}</dd></div><div><dt>Case type</dt><dd>{design.variant?.caseType}</dd></div></dl></article>
                <article><h2>Project usage</h2><dl className="design-meta"><div><dt>Credits used</dt><dd>{design.creditsUsed}</dd></div><div><dt>Generations</dt><dd>{design.generationCount}/2</dd></div><div><dt>Revision</dt><dd>{design.revisionAvailable ? 'Available' : 'Used or locked'}</dd></div><div><dt>Ownership</dt><dd>{design.ownershipConfirmed ? 'Confirmed' : 'Not confirmed'}</dd></div></dl></article>
            </div>

            {!!products.length && <article className="reference-panel">
                <h2>Preview on another phone case</h2>
                <p>Your printable artwork stays unchanged. Updating this preview does not use an AI credit.</p>
                <div className="ai-field-grid">
                    <div><label htmlFor="preview-product">Phone case</label><select id="preview-product" value={selectedProductId} onChange={event => { setSelectedProductId(event.target.value); setSelectedVariantId('') }} disabled={working}>{products.map(product => <option key={product.id} value={product.id}>{product.displayName || product.title}</option>)}</select></div>
                    <div><label htmlFor="preview-variant">Phone model and case type</label><select id="preview-variant" value={selectedVariantId} onChange={event => setSelectedVariantId(event.target.value)} disabled={working}><option value="">Choose an available option</option>{availableVariants.map(variant => <option key={variant.id} value={variant.id}>{variant.phoneModel} · {variant.caseType}</option>)}</select></div>
                </div>
                <button className="ai-secondary" disabled={working || !selectedVariantId || (selectedProductId === design.product?.id && selectedVariantId === design.variant?.id)} onClick={() => void updateVariant()}>Regenerate realistic preview · no credit</button>
            </article>}

            <article className="reference-panel"><h2>Private reference images</h2><div className="reference-grid">{design.uploads.map(upload => <img key={upload.id} src={aiAssetUrl(upload.url)} alt="Uploaded reference" loading="lazy" decoding="async" />)}</div></article>
            <article className="history-panel"><h2>Generation history</h2>{!design.generations.length ? <p>No completed generation yet.</p> : <ol>{design.generations.map(generation => <li key={generation.id}><strong>{generation.kind}</strong>{generation.status === 'failed' ? <span className="design-retry-label">Couldn’t finish</span> : <StatusBadge status={generation.status} />}<time>{new Date(generation.createdAt).toLocaleString()}</time></li>)}</ol>}</article>
            {!!design.commerce.length && <article className="history-panel"><h2>Order and review status</h2><ol>{design.commerce.map(entry => <li key={entry.orderItemId}><strong>{entry.orderNumber ? `Order ${entry.orderNumber}` : 'Saved in cart'}</strong><StatusBadge status={entry.reviewStatus} />{entry.paymentStatus && <small>Payment: {statusLabel(entry.paymentStatus)}</small>}{entry.customerMessage && <p><strong>Admin feedback:</strong> {entry.customerMessage}</p>}{entry.orderId && <Link to={`/orders/${entry.orderId}`}>Open order</Link>}</li>)}</ol></article>}

            {error && <p className="error" role="alert">{error}</p>}
            {(user?.credits.balance ?? 0) === 0 && <p className="credit-empty">No AI credits remain. <Link to="/credits">Buy credits to generate or revise artwork</Link>.</p>}
            <div className="ai-actions detail-actions">
                {design.generationCount === 0 && design.status !== 'failed' && <button className="ai-primary" disabled={working || (user?.credits.balance ?? 0) < 1} onClick={() => void retryInitial()}>Try Again · 1 credit if successful</button>}
                {design.artwork.currentUrl && ['waiting_for_user', 'generated'].includes(design.status) && <button className="ai-primary" disabled={working} onClick={() => void approve()}>Approve this design</button>}
                {design.status === 'approved' && <button className="ai-primary" disabled={working} onClick={() => void addToCart()}>Add customized case to cart</button>}
                {design.status === 'added_to_cart' && <Link className="ai-primary link-button" to="/cart">View customized case in cart</Link>}
                {design.revisionAvailable && <div className="revision-box"><label htmlFor="details-revision">One revision available</label><textarea id="details-revision" rows={3} maxLength={600} value={revision} onChange={event => setRevision(event.target.value)} placeholder="Describe what should change..." /><button className="ai-secondary" disabled={working || revision.trim().length < 5 || (user?.credits.balance ?? 0) < 1} onClick={() => void requestRevision()}>Generate revision · 1 credit</button></div>}
            </div>
        </section>
    )
}
