import Header from "../header/Header";
import Main from "../main/Main";
import Footer from "../footer/Footer";
import './Layout.css'
import RouteMetadata from '../../app/RouteMetadata'

export default function Layout() {
    return (
        <>
            <RouteMetadata />
            <a className="skip-link" href="#main-content">Skip to main content</a>
            <Header />
            <main id="main-content">
                <Main />
            </main>
            <Footer />
        </>
    )
}
