import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import CreditPayPalCheckout from '../../credits/credit-paypal-checkout/CreditPayPalCheckout'
import useAuth from '../../../hooks/useAuth'
import type { CreditHistory, CreditPackage } from '../../../models/Credits'
import { creditErrorMessage, getCreditHistory, getCreditPackages } from '../../../services/credits'
import './CreditsPage.css'
import StatusBadge from '../../ui/status-badge/StatusBadge'
import LoadingState from '../../ui/loading-state/LoadingState'

function money(value: number, currency: string) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value)
}

export default function CreditsPage() {
    const { user, refreshUser } = useAuth()
    const [packages, setPackages] = useState<CreditPackage[]>([])
    const [history, setHistory] = useState<CreditHistory | null>(null)
    const [selected, setSelected] = useState<CreditPackage | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    const refresh = useCallback(async () => {
        const nextHistory = await getCreditHistory()
        setHistory(nextHistory)
        await refreshUser()
    }, [refreshUser])

    useEffect(() => {
        Promise.all([getCreditPackages(), getCreditHistory()])
            .then(([nextPackages, nextHistory]) => { setPackages(nextPackages); setHistory(nextHistory) })
            .catch(loadError => setError(creditErrorMessage(loadError, 'Could not load AI credit options.')))
            .finally(() => setLoading(false))
    }, [])

    if (loading) return <LoadingState label="Loading AI credits" />
    return <section className="credits-page">
        <header className="credits-heading">
            <div><span className="eyebrow">AI credits</span><h1>Keep creating</h1><p>Each initial generation costs one credit. Each revision also costs one credit. Technical failures are not shown as successful charges; any ledger refund appears below.</p></div>
            <div className="credits-balance"><span>Current balance</span><strong>{history?.balance ?? user?.credits.balance ?? 0}</strong><small>AI credits</small></div>
        </header>

        {error && <p className="error" role="alert">{error}</p>}
        <div className="credit-packages">
            {packages.map(item => <article className={selected?.id === item.id ? 'selected' : ''} key={item.id}>
                <span>{item.name}</span><strong>{item.credits} credits</strong><p>{money(item.price, item.currency)}</p>
                <button type="button" aria-pressed={selected?.id === item.id} onClick={() => setSelected(item)}>{selected?.id === item.id ? 'Selected' : 'Choose package'}</button>
            </article>)}
        </div>

        {selected && <article className="credit-checkout-panel">
            <div><h2>Buy {selected.credits} credits</h2><p>One-time payment of {money(selected.price, selected.currency)}. This is not a subscription.</p></div>
            <CreditPayPalCheckout selectedPackage={selected} onComplete={refresh} />
        </article>}

        <article className="credit-history-panel">
            <div className="credit-history-heading"><div><span className="eyebrow">Payments</span><h2>Credit purchases</h2></div></div>
            {!history?.purchases.length ? <p>No credit purchases yet.</p> : <div className="credit-table-wrap"><table className="credit-table"><thead><tr><th>Date</th><th>Package</th><th>Credits</th><th>Amount</th><th>Status</th></tr></thead>
                <tbody>{history.purchases.map(purchase => <tr key={purchase.id}><td>{new Date(purchase.createdAt).toLocaleString()}</td><td>{purchase.packageName}</td><td>{purchase.credits}</td><td>{money(purchase.price, purchase.currency)}</td><td><StatusBadge status={purchase.status} /></td></tr>)}</tbody>
            </table></div>}
        </article>

        <article className="credit-history-panel">
            <div className="credit-history-heading"><div><span className="eyebrow">Account ledger</span><h2>Credit history</h2></div><Link to="/create-ai">Create with AI</Link></div>
            {!history?.transactions.length ? <p>No credit activity yet.</p> : <div className="credit-table-wrap"><table className="credit-table">
                <thead><tr><th>Date</th><th>Description</th><th>Change</th><th>Balance</th><th>Related</th></tr></thead>
                <tbody>{history.transactions.map(entry => <tr key={entry.id}>
                    <td>{new Date(entry.date).toLocaleString()}</td><td>{entry.description}</td>
                    <td className={entry.amount >= 0 ? 'credit-positive' : 'credit-negative'}>{entry.amount >= 0 ? '+' : ''}{entry.amount}</td>
                    <td>{entry.balanceAfter}</td>
                    <td>{entry.related.designId ? <Link to={`/designs/${entry.related.designId}`}>Design #{entry.related.designId}</Link> : entry.related.orderId ? <Link to={`/orders/${entry.related.orderId}`}>Order #{entry.related.orderId}</Link> : entry.related.purchaseId ? `Purchase #${entry.related.purchaseId}` : '—'}</td>
                </tr>)}</tbody>
            </table></div>}
        </article>
    </section>
}
