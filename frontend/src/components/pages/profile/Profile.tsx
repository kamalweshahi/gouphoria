import useAuth from '../../../hooks/useAuth'
import { Link } from 'react-router-dom'
import './Profile.css'

export default function Profile() {
    const { user } = useAuth()
    if (!user) return null

    return (
        <section className="profile-page">
            <div className="profile-heading">
                <span className="eyebrow">Profile</span>
                <h1>Hello, {user.name}</h1>
                <p>Your account is ready for personalized phone case designs.</p>
            </div>

            <div className="profile-grid">
                <article>
                    <h2>Account</h2>
                    <dl>
                        <div><dt>Name</dt><dd>{user.name}</dd></div>
                        <div><dt>Email</dt><dd>{user.email}</dd></div>
                        <div><dt>Role</dt><dd>{user.role}</dd></div>
                    </dl>
                </article>
                <article>
                    <h2>Orders</h2>
                    <p>Review pending and paid orders saved to your account.</p>
                    <Link to="/orders">View order history</Link>
                </article>
                <article>
                    <h2>AI allowance</h2>
                    <strong>{user.credits.balance} generations</strong>
                    <p>{user.credits.freeProjectAvailable
                        ? 'Your free AI project is available: one initial design and one revision.'
                        : 'Your free AI project has been used.'}</p>
                    <Link to="/create-ai">Create with AI</Link>
                    {' · '}
                    <Link to="/designs">My Designs</Link>
                    {' · '}
                    <Link to="/credits">Buy credits &amp; view history</Link>
                </article>
            </div>
        </section>
    )
}
