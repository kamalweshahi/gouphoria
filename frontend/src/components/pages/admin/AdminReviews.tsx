import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { AdminReview } from '../../../models/AdminReview'
import { adminErrorMessage, getAdminReviews } from '../../../services/admin'
import StatusBadge from '../../ui/status-badge/StatusBadge'
import LoadingState from '../../ui/loading-state/LoadingState'
import EmptyState from '../../ui/empty-state/EmptyState'
import './Admin.css'

export default function AdminReviews() {
    const [searchParams, setSearchParams] = useSearchParams()
    const [reviews, setReviews] = useState<AdminReview[]>([])
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(true)
    const [page, setPage] = useState(Number(searchParams.get('page')) || 1)
    const [pages, setPages] = useState(1)
    const status = searchParams.get('status') || ''
    useEffect(() => {
        let cancelled = false
        const nextPage = Number(searchParams.get('page')) || 1
        const nextStatus = searchParams.get('status') || ''
        void getAdminReviews({ page: nextPage, status: nextStatus || undefined }).then(result => {
            if (cancelled) return
            setReviews(result.reviews); setPage(nextPage); setPages(result.pagination.totalPages || 1); setError('')
        }).catch(loadError => { if (!cancelled) setError(adminErrorMessage(loadError, 'Could not load the review queue.')) })
            .finally(() => { if (!cancelled) setLoading(false) })
        return () => { cancelled = true }
    }, [searchParams])
    function changeStatus(nextStatus: string) {
        setLoading(true)
        const next = new URLSearchParams()
        if (nextStatus) next.set('status', nextStatus)
        setSearchParams(next)
    }
    return <section className="admin-page"><header className="admin-heading"><div><span className="eyebrow">AI review queue</span><h1>Paid customized cases</h1><p>Inspect the exact purchased print file before fulfillment. Unordered designs are intentionally not part of the production review queue.</p></div><Link to="/admin">Dashboard</Link></header>
        <div className="admin-filters review-filters"><label>Status<select value={status} onChange={event => changeStatus(event.target.value)}><option value="">All review states</option><option value="pending_design_review">Awaiting review</option><option value="changes_requested">Change requested</option><option value="approved_for_print">Approved</option><option value="rejected">Rejected</option><option value="fulfillment_failed">Fulfillment failed</option></select></label></div>
        {error && <p className="error" role="alert">{error}</p>}
        {loading ? <LoadingState label="Loading review queue" /> : <div className="review-list">{reviews.map(review => <article className="review-card" key={review.itemId}>
            {review.design.mockup && <img className="review-card-preview" src={review.design.mockup.startsWith('http') ? review.design.mockup : `${import.meta.env.VITE_REST_SERVER_URL || 'http://localhost:3000'}${review.design.mockup}`} alt={`Mockup for ${review.variant.phoneModel}`} />}
            <div><strong>{review.orderNumber}</strong><p>{review.customer?.name} · {review.customer?.email}</p><small>{review.product.title}</small></div>
            <div><strong>{review.variant.phoneModel}</strong><p>{review.variant.caseType} · Qty {review.quantity}</p><small>{review.design.generationCount} {review.design.generationCount === 1 ? 'generation' : 'generations'}</small></div>
            <div><StatusBadge status={review.itemStatus} audience="admin" /><small>Waiting since {new Date(review.submittedAt).toLocaleString()}</small></div>
            <Link to={`/admin/reviews/${review.itemId}`}>Review item</Link>
        </article>)}</div>}
        {!loading && !reviews.length && !error && <EmptyState title="No matching reviews" message="No paid AI-customized items match this review state." />}
        <div className="admin-pagination"><button disabled={page <= 1 || loading} onClick={() => { setLoading(true); setSearchParams(current => { const next = new URLSearchParams(current); next.set('page', String(page - 1)); return next }) }}>Previous</button><span>Page {page} of {pages}</span><button disabled={page >= pages || loading} onClick={() => { setLoading(true); setSearchParams(current => { const next = new URLSearchParams(current); next.set('page', String(page + 1)); return next }) }}>Next</button></div>
    </section>
}
