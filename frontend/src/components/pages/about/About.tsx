import { Link } from 'react-router-dom'
import './About.css'

export default function About() {
    return (
        <div className="about-page">
            <section className="about-intro"><span className="eyebrow">How Gouphoria works</span><h1>A personal phone case, with every choice made visible.</h1><p>Gouphoria connects original design tools, a live phone-case catalog, secure payment, and made-to-order production in one clear workflow.</p><Link className="primary-button" to="/create-ai">Create your design</Link></section>
            <section className="about-grid" aria-label="Ordering process">
                <article><b>01</b><h2>Create or choose</h2><p>Generate private artwork with AI, or begin with a standard phone case from the catalog.</p></article>
                <article><b>02</b><h2>Select an exact fit</h2><p>Choose only from real phone-model and case-type combinations currently available.</p></article>
                <article><b>03</b><h2>Review and pay</h2><p>Check your shipping address and backend-calculated total before completing checkout with PayPal.</p></article>
                <article><b>04</b><h2>Track the workflow</h2><p>See payment, AI review, production, and delivery updates from your account.</p></article>
            </section>
            <section className="about-note"><div><span className="eyebrow">An honest made-to-order process</span><h2>Nothing is presented as available unless it can currently be made.</h2></div><p>Prices and availability can change. AI artwork is kept private, credit activity is recorded, and an AI order requires the documented review decision before production.</p></section>
        </div>
    )
}
