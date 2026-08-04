import { Link } from 'react-router-dom'
import './NotFound.css'

export default function NotFound() {
    return <section className="not-found-page"><span className="eyebrow">404</span><h1>This page isn’t part of the collection.</h1><p>The address may be outdated, or the page may have moved.</p><div><Link className="primary-button" to="/">Return home</Link><Link className="secondary-button" to="/products">Browse phone cases</Link></div></section>
}
