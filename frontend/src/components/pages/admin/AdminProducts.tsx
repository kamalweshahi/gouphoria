import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { AdminProduct, AdminProductDeletionPlan } from '../../../models/AdminManagement'
import { adminErrorMessage, deleteAdminProduct, getAdminProductDeletionPlan, getAdminProducts, syncAdminCatalog, updateAdminProduct } from '../../../services/admin'
import LoadingState from '../../ui/loading-state/LoadingState'
import StatusBadge from '../../ui/status-badge/StatusBadge'
import ConfirmAction from '../../ui/confirm-action/ConfirmAction'
import ProductDeleteDialog from './ProductDeleteDialog'
import './Admin.css'

export default function AdminProducts() {
    const [products, setProducts] = useState<AdminProduct[]>([])
    const [selectedId, setSelectedId] = useState<number | null>(null)
    const [draft, setDraft] = useState<AdminProduct | null>(null)
    const [productSearch, setProductSearch] = useState('')
    const [variantSearch, setVariantSearch] = useState('')
    const [variantState, setVariantState] = useState('')
    const [templateState, setTemplateState] = useState('')
    const [error, setError] = useState('')
    const [success, setSuccess] = useState('')
    const [working, setWorking] = useState(false)
    const [syncing, setSyncing] = useState(false)
    const [confirmSave, setConfirmSave] = useState(false)
    const [deletePlan, setDeletePlan] = useState<AdminProductDeletionPlan | null>(null)
    const [deleting, setDeleting] = useState(false)
    const [checkingDelete, setCheckingDelete] = useState(false)

    async function loadProducts(preferredId?: number) {
        const values = await getAdminProducts()
        setProducts(values)
        const selected = values.find(product => product.databaseId === (preferredId ?? selectedId)) ?? values[0]
        if (selected) { setSelectedId(selected.databaseId); setDraft(structuredClone(selected)) }
    }

    useEffect(() => {
        let cancelled = false
        void getAdminProducts().then(values => {
            if (cancelled) return
            setProducts(values)
            if (values[0]) { setSelectedId(values[0].databaseId); setDraft(structuredClone(values[0])) }
        }).catch(loadError => { if (!cancelled) setError(adminErrorMessage(loadError, 'Could not load product controls.')) })
        return () => { cancelled = true }
    }, [])

    const filteredProducts = products.filter(product => {
        const query = productSearch.trim().toLowerCase()
        return !query || [product.displayName, product.printifyTitle, product.printifyProductId].some(value => value?.toLowerCase().includes(query))
    })

    const groupedVariants = useMemo(() => {
        if (!draft) return []
        const query = variantSearch.trim().toLowerCase()
        const filtered = draft.variants.filter(variant => {
            const matchesSearch = !query || [variant.phoneModel, variant.caseType, variant.title, variant.printifyVariantId].some(value => value?.toLowerCase().includes(query))
            const matchesState = !variantState
                || variantState === 'available' && variant.available && variant.providerEnabled && variant.storefrontEnabled
                || variantState === 'disabled' && variant.storefrontEnabled === false
                || variantState === 'provider-unavailable' && (!variant.available || !variant.providerEnabled)
            const matchesTemplate = !templateState
                || templateState === 'supported' && Boolean(variant.mockupTemplateId)
                || templateState === 'unsupported' && !variant.mockupTemplateId
            return matchesSearch && matchesState && matchesTemplate
        })
        const groups = new Map<string, typeof filtered>()
        for (const variant of filtered) {
            const values = groups.get(variant.phoneModel) ?? []
            values.push(variant)
            groups.set(variant.phoneModel, values)
        }
        return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
    }, [draft, templateState, variantSearch, variantState])

    function select(product: AdminProduct) {
        setSelectedId(product.databaseId); setDraft(structuredClone(product)); setError(''); setSuccess('')
    }
    function field<K extends keyof AdminProduct>(key: K, value: AdminProduct[K]) {
        if (draft) setDraft({ ...draft, [key]: value })
    }
    function requestSave(event: FormEvent) {
        event.preventDefault()
        if (!draft) return
        const original = products.find(product => product.databaseId === draft.databaseId)
        const disablesProduct = Boolean(original && (original.isVisible !== false && draft.isVisible === false || original.isActive !== false && draft.isActive === false))
        const disablesVariant = Boolean(original && draft.variants.some(variant => {
            const previous = original.variants.find(value => value.id === variant.id)
            return previous?.storefrontEnabled !== false && variant.storefrontEnabled === false
        }))
        if (disablesProduct || disablesVariant) setConfirmSave(true)
        else void save()
    }
    async function save() {
        if (!draft) return
        setWorking(true); setError(''); setSuccess('')
        try {
            const updated = await updateAdminProduct(draft.databaseId, {
                displayName: draft.displayName || null, shortDescription: draft.shortDescription || null,
                storefrontCategory: draft.storefrontCategory || null, storefrontImage: draft.storefrontImage || null,
                isVisible: draft.isVisible !== false, isActive: draft.isActive !== false, sortOrder: draft.sortOrder ?? 0,
                allowDirectPurchase: draft.allowDirectPurchase !== false, allowAiCustomization: draft.allowAiCustomization === true,
                aiCustomOnly: draft.aiCustomOnly === true, retailPrice: draft.retailPrice ?? null,
                blueprintId: draft.blueprintId || null, printProviderId: draft.printProviderId || null,
                variants: draft.variants.map(variant => ({ id: Number(variant.databaseId ?? 0), enabled: variant.storefrontEnabled !== false })).filter(variant => variant.id > 0)
            })
            setProducts(values => values.map(value => value.databaseId === updated.databaseId ? updated : value))
            setDraft(structuredClone(updated)); setSuccess('Product and variant storefront rules saved and audited.')
        } catch (saveError) { setError(adminErrorMessage(saveError, 'Could not save product settings.')) }
        finally { setWorking(false) }
    }
    async function synchronize() {
        setSyncing(true); setError(''); setSuccess('')
        try {
            const result = await syncAdminCatalog()
            await loadProducts(draft?.databaseId)
            const counts = Object.entries(result.data).filter(([, count]) => typeof count === 'number').map(([name, count]) => `${name.replaceAll(/([A-Z])/g, ' $1').toLowerCase()}: ${count}`).join(' · ')
            setSuccess(`${result.message}${counts ? ` ${counts}.` : ''}`)
        } catch (syncError) { setError(adminErrorMessage(syncError, 'Catalog synchronization failed. Existing catalog data was preserved.')) }
        finally { setSyncing(false) }
    }
    async function previewDelete() {
        if (!draft || checkingDelete) return
        setCheckingDelete(true); setError(''); setSuccess('')
        try { setDeletePlan(await getAdminProductDeletionPlan(draft.databaseId)) }
        catch (requestError) { setError(adminErrorMessage(requestError, 'Could not check whether this product can be removed.')) }
        finally { setCheckingDelete(false) }
    }
    async function removeProduct(confirmation: string) {
        if (!draft || deleting) return
        setDeleting(true); setError('')
        try {
            const result = await deleteAdminProduct(draft.databaseId, confirmation)
            setDeletePlan(null)
            await loadProducts()
            setSuccess(result.action === 'deleted' ? result.historyPreserved ? 'Archived product permanently removed from catalog management. Historical orders and payments were preserved.' : 'Product permanently deleted and audited.' : 'Product archived, hidden from new purchases, and audited. Historical records were preserved.')
        } catch (requestError) { setError(adminErrorMessage(requestError, 'Could not remove this product.')) }
        finally { setDeleting(false) }
    }

    if (!products.length && !error) return <LoadingState label="Loading product controls" />
    return <section className="admin-page">
        <header className="admin-heading"><div><span className="eyebrow">Administration</span><h1>Storefront products</h1><p>Manage presentation, purchase options, AI support, availability, and internal catalog mapping.</p></div><button className="admin-save" disabled={syncing || working} onClick={() => void synchronize()}>{syncing ? 'Synchronizing…' : 'Synchronize catalog'}</button></header>
        {error && <p className="error" role="alert">{error}</p>}{success && <p className="success" role="status">{success}</p>}
        <div className="admin-product-layout">
            <aside className="admin-product-sidebar">
                <label>Find product<input value={productSearch} onChange={event => setProductSearch(event.target.value)} placeholder="Name or internal ID" /></label>
                <div className="admin-product-list">{filteredProducts.map(product => <button className={selectedId === product.databaseId ? 'selected' : ''} key={product.databaseId} onClick={() => select(product)}>{product.image && <img src={product.image} alt="" />}<span><b>{product.displayName || product.printifyTitle}</b><small>#{product.databaseId} · {product.isActive ? 'active' : 'inactive'}</small><small>{product.variants.filter(variant => variant.storefrontEnabled && variant.available).length} enabled variants</small></span>{product.allowAiCustomization && <em>AI</em>}</button>)}</div>
            </aside>
            {draft && <form className="admin-panel admin-product-form" onSubmit={requestSave}>
                <div className="admin-product-heading">{draft.image && <img src={draft.image} alt="" />}<div><h2>{draft.displayName || draft.printifyTitle}</h2><p>Internal product #{draft.databaseId}</p><StatusBadge status={draft.isActive ? 'active' : 'archived'} audience="admin" /></div></div>
                <div className="admin-form-grid"><label>Storefront display name<input value={draft.displayName || ''} onChange={event => field('displayName', event.target.value)} maxLength={160} /></label><label>Category<input value={draft.storefrontCategory || ''} onChange={event => field('storefrontCategory', event.target.value)} maxLength={100} /></label><label className="wide">Short description<textarea value={draft.shortDescription || ''} onChange={event => field('shortDescription', event.target.value)} maxLength={500} /></label><label className="wide">Storefront image URL<input value={draft.storefrontImage || ''} onChange={event => field('storefrontImage', event.target.value)} /></label><label>Sort order<input type="number" value={draft.sortOrder ?? 0} onChange={event => field('sortOrder', Number(event.target.value))} /></label><label>Retail price override<input type="number" min="0.01" step="0.01" value={draft.retailPrice ?? ''} onChange={event => field('retailPrice', event.target.value ? Number(event.target.value) : null)} placeholder="Use variant prices" /></label></div>
                <details className="admin-integration-details"><summary>Internal integration details</summary><div className="admin-form-grid"><label>Printify product ID<input value={draft.printifyProductId || ''} readOnly /></label><label>Blueprint ID<input value={draft.blueprintId || ''} onChange={event => field('blueprintId', event.target.value)} /></label><label>Provider ID<input value={draft.printProviderId || ''} onChange={event => field('printProviderId', event.target.value)} /></label><label>Printify source title<input value={draft.printifyTitle || ''} readOnly /></label></div></details>
                <fieldset className="admin-checks"><legend>Store rules</legend><label><input type="checkbox" checked={draft.isVisible !== false} onChange={event => field('isVisible', event.target.checked)} /> Visible in storefront</label><label><input type="checkbox" checked={draft.isActive !== false} onChange={event => field('isActive', event.target.checked)} /> Active</label><label><input type="checkbox" checked={draft.allowDirectPurchase !== false} onChange={event => field('allowDirectPurchase', event.target.checked)} /> Allow direct purchase</label><label><input type="checkbox" checked={draft.allowAiCustomization === true} onChange={event => field('allowAiCustomization', event.target.checked)} /> Allow AI customization</label><label><input type="checkbox" checked={draft.aiCustomOnly === true} onChange={event => { field('aiCustomOnly', event.target.checked); if (event.target.checked) setDraft(current => current ? { ...current, aiCustomOnly: true, allowDirectPurchase: false, allowAiCustomization: true } : current) }} /> AI-custom-only</label></fieldset>
                <div className="admin-variant-heading"><div><h3>Variants</h3><p>{draft.variants.length} total · {draft.variants.filter(variant => variant.storefrontEnabled && variant.available).length} currently enabled</p></div><div className="admin-variant-filters"><input aria-label="Search variants" value={variantSearch} onChange={event => setVariantSearch(event.target.value)} placeholder="Model, type, or internal variant ID" /><select aria-label="Variant availability" value={variantState} onChange={event => setVariantState(event.target.value)}><option value="">Any availability</option><option value="available">Enabled and available</option><option value="disabled">Storefront disabled</option><option value="provider-unavailable">Source unavailable</option></select><select aria-label="AI template support" value={templateState} onChange={event => setTemplateState(event.target.value)}><option value="">Any AI support</option><option value="supported">AI template supported</option><option value="unsupported">No AI template</option></select></div></div>
                <div className="admin-variant-groups">{groupedVariants.map(([phoneModel, variants]) => <section key={phoneModel}><h4>{phoneModel} <small>{variants.length} options</small></h4><div className="admin-variant-list">{variants.map(variant => <label key={variant.id}><input type="checkbox" checked={variant.storefrontEnabled !== false} disabled={!variant.providerEnabled || !variant.available} onChange={event => setDraft(current => current ? { ...current, variants: current.variants.map(value => value.id === variant.id ? { ...value, storefrontEnabled: event.target.checked } : value) } : current)} /><span><b>{variant.caseType}</b><small>Internal option {variant.printifyVariantId || '—'} · {variant.title}</small><small>{variant.mockupTemplateId ? `AI template: ${variant.mockupTemplateId}` : 'AI template unavailable'}</small></span><em>{variant.available && variant.providerEnabled ? `${variant.price.toFixed(2)} ${variant.currency}` : 'Source unavailable'}</em></label>)}</div></section>)}</div>
                {!groupedVariants.length && <p>No variants match these filters.</p>}
                <p className="admin-sync-note">Last synchronized: {draft.catalogSyncedAt ? new Date(draft.catalogSyncedAt).toLocaleString() : 'Never'}</p>
                <div className="admin-product-actions"><button className="admin-save" disabled={working || syncing}>{working ? 'Saving…' : 'Save storefront settings'}</button><button type="button" className="admin-delete-product" disabled={working || syncing || deleting || checkingDelete} onClick={() => void previewDelete()}><span aria-hidden="true">⌫</span>{checkingDelete ? 'Checking history…' : 'Delete product'}</button></div>
            </form>}
        </div>
        {confirmSave && <ConfirmAction title="Disable product availability?" message="This change disables a currently enabled product or variant for new purchases. Existing order snapshots remain preserved." confirmLabel="Save disabling changes" tone="danger" working={working} onCancel={() => setConfirmSave(false)} onConfirm={() => { setConfirmSave(false); void save() }} />}
        {deletePlan && <ProductDeleteDialog plan={deletePlan} working={deleting} onCancel={() => setDeletePlan(null)} onConfirm={confirmation => void removeProduct(confirmation)} />}
    </section>
}
