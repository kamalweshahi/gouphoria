import { Link } from 'react-router-dom'
import type Product from '../../../models/Product'
import './ProductCard.css'

interface ProductCardProps {
    product: Product
}

function formatPrice(product: Product) {
    if (product.price === null) return 'Select an option'
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: product.currency || 'USD'
    }).format(product.price)
}

export default function ProductCard({ product }: ProductCardProps) {
    const aiOnly = product.aiCustomOnly || product.allowDirectPurchase === false
    const supportsAI = product.allowAiCustomization === true
    return (
        <article className="product-card">
            <div className="product-image-wrap">
                {product.image ? <img src={product.image} alt={product.displayName || product.title} loading="lazy" decoding="async" /> : <div className="image-placeholder">Image unavailable</div>}
                <div className="product-badges">{supportsAI && <span className="badge ai-badge">AI Custom</span>}</div>
            </div>
            <div className="product-info">
                <p className="product-category">{product.storefrontCategory || 'Phone case'}</p>
                <h2 title={product.title}>{product.displayName || product.title}</h2>
                <p className="product-description">{product.description || 'A custom phone case available in supported models.'}</p>
                <div className="product-bottom">
                    <strong>{formatPrice(product)}</strong>
                    <span>{product.variantsCount} variants</span>
                </div>
                <div className="product-card-actions">
                    {aiOnly
                        ? <Link to={`/create-ai?productId=${encodeURIComponent(product.id)}`} className="view-product-button">Start designing</Link>
                        : <Link to={`/products/${product.id}`} className="view-product-button">View product</Link>}
                    {!aiOnly && supportsAI && <Link to={`/create-ai?productId=${encodeURIComponent(product.id)}`} className="customize-product-link">Customize with AI</Link>}
                </div>
            </div>
        </article>
    )
}
