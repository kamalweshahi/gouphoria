import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type AIDesign from '../../../models/AIDesign'
import type Product from '../../../models/Product'
import { getAIProducts } from '../../../services/products'
import {
    aiAssetUrl,
    aiErrorMessage,
    approveAIDesign,
    createAIDesign,
    generateAIDesign,
    reviseAIDesign,
    uploadAIDesignImages
} from '../../../services/ai'
import useAuth from '../../../hooks/useAuth'
import LoadingState from '../../ui/loading-state/LoadingState'
import StatusBadge from '../../ui/status-badge/StatusBadge'
import './AI.css'

function unique(values: string[]) {
    return [...new Set(values)]
}

function phoneBrand(phoneModel: string) {
    return /samsung|galaxy/i.test(phoneModel) ? 'Samsung Galaxy' : /iphone/i.test(phoneModel) ? 'iPhone' : 'Other phones'
}

export default function CreateAI() {
    const { user, refreshUser } = useAuth()
    const [searchParams] = useSearchParams()
    const [products, setProducts] = useState<Product[]>([])
    const requestedProductId = searchParams.get('productId') ?? ''
    const [productId, setProductId] = useState(requestedProductId)
    const [phoneModel, setPhoneModel] = useState('')
    const [caseType, setCaseType] = useState('')
    const [prompt, setPrompt] = useState('')
    const [ownershipConfirmed, setOwnershipConfirmed] = useState(false)
    const [files, setFiles] = useState<File[]>([])
    const [design, setDesign] = useState<AIDesign | null>(null)
    const [revision, setRevision] = useState('')
    const [loadingCatalog, setLoadingCatalog] = useState(true)
    const [working, setWorking] = useState(false)
    const [progress, setProgress] = useState('')
    const [error, setError] = useState('')

    useEffect(() => {
        getAIProducts()
            .then(values => {
                setProducts(values)
                if (requestedProductId && !values.some(product => product.id === requestedProductId)) {
                    setError('That phone case is not currently enabled for AI customization.')
                } else if (!requestedProductId && values.length === 1) {
                    setProductId(values[0].id)
                }
            })
            .catch(error => setError(aiErrorMessage(error, 'Could not load supported phone cases.')))
            .finally(() => setLoadingCatalog(false))
    }, [requestedProductId])

    const selectedProduct = products.find(product => product.id === productId)
    const usableVariants = useMemo(
        () => (selectedProduct?.variants ?? []).filter(variant => variant.isEnabled && variant.available),
        [selectedProduct]
    )
    const phoneModels = useMemo(() => unique(usableVariants.map(variant => variant.phoneModel)), [usableVariants])
    const phoneModelGroups = useMemo(() => {
        const groups = new Map<string, string[]>()
        for (const model of phoneModels) groups.set(phoneBrand(model), [...(groups.get(phoneBrand(model)) ?? []), model])
        return [...groups.entries()]
    }, [phoneModels])
    const caseTypes = useMemo(
        () => unique(usableVariants.filter(variant => variant.phoneModel === phoneModel).map(variant => variant.caseType)),
        [usableVariants, phoneModel]
    )
    const selectedVariant = usableVariants.find(variant => variant.phoneModel === phoneModel && variant.caseType === caseType)

    function changeProduct(value: string) {
        setProductId(value)
        setPhoneModel('')
        setCaseType('')
    }

    function changePhoneModel(value: string) {
        setPhoneModel(value)
        const types = unique(usableVariants.filter(variant => variant.phoneModel === value).map(variant => variant.caseType))
        setCaseType(types.length === 1 ? types[0] : '')
    }

    function chooseFiles(fileList: FileList | null) {
        const next = Array.from(fileList ?? [])
        setFiles(next.slice(0, 2))
        setError(next.length > 2 ? 'Choose no more than two reference images.' : '')
    }

    async function submit(event: FormEvent) {
        event.preventDefault()
        if (!selectedVariant || files.length < 1 || files.length > 2) {
            setError('Choose a valid phone case and one or two reference images.')
            return
        }
        setWorking(true)
        setError('')
        try {
            setProgress('Saving your AI project...')
            let next = await createAIDesign({ productId, variantId: selectedVariant.id, prompt, ownershipConfirmed })
            setDesign(next)
            setProgress('Uploading and validating your private reference images...')
            next = await uploadAIDesignImages(next.id, files)
            setDesign(next)
            setProgress('Generating printable artwork. This may take a minute...')
            const result = await generateAIDesign(next.id, crypto.randomUUID())
            setDesign(result.design)
            await refreshUser()
            setProgress('Artwork ready for review.')
        } catch (error) {
            setError(aiErrorMessage(error, 'The design could not be generated. Your project and uploads remain saved.'))
            setProgress('')
        } finally {
            setWorking(false)
        }
    }

    async function retryInitial() {
        if (!design) return
        setWorking(true)
        setError('')
        setProgress('Retrying the initial artwork...')
        try {
            const result = await generateAIDesign(design.id, crypto.randomUUID())
            setDesign(result.design)
            await refreshUser()
            setProgress('Artwork ready for review.')
        } catch (error) {
            setError(aiErrorMessage(error, 'The design could not be generated. No duplicate credit was used.'))
            setProgress('')
        } finally {
            setWorking(false)
        }
    }

    async function requestRevision() {
        if (!design) return
        setWorking(true)
        setError('')
        setProgress('Applying your one included revision...')
        try {
            const result = await reviseAIDesign(design.id, revision, crypto.randomUUID())
            setDesign(result.design)
            setRevision('')
            await refreshUser()
            setProgress('Revised artwork ready for review.')
        } catch (error) {
            setError(aiErrorMessage(error, 'The revision could not be completed.'))
            setProgress('')
        } finally {
            setWorking(false)
        }
    }

    async function approve() {
        if (!design) return
        setWorking(true)
        setError('')
        try {
            setDesign(await approveAIDesign(design.id))
            setProgress('Design approved and saved in My Designs.')
        } catch (error) {
            setError(aiErrorMessage(error, 'The design could not be approved.'))
        } finally {
            setWorking(false)
        }
    }

    if (loadingCatalog) return <LoadingState label="Loading supported phone cases" />

    return (
        <section className="ai-page">
            <header className="ai-heading">
                <span className="eyebrow">AI phone-case studio</span>
                <h1>Create Your Phone Case with AI</h1>
                <p>Choose an available case option, add private visual references, and create printable artwork with one included revision.</p>
                <div className="credit-pill">{user?.credits.balance ?? 0} AI credits available</div>
                {(user?.credits.balance ?? 0) === 0 && <p className="credit-empty">You are out of AI credits. <Link to="/credits">Buy credits to continue</Link>.</p>}
            </header>

            {!design?.artwork.currentUrl && (
                <form className="ai-builder" onSubmit={submit} noValidate>
                    <div className="ai-step"><strong>1</strong><span>Choose your phone case</span></div>
                    {!products.length ? <p className="state-message">No phone cases are currently enabled for AI customization.</p> : <div className="ai-product-picker" role="radiogroup" aria-label="AI-customizable phone case">{products.map(product => <button key={product.id} type="button" role="radio" aria-checked={product.id === productId} className={product.id === productId ? 'selected' : ''} onClick={() => changeProduct(product.id)}>{product.image ? <img src={product.image} alt="" loading="lazy" /> : <span className="ai-product-placeholder">Phone case</span>}<span><b>{product.displayName || product.title}</b><small>From {new Intl.NumberFormat('en-US', { style: 'currency', currency: product.currency }).format(product.price ?? 0)}</small><small>{product.phoneModels.slice(0, 3).join(' · ')}{product.phoneModels.length > 3 ? ` +${product.phoneModels.length - 3}` : ''}</small></span><em>AI Custom</em></button>)}</div>}
                    {selectedProduct && <p className="ai-catalog-note"><strong>{phoneModels.length} phone models available.</strong> Choose the exact model so its matching shell and camera frame are used in your preview.</p>}
                    <div className="ai-field-grid">
                        <div>
                            <label htmlFor="ai-phone-model">Phone model</label>
                            <select id="ai-phone-model" value={phoneModel} onChange={event => changePhoneModel(event.target.value)} disabled={!selectedProduct} required>
                                <option value="">Select phone model</option>
                                {phoneModelGroups.map(([brand, models]) => <optgroup key={brand} label={brand}>{models.map(model => <option key={model}>{model}</option>)}</optgroup>)}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="ai-case-type">Case type</label>
                            <select id="ai-case-type" value={caseType} onChange={event => setCaseType(event.target.value)} disabled={!phoneModel} required>
                                <option value="">Select case type</option>
                                {caseTypes.map(type => <option key={type}>{type}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="ai-step"><strong>2</strong><span>Add one or two reference images</span></div>
                    <label className="upload-zone" htmlFor="ai-images">
                        <span>{files.length ? `${files.length} image${files.length === 1 ? '' : 's'} selected` : 'Choose PNG, JPG, JPEG, or WEBP images'}</span>
                        <small>Private · maximum two files · up to 8 MB each</small>
                    </label>
                    <input id="ai-images" className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" multiple onChange={event => chooseFiles(event.target.files)} required />
                    {files.length > 0 && <ul className="file-list">{files.map(file => <li key={`${file.name}-${file.size}`}>{file.name}</li>)}</ul>}

                    <div className="ai-step"><strong>3</strong><span>Describe your artwork</span></div>
                    <label htmlFor="ai-prompt">Design prompt</label>
                    <textarea id="ai-prompt" value={prompt} onChange={event => setPrompt(event.target.value)} minLength={12} maxLength={1000} rows={6} placeholder="Example: A dreamy midnight garden with silver moths and deep blue flowers, elegant hand-painted style..." required />
                    <div className="prompt-count">{prompt.length}/1000</div>

                    <label className="rights-confirmation">
                        <input type="checkbox" checked={ownershipConfirmed} onChange={event => setOwnershipConfirmed(event.target.checked)} />
                        <span>I confirm that I own the rights to upload and use these images.</span>
                    </label>

                    <div className="ai-cost-note"><strong>Initial generation:</strong> 1 AI credit. Your project stays saved if generation fails.</div>
                    {error && <p className="error" role="alert">{error}</p>}
                    {progress && <p className="ai-progress" aria-live="polite">{progress}</p>}
                    <button className="ai-primary" type="submit" disabled={working || !selectedVariant || files.length < 1 || !ownershipConfirmed || prompt.trim().length < 12 || (user?.credits.balance ?? 0) < 1}>
                        {working ? 'Creating your artwork...' : 'Generate initial artwork · 1 credit'}
                    </button>
                    {design && design.generationCount === 0 && <button className="ai-secondary" type="button" disabled={working} onClick={() => void retryInitial()}>Retry saved project</button>}
                </form>
            )}

            {design?.artwork.currentUrl && (
                <section className="ai-result">
                    <div className="ai-result-header">
                        <div><span className="eyebrow">Your result</span><h2>Review the artwork and preview</h2></div>
                        <StatusBadge status={design.status} />
                    </div>
                    <div className="ai-preview-grid">
                        <figure>
                            <img src={aiAssetUrl(design.artwork.currentUrl)} alt="Current printable artwork" decoding="async" />
                            <figcaption>Printable artwork</figcaption>
                        </figure>
                        <figure>
                            <img src={aiAssetUrl(design.artwork.mockupUrl)} alt={`${design.variant?.phoneModel ?? 'Phone'} case preview`} decoding="async" />
                            <figcaption>Preview only · not the print file</figcaption>
                        </figure>
                    </div>
                    <dl className="ai-summary">
                        <div><dt>Phone model</dt><dd>{design.variant?.phoneModel}</dd></div>
                        <div><dt>Case type</dt><dd>{design.variant?.caseType}</dd></div>
                        <div><dt>Credits used</dt><dd>{design.creditsUsed}</dd></div>
                        <div><dt>Revision</dt><dd>{design.revisionAvailable ? 'Available' : 'Used or locked'}</dd></div>
                    </dl>
                    {design.status !== 'approved' && <div className="ai-actions">
                        <button className="ai-primary" type="button" disabled={working} onClick={() => void approve()}>Approve this design</button>
                        {design.revisionAvailable && <div className="revision-box">
                            <label htmlFor="ai-revision">Request your one revision</label>
                            <textarea id="ai-revision" value={revision} onChange={event => setRevision(event.target.value)} minLength={5} maxLength={600} rows={3} placeholder="Describe only what should change..." />
                            <button className="ai-secondary" type="button" disabled={working || revision.trim().length < 5 || (user?.credits.balance ?? 0) < 1} onClick={() => void requestRevision()}>Generate revision · 1 credit</button>
                        </div>}
                    </div>}
                    {error && <p className="error" role="alert">{error}</p>}
                    {progress && <p className="ai-progress" aria-live="polite">{progress}</p>}
                    <div className="ai-result-links"><Link to={`/designs/${design.id}`}>Open full design details</Link><Link to="/designs">View My Designs</Link></div>
                </section>
            )}
        </section>
    )
}
