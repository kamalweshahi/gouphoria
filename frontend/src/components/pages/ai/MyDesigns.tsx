import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type AIDesign from '../../../models/AIDesign'
import { aiAssetUrl, aiErrorMessage, getMyDesigns } from '../../../services/ai'
import './AI.css'
import LoadingState from '../../ui/loading-state/LoadingState'
import EmptyState from '../../ui/empty-state/EmptyState'
import StatusBadge from '../../ui/status-badge/StatusBadge'
import { statusLabel } from '../../../utils/status-presentation'

export default function MyDesigns() {
    const [designs, setDesigns] = useState<AIDesign[]>([])
    const [credits, setCredits] = useState(0)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    useEffect(() => {
        getMyDesigns()
            .then(result => { setDesigns(result.designs); setCredits(result.credits.balance) })
            .catch(error => setError(aiErrorMessage(error, 'Could not load your designs.')))
            .finally(() => setLoading(false))
    }, [])

    if (loading) return <LoadingState label="Loading your designs" />

    const orderedDesigns = [...designs].sort((left, right) => {
        if (left.status === 'failed' && right.status !== 'failed') return 1
        if (right.status === 'failed' && left.status !== 'failed') return -1
        return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
    })
    const approvedDesigns = designs.filter(design => design.status === 'approved' || design.status === 'approved_for_print' || design.status === 'completed').length

    return (
        <section className="ai-page designs-library">
            <header className="designs-library-heading">
                <div><span className="eyebrow">My Designs</span><h1>Your ideas,<br />beautifully organized.</h1><p>Review your private artwork, realistic case previews, and approval progress in one place.</p></div>
                <div className="designs-library-actions"><Link className="primary-button" to="/create-ai">Create another design <span aria-hidden="true">→</span></Link>{credits === 0 && <Link className="designs-text-link" to="/credits">Buy AI credits</Link>}</div>
            </header>
            <div className="designs-overview" aria-label="Design library summary">
                <div><strong>{designs.length}</strong><span>Saved designs</span></div>
                <div><strong>{approvedDesigns}</strong><span>Approved</span></div>
                <div><strong>{credits}</strong><span>AI credits available</span></div>
            </div>
            {error && <p className="error" role="alert">{error}</p>}
            {!designs.length && !error && <EmptyState title="No designs yet" message="Start with a supported phone case and one or two private reference images." action={{ label: 'Create with AI', to: '/create-ai' }} />}
            <div className="design-grid">
                {orderedDesigns.map(design => <article className={`design-card${design.status === 'failed' ? ' design-card-recoverable' : ''}`} key={design.id}>
                    <div className="design-card-visual">
                        {design.artwork.mockupUrl
                            ? <img className="design-mockup" src={aiAssetUrl(design.artwork.mockupUrl)} alt={`${design.variant?.phoneModel ?? 'Phone'} case preview`} loading="lazy" decoding="async" />
                            : design.artwork.currentUrl
                                ? <img className="design-mockup" src={aiAssetUrl(design.artwork.currentUrl)} alt="Printable artwork" loading="lazy" decoding="async" />
                                : <div className="design-placeholder">Preview pending</div>}
                        {design.artwork.currentUrl && design.artwork.mockupUrl && <div className="design-artwork-inset"><img src={aiAssetUrl(design.artwork.currentUrl)} alt="Printable artwork thumbnail" loading="lazy" decoding="async" /><span>Artwork</span></div>}
                    </div>
                    <div className="design-card-body">
                        <div className="design-card-topline"><span>Design #{design.id}</span>{design.status === 'failed' ? <span className="design-retry-label">Ready to retry</span> : <StatusBadge status={design.status} />}</div>
                        <h2>{design.variant?.phoneModel ?? 'Phone case'}</h2>
                        <p className="design-case-type">{design.variant?.caseType || 'Custom case'}</p>
                        {design.status === 'failed'
                            ? <div className="design-friendly-failure"><strong>Generation couldn't be completed</strong><p>Your credit was not used. You haven't lost your work—open this design to try again.</p></div>
                            : <p className="design-saved-note">Private custom artwork and preview</p>}
                        <dl className="design-meta">
                            <div><dt>Created</dt><dd>{new Date(design.createdAt).toLocaleDateString()}</dd></div>
                            <div><dt>Generations</dt><dd>{design.generationCount}</dd></div>
                            <div><dt>Review</dt><dd>{design.approvalStatus === 'not_required' ? (design.status === 'approved' ? 'Approved by you' : 'Waiting for you') : statusLabel(design.approvalStatus)}</dd></div>
                            <div><dt>Revision</dt><dd>{design.revisionAvailable ? 'Available' : 'Used or locked'}</dd></div>
                        </dl>
                        {design.commerce[0]?.customerMessage && <p className="review-message">{design.commerce[0].customerMessage}</p>}
                        <Link to={`/designs/${design.id}`}>{design.status === 'failed' ? 'Try Again' : 'Open design'} <span aria-hidden="true">→</span></Link>
                    </div>
                </article>)}
            </div>
        </section>
    )
}
