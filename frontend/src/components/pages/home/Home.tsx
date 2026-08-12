import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import ProductCard from '../../store/product-card/ProductCard'
import EmptyState from '../../ui/empty-state/EmptyState'
import LoadingState from '../../ui/loading-state/LoadingState'
import Reveal from '../../ui/reveal/Reveal'
import type Product from '../../../models/Product'
import { getAllProducts } from '../../../services/products'
import './Home.css'
import './HomePolish.css'

type BenefitIcon = 'shield' | 'truck' | 'lock' | 'review'

function BenefitIcon({ kind }: { kind: BenefitIcon }) {
    if (kind === 'shield') return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3.5 26 7v8.2c0 6.3-4 10.8-10 13.3-6-2.5-10-7-10-13.3V7l10-3.5Z"/><path d="m11.5 15.8 3 3 6-6"/></svg>
    if (kind === 'truck') return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M3 8h16v14H3zM19 13h5l5 5v4H19z"/><circle cx="9" cy="24.5" r="2.5"/><circle cx="24" cy="24.5" r="2.5"/></svg>
    if (kind === 'lock') return <svg viewBox="0 0 32 32" aria-hidden="true"><rect x="6" y="12" width="20" height="16" rx="2"/><path d="M11 12V8a5 5 0 0 1 10 0v4M16 18v5"/></svg>
    return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M25.5 9.5A11 11 0 0 0 6 11l-2.5 1M6 11l.3-4M6.5 22.5A11 11 0 0 0 26 21l2.5-1M26 21l-.3 4"/></svg>
}

export default function Home() {
    const [products, setProducts] = useState<Product[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let active = true
        void getAllProducts()
            .then(values => {
                if (!active) return
                setProducts(values.filter(product => product.allowDirectPurchase !== false).slice(0, 6))
            })
            .catch(() => { if (active) setProducts([]) })
            .finally(() => { if (active) setLoading(false) })
        return () => { active = false }
    }, [])

    const heroProducts = products.filter(product => product.image).slice(0, 3)

    return <div className="home-page">
        <section className="shop-hero" aria-labelledby="home-title">
            <div className="shop-hero-copy">
                <span className="eyebrow">Cases for every day</span>
                <h1 id="home-title">Phone cases<br />made for you</h1>
                <p>Shop our collection or create your own with AI.</p>
                <div className="shop-hero-actions">
                    <Link className="primary-button" to="/products">Shop Cases <span aria-hidden="true">→</span></Link>
                    <Link className="secondary-button" to="/create-ai">Create with AI</Link>
                </div>
            </div>
            <div className={`shop-hero-products hero-count-${heroProducts.length}`} aria-label="Featured phone cases">
                {heroProducts.map((product, index) => <Link key={product.id} to={`/products/${product.id}`} className={`hero-case hero-case-${index + 1}`} aria-label={`Shop ${product.displayName || product.title}`}><img src={product.image} alt={product.displayName || product.title} decoding="async" fetchPriority={index === 0 ? 'high' : 'auto'} /></Link>)}
                {!loading && !heroProducts.length && <div className="hero-case-placeholder" aria-hidden="true">G</div>}
            </div>
        </section>

        <section className="best-sellers" id="best-sellers" aria-labelledby="best-sellers-title">
            <Reveal><div className="commerce-section-heading"><div><span className="eyebrow">The collection</span><h2 id="best-sellers-title">Featured Cases</h2></div><Link to="/products">View all <span aria-hidden="true">→</span></Link></div></Reveal>
            {loading
                ? <LoadingState label="Loading cases" />
                : products.length
                    ? <div className="best-seller-grid">{products.map((product, index) => <Reveal key={product.id} delay={index * 60}><ProductCard product={product} /></Reveal>)}</div>
                    : <EmptyState title="Collection temporarily unavailable" message="The live case collection will return shortly." action={{ label: 'View Shop', to: '/products' }} />}
        </section>

        <Reveal><section className="design-your-own" aria-labelledby="design-own-title">
            <div className="design-own-copy"><span className="ai-supporting-label">Powered by AI</span><h2 id="design-own-title">Design Your Own Case</h2><p>Describe your idea and let AI create a one-of-a-kind phone case for you. Choose your exact model, add private references, and review the result before buying.</p><Link className="secondary-button" to="/create-ai">Create with AI <span aria-hidden="true">→</span></Link></div>
            <div className="design-own-visual"><div><span>Your idea</span><strong>Add a private photo</strong><small>Any normal phone photo is resized safely.</small></div><b aria-hidden="true">→</b><img src="/gouphoria-phone-back-transparent.png" alt="Finished custom Gouphoria phone case" /></div>
        </section></Reveal>

        <Reveal><section className="store-steps" aria-labelledby="store-steps-title"><span className="eyebrow">How it works</span><h2 id="store-steps-title">From case to checkout.</h2><div><article><span>01</span><h3>Choose your case</h3><p>Browse the collection and select your exact phone model.</p></article><article><span>02</span><h3>Add to cart</h3><p>Your selected variant and verified price stay attached to your cart.</p></article><article><span>03</span><h3>Order securely</h3><p>Choose shipping and complete payment through PayPal.</p></article></div></section></Reveal>

        <section className="trust-row" aria-label="Shopping benefits">{([['shield','Premium Quality','Built to protect. Made to last.'],['truck','Worldwide Shipping','Availability and pricing depend on destination.'],['lock','Secure Checkout','Payments are processed securely through PayPal.'],['review','Review Before Production','Custom designs are reviewed before fulfillment.']] as Array<[BenefitIcon,string,string]>).map(([icon,title,copy])=><article key={title}><i><BenefitIcon kind={icon}/></i><div><strong>{title}</strong><p>{copy}</p></div></article>)}</section>
    </div>
}
