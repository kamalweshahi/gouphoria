import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { AdminReview } from '../../../models/AdminReview'
import { adminErrorMessage, decideAdminReview, getAdminReview, retryAdminFulfillment, syncAdminFulfillment } from '../../../services/admin'
import ConfirmAction from '../../ui/confirm-action/ConfirmAction'
import StatusBadge from '../../ui/status-badge/StatusBadge'
import LoadingState from '../../ui/loading-state/LoadingState'
import { statusLabel } from '../../../utils/status-presentation'
import ProtectedAdminImage from './ProtectedAdminImage'
import './Admin.css'

export default function AdminReviewDetails() {
    const { itemId } = useParams()
    const [review, setReview] = useState<AdminReview | null>(null)
    const [note, setNote] = useState('')
    const [internalNote, setInternalNote] = useState('')
    const [working, setWorking] = useState(false)
    const [error, setError] = useState('')
    const [pendingDecision, setPendingDecision] = useState<'approve' | 'reject' | 'changes_requested' | null>(null)
    const [confirmFulfillment, setConfirmFulfillment] = useState(false)
    const [artworkAvailable, setArtworkAvailable] = useState(false)
    useEffect(() => { if (itemId) getAdminReview(Number(itemId)).then(setReview).catch(error => setError(adminErrorMessage(error, 'Could not load this review.'))) }, [itemId])
    async function decide(decision: 'approve' | 'reject' | 'changes_requested') {
        if (!review) return
        setWorking(true); setError('')
        try { setReview(await decideAdminReview(review.itemId, { decision, note, internalNote })); setNote(''); setInternalNote('') }
        catch (error) { setError(adminErrorMessage(error, 'The review decision could not be saved.')) }
        finally { setWorking(false) }
    }
    async function fulfillment(action: 'retry' | 'sync') {
        if (!review) return
        setWorking(true); setError('')
        try { setReview(action === 'retry' ? await retryAdminFulfillment(review.itemId) : await syncAdminFulfillment(review.itemId)) }
        catch (error) { setError(adminErrorMessage(error, 'The fulfillment action could not be completed.')) }
        finally { setWorking(false) }
    }
    if (error && !review) return <p className="error">{error}</p>
    if (!review) return <LoadingState label="Loading review" />
    const decisionAvailable = review.itemStatus === 'pending_design_review'
    const decisionLabels = { approve: 'Approve for print', reject: 'Reject design', changes_requested: 'Request changes' }
    return <section className="admin-page"><header className="admin-heading"><div><Link to="/admin/reviews">← Review queue</Link><h1>{review.orderNumber}</h1><p>{review.customer?.name} · Payment {statusLabel(review.paymentStatus, 'admin')} · Design #{review.design.id} generation {review.design.generationCount}</p></div><StatusBadge status={review.itemStatus} audience="admin" /></header>
        <div className="admin-review-grid"><div className="admin-review-content">
            <div className="admin-review-assets"><figure><ProtectedAdminImage endpoint={review.design.artwork} alt="Purchased printable artwork" assetLabel="Printable artwork" downloadName={`gouphoria-design-${review.design.id}-print.png`} onAvailabilityChange={setArtworkAvailable} /><figcaption>Exact printable artwork</figcaption></figure><figure><ProtectedAdminImage endpoint={review.design.mockup} alt="Customer preview mockup" assetLabel="Customer mockup preview" /><figcaption>Preview only — never printed</figcaption></figure></div>
            <article className="admin-panel"><h2>Design request</h2><h3>Original prompt</h3><p>{review.design.prompt}</p>{review.design.revisionPrompt && <><h3>Revision</h3><p>{review.design.revisionPrompt}</p></>}<h3>Private references</h3><div className="admin-reference-grid">{review.design.uploads.map((upload, index) => <ProtectedAdminImage key={upload.id} endpoint={upload.url} alt={`Customer reference ${index + 1}`} assetLabel={`Customer reference ${index + 1}`} />)}</div>{!review.design.uploads.length && <p>No customer reference images were stored for this design.</p>}</article>
        </div><aside className="admin-review-actions">
            <article className="admin-panel"><h2>Purchased item</h2><p><strong>{review.product.title}</strong></p><p>{review.variant.phoneModel} · {review.variant.caseType}</p><p>Variant {review.variant.id} · Quantity {review.quantity}</p><p>Retail unit price: {review.pricing.unitPrice.toFixed(2)} {review.pricing.currency}</p></article>
            <article className="admin-panel"><h2>Decision</h2><p>Review the purchased print file carefully. A confirmation step is required before the decision is recorded.</p>{!artworkAvailable && <p className="error" role="status">Printable artwork must load successfully before approval. Rejection, change requests, and internal notes remain available.</p>}<label>Customer-visible explanation<textarea rows={4} value={note} onChange={event => setNote(event.target.value)} placeholder="Required for rejection or changes requested" /></label><label>Internal note<textarea rows={3} value={internalNote} onChange={event => setInternalNote(event.target.value)} placeholder="Visible only to admins" /></label><div className="admin-action-row"><button className="approve" disabled={working || !decisionAvailable || !artworkAvailable} onClick={() => setPendingDecision('approve')}>Approve for print</button><button className="reject" disabled={working || !decisionAvailable || !note.trim()} onClick={() => setPendingDecision('reject')}>Reject</button><button disabled={working || !decisionAvailable || !note.trim()} onClick={() => setPendingDecision('changes_requested')}>Request changes</button></div></article>
            <article className="admin-panel"><h2>Production fulfillment</h2><p>{statusLabel(review.fulfillment.printifyStatus, 'admin')}</p><div className="admin-action-row">{review.fulfillment.retryable && <button disabled={working} onClick={() => setConfirmFulfillment(true)}>Retry safely</button>}{review.fulfillment.printifyOrderId && <button disabled={working} onClick={() => void fulfillment('sync')}>Synchronize production</button>}</div><details className="admin-integration-details"><summary>Internal integration details</summary><dl className="admin-dl"><div><dt>Printify order ID</dt><dd>{review.fulfillment.printifyOrderId || '—'}</dd></div><div><dt>Raw provider status</dt><dd>{review.fulfillment.printifyStatus || '—'}</dd></div></dl></details></article>
            <article className="admin-panel"><h2>Audit notes</h2><ul className="admin-notes">{review.notes.map(entry => <li key={entry.id}><strong>{entry.visibility === 'internal' ? 'Internal' : 'Customer visible'}</strong><p>{entry.note}</p><small>{entry.admin?.name} · {new Date(entry.createdAt).toLocaleString()}</small></li>)}</ul>{!review.notes.length && <p>No review notes yet.</p>}</article>
            {error && <p className="error">{error}</p>}
        </aside></div>
        {pendingDecision && <ConfirmAction title={`${decisionLabels[pendingDecision]}?`} message={pendingDecision === 'approve' ? 'This will authorize the exact purchased artwork for print fulfillment. Verify the artwork, variant, and customer order before continuing.' : `This will record “${decisionLabels[pendingDecision]}” and expose the customer-visible explanation to the customer.`} confirmLabel={decisionLabels[pendingDecision]} tone={pendingDecision === 'approve' ? 'standard' : 'danger'} working={working} onCancel={() => setPendingDecision(null)} onConfirm={() => { const decision = pendingDecision; setPendingDecision(null); void decide(decision) }} />}
        {confirmFulfillment && <ConfirmAction title="Retry fulfillment?" message="This uses the existing idempotent fulfillment service for this approved item. Verify the selected variant and artwork before continuing." confirmLabel="Retry fulfillment" tone="standard" working={working} onCancel={() => setConfirmFulfillment(false)} onConfirm={() => { setConfirmFulfillment(false); void fulfillment('retry') }} />}
    </section>
}
