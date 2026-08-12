import { Link } from 'react-router-dom'
import './Footer.css'
import useAuth from '../../../hooks/useAuth'
import { supportEmail } from '../../../config/store'

export default function Footer() {
    const { user } = useAuth()

    return <footer className="site-footer"><div className="footer-inner"><div className="footer-brand"><Link to="/" className="brand">Gouphoria</Link><p>Phone cases shaped by your ideas, made with care, and ordered securely.</p><a className="footer-email" href={`mailto:${supportEmail}`}>{supportEmail}</a></div><nav aria-label="Footer navigation"><div><strong>Explore</strong><Link to="/products">Cases</Link><Link to="/create-ai">Create with AI</Link>{user && <><Link to="/designs">My Designs</Link><Link to="/orders">My Orders</Link></>}<Link to="/about">How it works</Link></div><div><strong>Help</strong><Link to="/faq">FAQ</Link><Link to="/support">Contact</Link><Link to="/shipping-policy">Shipping</Link><Link to="/refund-policy">Returns</Link></div><div><strong>Legal</strong><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><Link to="/ai-design-policy">AI Design Policy</Link><Link to="/content-policy">Content & Copyright</Link></div></nav><div className="footer-bottom"><span>© {new Date().getFullYear()} Gouphoria</span><span>Premium Phone Cases · Secure checkout with PayPal</span></div></div></footer>
}
