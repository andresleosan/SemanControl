import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { ArrowRight, ArrowUpRight, ChevronDown } from "lucide-react";
import RoutePreview from "@/components/marketing/route-preview";
import InstallAppButton, { InstallAppProvider } from "@/components/marketing/install-app";
import styles from "./landing.module.css";

const manrope = Manrope({ subsets: ["latin"], display: "swap" });
const studioUrl = "https://www.alsdevstudio.com/";
const demoUrl = `https://wa.me/573146432135?text=${encodeURIComponent("Hola ALS DevStudio, quiero solicitar una demostración de SemanControl para mi negocio.")}`;
const title = "SemanControl | Ventas fiadas y cobranza en ruta";
const description = "De la tarjeta física al control de cada visita. Organiza clientes, abonos, mercancía y cierres de recorrido desde el celular con SemanControl.";

export const metadata: Metadata = {
  title, description,
  alternates: { canonical: "https://semancontrol.pages.dev/" },
  robots: { index: true, follow: true },
  openGraph: {
    title, description, type: "website", locale: "es_CO", siteName: "SemanControl", url: "https://semancontrol.pages.dev/",
    images: [{ url: "https://semancontrol.pages.dev/semancontrol-social.png", width: 1200, height: 630, alt: "SemanControl: tu recorrido de cobro, con las cuentas claras." }],
  },
  twitter: { card: "summary_large_image", title, description, images: ["https://semancontrol.pages.dev/semancontrol-social.png"] },
};

function Brand() {
  return <a href="/" className={styles.brand} aria-label="SemanControl, inicio"><img src="/pwa-icon.svg" width="36" height="36" alt="" /><span>SemanControl<span className={styles.brandDot}>.</span></span></a>;
}
function DemoLink() {
  return <a href={demoUrl} target="_blank" rel="noopener noreferrer" className={styles.button}>Solicitar una demostración<ArrowUpRight size={19} aria-hidden="true" /><span className={styles.srOnly}> por WhatsApp con ALS DevStudio, abre una nueva pestaña</span></a>;
}
const benefits = [
  { title: "Clientes y saldos", text: "Conserva el orden de tus tarjetas y consulta la dirección, la referencia y el historial de cada cliente." },
  { title: "Visitas y abonos", text: "Registra pagos, productos entregados y comprobantes de transferencia junto a cada visita." },
  { title: "Mercancía", text: "Consulta la carga asignada al recorrido, los productos entregados y los sobrantes por devolver." },
  { title: "Cierre del recorrido", text: "Revisa efectivo, comprobantes y devoluciones. Registra las diferencias con su motivo." },
];
const steps = [
  { title: "Prepara la salida", text: "Asigna trabajadores y prepara la carga de productos antes de comenzar el recorrido." },
  { title: "Atiende cada tarjeta", text: "Desde el celular, consulta el saldo del cliente y registra lo ocurrido en la visita." },
  { title: "Revisa el cierre", text: "Compara el efectivo, verifica las transferencias en tu banco y concilia la mercancía que regresa." },
];
const questions = [
  { question: "¿Para qué negocios está pensado?", answer: "Para negocios que entregan productos fiados y visitan a sus clientes para recibir abonos. SemanControl reúne tarjetas, recorridos, mercancía y cierre en un mismo flujo de trabajo." },
  { question: "¿Puedo empezar con mis tarjetas físicas?", answer: "Sí. Puedes registrar cada cliente con su saldo actual revisado y conservar el orden de las tarjetas en el recorrido. La carga inicial se prepara antes de comenzar a operar." },
  { question: "¿Necesito instalar una aplicación?", answer: "Puedes abrir SemanControl en el navegador de tu celular o computador. También puedes añadirlo a la pantalla de inicio. El acceso se realiza con una cuenta de Google autorizada para tu negocio.", installation: true },
  { question: "¿Qué pasa si se pierde la señal?", answer: "En un recorrido que ya estaba abierto, las visitas pueden quedar pendientes en el teléfono. Se registran en el servidor al recuperar la conexión y confirmar la sincronización. Necesitas conexión para ingresar o volver a abrir la aplicación." },
  { question: "¿Mis clientes pueden consultar su saldo?", answer: "Sí. Puedes vincular la cuenta de Google de un cliente para que consulte únicamente su tarjeta, su historial y sus comprobantes." },
  { question: "¿Cómo lo llevo a mi negocio?", answer: "El botón de demostración abre WhatsApp con una solicitud preparada para ALS DevStudio. Tú decides cuándo enviarla. Revisamos cómo vendes y cobras, y definimos la configuración, la puesta en marcha y el alcance antes de presentarte una propuesta." },
];

export default function Home() {
  return <InstallAppProvider><div className={`${manrope.className} ${styles.page}`}>
    <a className={styles.skip} href="#contenido">Ir al contenido</a>
    <header className={styles.header}><div className={styles.nav}>
      <Brand />
      <nav aria-label="Navegación principal" className={styles.navLinks}><a href="#como-funciona">Cómo funciona</a><a href="#para-tu-negocio">Para tu negocio</a><a href="#preguntas">Preguntas</a></nav>
      <div className={styles.navActions}><InstallAppButton variant="header" className={styles.installNav} /><a href="/login" className={styles.login}>Ingresar <ArrowUpRight size={17} aria-hidden="true" /></a></div>
    </div></header>
    <main id="contenido">
      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroCopy}>
          <h1 id="hero-title">Controla tus ventas fiadas y cada recorrido de cobro.</h1>
          <p className={styles.heroDescription}>Consulta el saldo de cada cliente, registra abonos y entregas, y revisa lo recaudado al cerrar la ruta.</p>
          <div className={styles.heroActions}><DemoLink /><a href="#como-funciona" className={styles.textLink}>Ver cómo funciona</a></div>
        </div>
        <RoutePreview />
      </section>
      <section className={styles.benefits} id="para-tu-negocio" aria-labelledby="benefits-title">
        <div className={styles.sectionIntro}><h2 id="benefits-title">Tus tarjetas y movimientos en un solo registro.</h2><p>Puedes comenzar con los saldos revisados de tus tarjetas físicas y conservar el orden de tus clientes.</p></div>
        <div className={styles.benefitGrid}>{benefits.map(({ title: heading, text }) => <article key={heading} className={styles.benefit}><h3>{heading}</h3><p>{text}</p></article>)}</div>
      </section>
      <section className={styles.process} id="como-funciona" aria-labelledby="process-title"><div className={styles.processInner}>
        <h2 id="process-title">Cómo llevas cada recorrido.</h2>
        <div className={styles.steps}>{steps.map(({ title: heading, text }) => <article key={heading} className={styles.step}><h3>{heading}</h3><p>{text}</p></article>)}</div>
        <p className={styles.offlineNote}><strong>Si se pierde la señal:</strong> en una ruta que ya estaba abierta, las visitas pueden quedar pendientes en el teléfono. Confirma su registro al sincronizar. Para ingresar o volver a abrir la aplicación, necesitas conexión.</p>
      </div></section>
      <section className={styles.roles} aria-labelledby="roles-title">
        <div className={styles.sectionIntro}><h2 id="roles-title">Qué puede hacer cada persona.</h2></div>
        <div className={styles.roleGrid}>
          <article><h3>Administrador</h3><p>Gestiona productos, compras, cartera y trabajadores. Revisa las transferencias y las diferencias al cerrar el recorrido.</p></article>
          <article><h3>Trabajador</h3><p>Consulta las tarjetas y direcciones de su ruta. Registra abonos, entregas y comprobantes desde el celular.</p></article>
          <article><h3>Cliente</h3><p>Con una cuenta vinculada, consulta únicamente su tarjeta, su saldo, su historial y sus comprobantes.</p></article>
        </div>
      </section>
      <section className={styles.faq} id="preguntas" aria-labelledby="faq-title">
        <h2 id="faq-title">Preguntas frecuentes.</h2>
        <div className={styles.questions}>{questions.map(({ question, answer, installation }) => <details key={question} className={styles.question}><summary>{question}<ChevronDown size={20} aria-hidden="true" /></summary><p>{answer}</p>{installation && <div className={styles.installationAction}><InstallAppButton variant="hero" /></div>}</details>)}</div>
      </section>
      <section className={styles.contact} aria-labelledby="contact-title">
        <div className={styles.contactCopy}><h2 id="contact-title">Conoce cómo funciona en tu negocio.</h2><p>Cuéntale a ALS DevStudio qué vendes y cómo realizas tus cobros para definir la configuración y la puesta en marcha.</p><span className={styles.contactNote}>La solicitud se abre en WhatsApp. El alcance se acuerda antes de presentarte una propuesta.</span></div><DemoLink />
      </section>
    </main>
    <footer className={styles.footer}><div className={styles.footerTop}><Brand /><a href={studioUrl} target="_blank" rel="noopener noreferrer">Conoce ALS DevStudio <ArrowUpRight size={16} aria-hidden="true" /></a></div><div className={styles.footerBottom}><span>© 2026 SemanControl</span><a href="/login">Ingresar a mi cuenta <ArrowRight size={15} aria-hidden="true" /></a></div></footer>
  </div></InstallAppProvider>;
}
