import { useEffect, useRef, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import './Header.css'
import useAuth from '../../../hooks/useAuth'
import useCart from '../../../hooks/useCart'

function Icon({ kind }: { kind: 'search' | 'account' | 'cart' }) {
    if (kind === 'search') return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 5 5"/></svg>
    if (kind === 'account') return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7.5" r="3.5"/><path d="M5 21c.5-5 2.8-7.5 7-7.5s6.5 2.5 7 7.5"/></svg>
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l-1 13H6L5 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/></svg>
}

export default function Header() {
    const { user, loading, logout } = useAuth()
    const { cart } = useCart()
    const [menuOpen, setMenuOpen] = useState(false)
    const [accountOpen, setAccountOpen] = useState(false)
    const accountMenu = useRef<HTMLDivElement>(null)
    const mobileMenu = useRef<HTMLElement>(null)
    const menuButton = useRef<HTMLButtonElement>(null)
    const close = () => { setMenuOpen(false); setAccountOpen(false) }

    useEffect(() => {
        if (!accountOpen) return
        const closeOutside = (event: PointerEvent) => {
            if (!accountMenu.current?.contains(event.target as Node)) setAccountOpen(false)
        }
        const closeWithKeyboard = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setAccountOpen(false)
        }
        document.addEventListener('pointerdown', closeOutside)
        document.addEventListener('keydown', closeWithKeyboard)
        return () => {
            document.removeEventListener('pointerdown', closeOutside)
            document.removeEventListener('keydown', closeWithKeyboard)
        }
    }, [accountOpen])

    useEffect(() => {
        if (!menuOpen) return
        const previousOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        const closeWithKeyboard = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setMenuOpen(false)
                menuButton.current?.focus()
                return
            }
            if (event.key !== 'Tab' || !mobileMenu.current) return
            const controls = [...mobileMenu.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')]
            if (!controls.length) return
            const first = controls[0]
            const last = controls[controls.length - 1]
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
            if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
        }
        document.addEventListener('keydown', closeWithKeyboard)
        requestAnimationFrame(() => mobileMenu.current?.querySelector<HTMLElement>('a[href], button')?.focus())
        return () => {
            document.body.style.overflow = previousOverflow
            document.removeEventListener('keydown', closeWithKeyboard)
        }
    }, [menuOpen])

    async function signOut() {
        close()
        await logout()
    }

    return <header className="site-header">
        <div className="header-inner">
            <Link to="/" className="brand" aria-label="Gouphoria home">Gouphoria</Link>
            <button ref={menuButton} className="menu-toggle" type="button" aria-expanded={menuOpen} aria-controls="primary-navigation" onClick={() => setMenuOpen(value => !value)}><span aria-hidden="true">{menuOpen ? '×' : '☰'}</span><span className="visually-hidden">{menuOpen ? 'Close menu' : 'Open menu'}</span></button>
            {menuOpen && <button className="nav-backdrop" type="button" aria-label="Close navigation menu" onClick={close} />}
            <nav ref={mobileMenu} id="primary-navigation" className={menuOpen ? 'nav-open' : ''} aria-label="Primary navigation" onClick={event => { if ((event.target as HTMLElement).closest('a')) close() }}>
                <div className="mobile-drawer-heading"><span>Menu</span><button type="button" aria-label="Close navigation menu" onClick={close}>×</button></div>
                <NavLink to="/products">Shop</NavLink><NavLink to="/create-ai">Create with AI</NavLink><NavLink to="/#best-sellers">Featured Cases</NavLink>{user && <NavLink to="/orders">My Orders</NavLink>}<NavLink to={user ? '/profile' : '/login'}>Account</NavLink>{user?.role === 'admin' && <NavLink to="/admin">Admin</NavLink>}
                <div className="mobile-account-links">{!loading && !user && <><NavLink to="/login">Log in</NavLink><NavLink to="/register">Register</NavLink></>}{user && <><NavLink to="/profile">Profile</NavLink><NavLink to="/orders">My Orders</NavLink><NavLink to="/credits">AI Credits</NavLink><button type="button" onClick={() => void signOut()}>Log out</button></>}</div>
            </nav>
            <div className="header-actions">
                <Link to="/products#catalog-search" aria-label="Search cases"><Icon kind="search" /></Link>
                {user ? <div className="account-menu" ref={accountMenu}>
                    <button className="account-trigger" type="button" aria-label="Open your account menu" aria-expanded={accountOpen} aria-controls="account-navigation" onClick={() => setAccountOpen(value => !value)}><Icon kind="account" /></button>
                    {accountOpen && <div className="account-popover" id="account-navigation">
                        <div className="account-summary"><strong>{user.name}</strong><small>{user.role === 'admin' ? 'Administrator' : 'Customer account'}</small></div>
                        <NavLink to="/profile" onClick={close}>Profile</NavLink>
                        <NavLink to="/designs" onClick={close}>My Designs</NavLink>
                        <NavLink to="/orders" onClick={close}>My Orders</NavLink>
                        <NavLink to="/credits" onClick={close}>AI Credits</NavLink>
                        {user.role === 'admin' && <NavLink to="/admin" onClick={close}>Admin Dashboard</NavLink>}
                        <button type="button" onClick={() => void signOut()}>Log out</button>
                    </div>}
                </div> : <Link to="/login" aria-label="Log in"><Icon kind="account" /></Link>}
                <Link to={user ? '/cart' : '/login'} aria-label={`Cart with ${cart?.itemCount ?? 0} items`}><Icon kind="cart" />{Boolean(cart?.itemCount) && <span>{cart?.itemCount}</span>}</Link>
                {user && <button className="logout-action" type="button" onClick={() => void signOut()}>Log out</button>}
            </div>
        </div>
    </header>
}
