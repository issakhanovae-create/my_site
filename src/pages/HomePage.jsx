import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import Masthead from "../components/Masthead.jsx";
import Hero from "../components/Hero.jsx";
import About from "../components/About.jsx";
import ResumeTuner from "../components/ResumeTuner.jsx";
import Air from "../components/Air.jsx";
import Now from "../components/Now.jsx";
import Gallery from "../components/Gallery.jsx";
import Shop from "../components/Shop.jsx";
import Facts from "../components/Facts.jsx";
import Footer from "../components/Footer.jsx";
import CartDialog from "../components/CartDialog.jsx";
import OrderDialog from "../components/OrderDialog.jsx";
import ConsultChat from "../components/ConsultChat.jsx";
import Toast from "../components/Toast.jsx";
export default function HomePage() {
  const location = useLocation();

  useEffect(() => {
    document.title = "Эльмира Исаханова — пресс-служба и телевидение";
    document.body.classList.remove("crm-page");
    const robots = document.querySelector('meta[name="robots"]');
    if (robots) robots.remove();
  }, []);

  useEffect(() => {
    const id = (location.hash || "").replace(/^#/, "");
    if (!id) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [location.hash]);

  return (
    <>
      <div className="aurora" aria-hidden="true" />
      <a className="skip" href="#about">
        К содержанию
      </a>
      <Masthead />
      <main id="top">
        <Hero />
        <About />
        <ResumeTuner />
        <Air />
        <Now />
        <Gallery />
        <Shop />
        <Facts />
      </main>
      <Footer />
      <CartDialog />
      <OrderDialog />
      <ConsultChat />
      <Toast />
    </>
  );
}
