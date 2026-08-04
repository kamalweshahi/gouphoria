import { Link } from 'react-router-dom'

export default function Unauthorized() {
    return <section className="auth-page"><div className="auth-card"><span className="eyebrow">Restricted area</span><h1>Admin access required</h1><p>Your account does not have permission to open this page.</p><Link to="/">Return to the storefront</Link></div></section>
}
