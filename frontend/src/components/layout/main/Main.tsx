import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import ProtectedRoute from '../../auth/protected-route/ProtectedRoute'
import AdminRoute from '../../auth/admin-route/AdminRoute'
import LoadingState from '../../ui/loading-state/LoadingState'
import { FAQPage, PolicyPage, SupportPage } from '../../pages/policies/PolicyPages'

const Home = lazy(() => import('../../pages/home/Home'))
const About = lazy(() => import('../../pages/about/About'))
const ProductsList = lazy(() => import('../../store/products-list/ProductsList'))
const ProductDetails = lazy(() => import('../../store/product-details/ProductDetails'))
const Login = lazy(() => import('../../pages/auth/Login'))
const Register = lazy(() => import('../../pages/auth/Register'))
const Unauthorized = lazy(() => import('../../pages/auth/Unauthorized'))
const Profile = lazy(() => import('../../pages/profile/Profile'))
const CartPage = lazy(() => import('../../pages/cart/CartPage'))
const OrderHistory = lazy(() => import('../../pages/orders/OrderHistory'))
const OrderDetails = lazy(() => import('../../pages/orders/OrderDetails'))
const CreateAI = lazy(() => import('../../pages/ai/CreateAI'))
const MyDesigns = lazy(() => import('../../pages/ai/MyDesigns'))
const DesignDetails = lazy(() => import('../../pages/ai/DesignDetails'))
const AdminDashboard = lazy(() => import('../../pages/admin/AdminDashboard'))
const AdminReviews = lazy(() => import('../../pages/admin/AdminReviews'))
const AdminReviewDetails = lazy(() => import('../../pages/admin/AdminReviewDetails'))
const CreditsPage = lazy(() => import('../../pages/credits/CreditsPage'))
const AdminCredits = lazy(() => import('../../pages/admin/AdminCredits'))
const AdminCustomers = lazy(() => import('../../pages/admin/AdminCustomers'))
const AdminCustomerDetails = lazy(() => import('../../pages/admin/AdminCustomerDetails'))
const AdminOrders = lazy(() => import('../../pages/admin/AdminOrders'))
const AdminOrderDetails = lazy(() => import('../../pages/admin/AdminOrderDetails'))
const AdminProducts = lazy(() => import('../../pages/admin/AdminProducts'))
const NotFound = lazy(() => import('../../pages/not-found/NotFound'))

export default function Main() {
    return (
        <Suspense fallback={<LoadingState label="Opening page…" />}><Routes>
            <Route path="/" element={<Home />} />
            <Route path="/products" element={<ProductsList />} />
            <Route path="/products/:productId" element={<ProductDetails />} />
            <Route path="/about" element={<About />} />
            <Route path="/privacy" element={<PolicyPage policy="privacy" />} />
            <Route path="/terms" element={<PolicyPage policy="terms" />} />
            <Route path="/shipping-policy" element={<PolicyPage policy="shipping" />} />
            <Route path="/refund-policy" element={<PolicyPage policy="refunds" />} />
            <Route path="/ai-design-policy" element={<PolicyPage policy="ai" />} />
            <Route path="/content-policy" element={<PolicyPage policy="copyright" />} />
            <Route path="/faq" element={<FAQPage />} />
            <Route path="/support" element={<SupportPage />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/unauthorized" element={<Unauthorized />} />
            <Route element={<ProtectedRoute />}>
                <Route path="/profile" element={<Profile />} />
                <Route path="/cart" element={<CartPage />} />
                <Route path="/orders" element={<OrderHistory />} />
                <Route path="/orders/:orderId" element={<OrderDetails />} />
                <Route path="/create-ai" element={<CreateAI />} />
                <Route path="/designs" element={<MyDesigns />} />
                <Route path="/designs/:designId" element={<DesignDetails />} />
                <Route path="/credits" element={<CreditsPage />} />
            </Route>
            <Route element={<AdminRoute />}>
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/admin/reviews" element={<AdminReviews />} />
                <Route path="/admin/reviews/:itemId" element={<AdminReviewDetails />} />
                <Route path="/admin/credits" element={<AdminCredits />} />
                <Route path="/admin/customers" element={<AdminCustomers />} />
                <Route path="/admin/customers/:userId" element={<AdminCustomerDetails />} />
                <Route path="/admin/orders" element={<AdminOrders />} />
                <Route path="/admin/orders/:orderId" element={<AdminOrderDetails />} />
                <Route path="/admin/products" element={<AdminProducts />} />
            </Route>
            <Route path="*" element={<NotFound />} />
        </Routes></Suspense>
    )
}
