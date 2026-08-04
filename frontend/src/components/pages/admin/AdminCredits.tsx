import { useState, type FormEvent } from 'react'
import type { AdminUserCredits } from '../../../models/Credits'
import { adjustAdminCredits, adminErrorMessage, getAdminUserCredits } from '../../../services/admin'
import ConfirmAction from '../../ui/confirm-action/ConfirmAction'
import './Admin.css'

export default function AdminCredits() {
    const [userId, setUserId] = useState('')
    const [account, setAccount] = useState<AdminUserCredits | null>(null)
    const [amount, setAmount] = useState('')
    const [reason, setReason] = useState('')
    const [working, setWorking] = useState(false)
    const [error, setError] = useState('')
    const [message, setMessage] = useState('')
    const [confirming, setConfirming] = useState(false)

    async function load(event?: FormEvent) {
        event?.preventDefault()
        const id = Number(userId)
        if (!Number.isInteger(id) || id < 1) { setError('Enter a valid numeric user ID.'); return }
        setWorking(true); setError(''); setMessage('')
        try { setAccount(await getAdminUserCredits(id)) }
        catch (loadError) { setAccount(null); setError(adminErrorMessage(loadError, 'Could not load this user credit account.')) }
        finally { setWorking(false) }
    }

    function requestAdjustment(event: FormEvent) {
        event.preventDefault()
        const adjustment = Number(amount)
        if (!account || !Number.isInteger(adjustment) || adjustment === 0) { setError('Enter a non-zero whole number of credits.'); return }
        if (reason.trim().length < 3) { setError('A clear adjustment reason is required.'); return }
        setError(''); setConfirming(true)
    }

    async function adjust() {
        const adjustment = Number(amount)
        if (!account || !Number.isInteger(adjustment) || adjustment === 0) return
        setConfirming(false)
        setWorking(true); setError(''); setMessage('')
        try {
            await adjustAdminCredits(account.user.id, adjustment, reason.trim())
            setAccount(await getAdminUserCredits(account.user.id))
            setAmount(''); setReason('')
            setMessage('Credit adjustment recorded in the immutable account history.')
        } catch (adjustmentError) { setError(adminErrorMessage(adjustmentError, 'Could not apply this adjustment.')) }
        finally { setWorking(false) }
    }

    return <section className="admin-page">
        <header className="admin-heading"><div><span className="eyebrow">Administration</span><h1>User credit controls</h1><p>Every adjustment records your admin identity, reason, and before/after balance.</p></div></header>
        <article className="admin-panel admin-credit-search">
            <form onSubmit={load}><label htmlFor="credit-user-id">User ID</label><div><input id="credit-user-id" type="number" min="1" value={userId} onChange={event => setUserId(event.target.value)} placeholder="Enter user ID" /><button disabled={working}>Load account</button></div></form>
        </article>
        {error && <p className="error" role="alert">{error}</p>}{message && <p className="success" aria-live="polite">{message}</p>}
        {account && <>
            <div className="admin-credit-summary"><article className="admin-stat"><span>User</span><strong>{account.user.name}</strong><small>#{account.user.id} · {account.user.email}</small></article><article className="admin-stat"><span>Current balance</span><strong>{account.balance}</strong><small>AI credits</small></article></div>
            <article className="admin-panel admin-credit-adjustment"><h2>Record adjustment</h2><form onSubmit={requestAdjustment}>
                <label htmlFor="credit-amount">Credits to add or deduct</label><input id="credit-amount" type="number" step="1" min="-10000" max="10000" value={amount} onChange={event => setAmount(event.target.value)} placeholder="Example: 5 or -2" />
                <label htmlFor="credit-reason">Mandatory reason</label><textarea id="credit-reason" rows={3} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} placeholder="Explain why this adjustment is required" />
                <button disabled={working || !amount || reason.trim().length < 3}>Record adjustment</button>
            </form></article>
            <article className="admin-panel"><h2>Immutable credit history</h2><div className="credit-table-wrap"><table className="admin-table"><thead><tr><th>Date</th><th>Description</th><th>Change</th><th>Balance</th></tr></thead><tbody>{account.transactions.map(entry => <tr key={entry.id}><td>{new Date(entry.date).toLocaleString()}</td><td>{entry.description}</td><td className={entry.amount >= 0 ? 'credit-positive' : 'credit-negative'}>{entry.amount >= 0 ? '+' : ''}{entry.amount}</td><td>{entry.balanceAfter}</td></tr>)}</tbody></table></div></article>
        </>}
        {confirming && account && <ConfirmAction title="Record this credit adjustment?" message={`${Number(amount) > 0 ? 'Add' : 'Deduct'} ${Math.abs(Number(amount))} credits ${Number(amount) > 0 ? 'to' : 'from'} ${account.user.name}. This creates an immutable ledger entry with the stated reason.`} confirmLabel="Record adjustment" tone={Number(amount) < 0 ? 'danger' : 'standard'} working={working} onCancel={() => setConfirming(false)} onConfirm={() => void adjust()} />}
    </section>
}
