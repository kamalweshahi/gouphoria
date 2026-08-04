import { useEffect, useMemo, useState } from 'react'
import type Product from '../../../models/Product'
import { getAllProducts } from '../../../services/products'
import ProductCard from '../product-card/ProductCard'
import LoadingState from '../../ui/loading-state/LoadingState'
import EmptyState from '../../ui/empty-state/EmptyState'
import './ProductsList.css'

export default function ProductsList() {
    const [products, setProducts] = useState<Product[]>([])
    const [search, setSearch] = useState('')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    useEffect(() => {
        getAllProducts()
            .then(setProducts)
            .catch((err) => setError(err.response?.data?.message || 'The phone-case catalog is temporarily unavailable. Please try again shortly.'))
            .finally(() => setLoading(false))
    }, [])

    const filteredProducts = useMemo(() => {
        const keyword = search.trim().toLowerCase()
        if (!keyword) return products
        return products.filter(product =>
            (product.displayName || product.title).toLowerCase().includes(keyword) ||
            product.description.toLowerCase().includes(keyword) ||
            product.tags.some(tag => tag.toLowerCase().includes(keyword))
        )
    }, [products, search])

    return (
        <section className="products-page">
            <div className="shop-heading">
                <span className="eyebrow">Shop</span>
                <h1>Find the right case for your phone.</h1>
                <p>Choose from supported phone cases, then select the exact model and available case type before payment.</p>
            </div>

            <div className="toolbar">
                <input id="catalog-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search phone cases..." aria-label="Search phone cases" />
                <span aria-live="polite">{filteredProducts.length} {filteredProducts.length === 1 ? 'product' : 'products'}</span>
            </div>

            {loading && <LoadingState label="Loading phone cases" />}
            {error && <p className="error" role="alert">{error}</p>}

            <div className="product-grid">
                {filteredProducts.map(product => <ProductCard key={product.id} product={product} />)}
            </div>

            {!loading && !error && filteredProducts.length === 0 && <EmptyState title="No matching phone cases" message={search ? 'Try a broader search term.' : 'No supported phone cases are currently available.'} />}
        </section>
    )
}
