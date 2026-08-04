import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import type { AdminCustomer } from '../../../models/AdminManagement'
import { adminErrorMessage, getAdminCustomers } from '../../../services/admin'
import LoadingState from '../../ui/loading-state/LoadingState'
import StatusBadge from '../../ui/status-badge/StatusBadge'
import EmptyState from '../../ui/empty-state/EmptyState'
import './Admin.css'

export default function AdminCustomers() {
    const [customers, setCustomers] = useState<AdminCustomer[]>([])
    const [search, setSearch] = useState('')
    const [status, setStatus] = useState('')
    const [role, setRole] = useState('')
    const [activity, setActivity] = useState('')
    const [page, setPage] = useState(1)
    const [pages, setPages] = useState(1)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    async function load(nextPage = page) {
        setLoading(true); setError('')
        try { const result = await getAdminCustomers({ page: nextPage, search, status: status || undefined, role: role || undefined, hasOrders: activity === 'orders' ? 'true' : undefined, hasDesigns: activity === 'designs' ? 'true' : undefined }); setCustomers(result.customers); setPages(result.pagination.totalPages || 1); setPage(nextPage) }
        catch (loadError) { setError(adminErrorMessage(loadError, 'Could not load customers.')) }
        finally { setLoading(false) }
    }
    useEffect(() => {
        let cancelled = false
        void getAdminCustomers({ page: 1 }).then(result => {
            if (cancelled) return
            setCustomers(result.customers); setPages(result.pagination.totalPages || 1); setPage(1)
        }).catch(loadError => { if (!cancelled) setError(adminErrorMessage(loadError, 'Could not load customers.')) })
            .finally(() => { if (!cancelled) setLoading(false) })
        return () => { cancelled = true }
    }, [])
    function submit(event: FormEvent) { event.preventDefault(); void load(1) }
    return <section className="admin-page"><header className="admin-heading"><div><span className="eyebrow">Administration</span><h1>Customers</h1><p>Account, order, design, spending, and credit visibility.</p></div></header>
        <form className="admin-filters" onSubmit={submit}><input aria-label="Search customers" placeholder="Name, email, or user ID" value={search} onChange={event => setSearch(event.target.value)} /><select aria-label="Account status" value={status} onChange={event => setStatus(event.target.value)}><option value="">All statuses</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="disabled">Disabled</option></select><select aria-label="Role" value={role} onChange={event => setRole(event.target.value)}><option value="">All roles</option><option value="user">Customers</option><option value="admin">Admins</option></select><select aria-label="Customer activity" value={activity} onChange={event => setActivity(event.target.value)}><option value="">Any activity</option><option value="orders">Has orders</option><option value="designs">Has AI designs</option></select><button>Search</button></form>
        {error && <p className="error" role="alert">{error}</p>}{loading ? <LoadingState label="Loading customers" /> : customers.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Customer</th><th>Status</th><th>Joined / last login</th><th>Orders</th><th>Paid</th><th>Spending</th><th>Designs</th><th>Credits</th></tr></thead><tbody>{customers.map(customer => <tr key={customer.id}><td><Link to={`/admin/customers/${customer.id}`}><strong>{customer.name}</strong><br /><small>{customer.email} · #{customer.id}</small></Link></td><td><StatusBadge status={customer.status} audience="admin" /> <small>{customer.role}</small></td><td>{new Date(customer.createdAt).toLocaleDateString()}<br /><small>Last login: {customer.lastLoginAt ? new Date(customer.lastLoginAt).toLocaleString() : 'Never'}</small></td><td>{customer.metrics.orders}</td><td>{customer.metrics.paidOrders}</td><td>{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(customer.metrics.totalSpending)}</td><td>{customer.metrics.savedDesigns}</td><td>{customer.metrics.creditBalance}</td></tr>)}</tbody></table></div> : <EmptyState title="No matching customers" message="Try a different search or account filter." />}
        <div className="admin-pagination"><button disabled={page <= 1 || loading} onClick={() => void load(page - 1)}>Previous</button><span>Page {page} of {pages}</span><button disabled={page >= pages || loading} onClick={() => void load(page + 1)}>Next</button></div>
    </section>
}
