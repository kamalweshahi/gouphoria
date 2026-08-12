import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const routes: Array<{ match: (path: string) => boolean; title: string; description: string; private?: boolean }> = [
    { match: path => path === '/', title: 'Gouphoria — Premium Phone Cases', description: 'Shop premium phone cases for your model or design your own custom case with Gouphoria.' },
    { match: path => path.startsWith('/products/'), title: 'Case Details — Gouphoria', description: 'Choose a supported phone model and case type with current verified pricing.' },
    { match: path => path === '/products', title: 'Cases — Gouphoria', description: 'Explore Gouphoria phone cases and choose the exact fit for your device.' },
    { match: path => path === '/about', title: 'About Gouphoria', description: 'Learn how Gouphoria AI design, human review, secure payment, production, and delivery work together.' },
    { match: path => path === '/privacy', title: 'Privacy Policy — Gouphoria', description: 'How Gouphoria uses account, design, order, payment-reference, and production information.' },
    { match: path => path === '/terms', title: 'Terms and Conditions — Gouphoria', description: 'Terms for Gouphoria accounts, products, AI designs, payments, and orders.' },
    { match: path => path === '/shipping-policy', title: 'Shipping Policy — Gouphoria', description: 'How shipping options, production, tracking, and split shipments work.' },
    { match: path => path === '/refund-policy', title: 'Refund and Return Policy — Gouphoria', description: 'Review the policy for standard and AI-custom products.' },
    { match: path => path === '/ai-design-policy', title: 'AI Design Policy — Gouphoria', description: 'Important expectations for AI artwork, previews, review, and printing.' },
    { match: path => path === '/content-policy', title: 'Content and Copyright — Gouphoria', description: 'Your responsibilities when submitting images, prompts, logos, and protected content.' },
    { match: path => path === '/faq', title: 'Frequently Asked Questions — Gouphoria', description: 'Answers about AI credits, custom cases, payment, shipping, and tracking.' },
    { match: path => path === '/support', title: 'Contact Gouphoria', description: 'Get help with an order, payment, shipment, design, product, or account.' },
    { match: path => path === '/login', title: 'Log In — Gouphoria', description: 'Log in to continue creating, shopping, and reviewing your private designs.', private: true },
    { match: path => path === '/register', title: 'Create an Account — Gouphoria', description: 'Create your Gouphoria account and receive the included AI project allowance.', private: true },
    { match: path => path.startsWith('/create-ai'), title: 'Create with AI — Gouphoria', description: 'Build private, personalized phone-case artwork with guided AI generation.', private: true },
    { match: path => path.startsWith('/designs'), title: 'My Designs — Gouphoria', description: 'Review your private AI phone-case designs and their order status.', private: true },
    { match: path => path.startsWith('/cart'), title: 'Cart — Gouphoria', description: 'Review your phone cases and prepare secure PayPal checkout.', private: true },
    { match: path => path.startsWith('/orders'), title: 'Orders — Gouphoria', description: 'Review payment, design approval, production, and tracking status.', private: true },
    { match: path => path.startsWith('/credits'), title: 'AI Credits — Gouphoria', description: 'Review your balance, purchase AI credits, and view credit history.', private: true },
    { match: path => path.startsWith('/profile'), title: 'Profile — Gouphoria', description: 'Manage your Gouphoria account and open your orders, designs, and credits.', private: true },
    { match: path => path.startsWith('/admin'), title: 'Administration — Gouphoria', description: 'Protected Gouphoria administration.', private: true }
]

export default function RouteMetadata() {
    const { pathname } = useLocation()
    useEffect(() => {
        const metadata = routes.find(route => route.match(pathname)) ?? { title: 'Page Not Found — Gouphoria', description: 'The requested Gouphoria page could not be found.', private: true }
        document.title = metadata.title
        document.querySelector('meta[name="description"]')?.setAttribute('content', metadata.description)
        document.querySelector('meta[name="robots"]')?.setAttribute('content', metadata.private ? 'noindex,nofollow' : 'index,follow')
        document.querySelector('meta[property="og:title"]')?.setAttribute('content', metadata.title)
        document.querySelector('meta[property="og:description"]')?.setAttribute('content', metadata.description)
        document.querySelector('meta[name="twitter:title"]')?.setAttribute('content', metadata.title)
        document.querySelector('meta[name="twitter:description"]')?.setAttribute('content', metadata.description)
    }, [pathname])
    return null
}
