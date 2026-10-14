import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { ArrowDown, ArrowRight, ArrowUpRight, Check, ChevronDown, ClipboardCheck, CreditCard, MapPin, Package, Route, ShieldCheck, Smartphone, Users, Wallet, WifiOff } from "lucide-react";
import RoutePreview from "@/components/marketing/route-preview";
import InstallAppButton, { InstallAppProvider } from "@/components/marketing/install-app";
import styles from "./landing.module.css";

const manrope = Manrope({ subsets: ["latin"], display: "swap" });
const demoUrl = "https://www.alsdevstudio.com/";
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
function DemoLink({ light = false }: { light?: boolean }) {
  return <a href={demoUrl} target="_blank" rel="noopener noreferrer" className={`${styles.button} ${light ? styles.buttonLight : ""}`}>Solicitar una demostración<ArrowUpRight size={19} aria-hidden="true" /><span className={styles.srOnly}> en ALS DevStudio, abre una nueva pestaña</span></a>;
}
const benefits = [
  { icon: CreditCard, title: "Cada tarjeta, en su lugar", text: "Conserva el orden de tu recorrido. Encuentra la dirección, la referencia y el saldo de cada cliente." },
  { icon: Wallet, title: "Cada visita, registrada", text: "Anota abonos y productos entregados en el mismo momento. Consulta el historial que explica cada saldo." },
  { icon: Package, title: "La mercancía, a la vista", text: "Conecta la bodega con la calle: carga asignada, productos entregados y sobrantes por devolver." },
  { icon: ClipboardCheck, title: "Un cierre con respaldo", text: "Revisa efectivo, comprobantes y devoluciones. Deja las diferencias registradas con su motivo." },
];
const steps = [
  { icon: Package, title: "Prepara la salida", text: "Organiza tus clientes, asigna trabajadores y prepara la carga de productos del recorrido." },
  { icon: Route, title: "Atiende cada tarjeta", text: "Desde el celular, consulta el saldo y registra abonos, entregas y comprobantes de transferencia." },
  { icon: ClipboardCheck, title: "Cierra con claridad", text: "Compara el efectivo, revisa las transferencias en tu banco y concilia la mercancía que regresa." },
];
const questions = [
  { question: "¿Para qué negocios está pensado?", answer: "Para negocios que entregan productos fiados y visitan a sus clientes para recibir abonos. SemanControl reúne tarjetas, recorridos, mercancía y cierre en un mismo flujo de trabajo." },
  { question: "¿Puedo empezar con mis tarjetas físicas?", answer: "Sí. Puedes registrar cada cliente con su saldo actual revisado y conservar el orden de las tarjetas en el recorrido. La carga inicial se prepara antes de comenzar a operar." },
  { question: "¿Necesito instalar una aplicación?", answer: "Puedes abrir SemanControl en el navegador de tu celular o computador. También puedes añadirlo a la pantalla de inicio. El acceso se realiza con una cuenta de Google autorizada para tu negocio." },
  { question: "¿Qué pasa si se pierde la señal?", answer: "En un recorrido que ya estaba abierto, las visitas pueden quedar pendientes en el teléfono. Se registran en el servidor al recuperar la conexión y confirmar la sincronización. Necesitas conexión para ingresar o volver a abrir la aplicación." },
  { question: "¿Mis clientes pueden consultar su saldo?", answer: "Sí. Puedes vincular la cuenta de Google de un cliente para que consulte únicamente su tarjeta, su historial y sus comprobantes." },
  { question: "¿Cómo lo llevo a mi negocio?", answer: "Solicita una demostración a través de ALS DevStudio. Revisamos cómo vendes y cobras, y definimos la configuración, la puesta en marcha y el alcance antes de presentarte una propuesta." },
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
          <p className={styles.eyebrow}><span className={styles.statusDot} /> PARA NEGOCIOS QUE VENDEN FIADO</p>
          <h1 id="hero-title">Tu recorrido de cobro,<br /><span>con las cuentas claras.</span></h1>
          <p className={styles.heroDescription}>De la tarjeta de papel al control de cada visita. Organiza tus clientes, registra abonos y entregas, y conoce cómo termina cada recorrido.</p>
          <div className={styles.heroActions}><DemoLink /><InstallAppButton variant="hero" /><a href="#como-funciona" className={styles.textLink}>Ver cómo funciona <ArrowDown size={17} aria-hidden="true" /></a></div>
          <div className={styles.heroNotes}><span><Smartphone size={16} aria-hidden="true" /> Desde tu celular</span><span><ShieldCheck size={16} aria-hidden="true" /> Acceso por roles</span></div>
        </div>
        <RoutePreview />
        <div className={styles.heroFoot}><span>LAS TARJETAS CAMBIAN. TU RECORRIDO SIGUE SIENDO TUYO.</span><span className={styles.heroFootArrow}><ArrowDown size={17} aria-hidden="true" /> Desliza para conocerlo</span></div>
      </section>
      <section className={styles.benefits} id="para-tu-negocio" aria-labelledby="benefits-title">
        <div className={styles.sectionIntro}><p className={styles.eyebrow}>EL CONTROL VA CONTIGO</p><h2 id="benefits-title">Tu negocio está en la calle.<br />Tus cuentas también pueden estar al día.</h2><p>La información que necesitas, desde que preparas la carga hasta que cierras el recorrido.</p></div>
        <div className={styles.benefitGrid}>{benefits.map(({ icon: Icon, title: heading, text }) => <article key={heading} className={styles.benefit}><Icon size={25} strokeWidth={1.6} aria-hidden="true" /><h3>{heading}</h3><p>{text}</p></article>)}</div>
      </section>
      <section className={styles.paperSection} aria-labelledby="paper-title">
        <div className={styles.paperVisual}>
          <div className={styles.paperCard} aria-hidden="true"><span className={styles.paperNumber}>TARJETA 08</span><strong>Cliente de ejemplo</strong><span>Referencia: reja verde</span><div className={styles.paperTable}><span>FECHA</span><span>ABONO</span><span>SALDO</span><span>Viernes</span><span>$20.000</span><span>$85.000</span></div><div className={styles.paperLines} /><span className={styles.paperAnnotation}>Cada visita tiene su historia.</span></div>
          <div className={styles.digitalMovement}><span className={styles.movementIcon}><Check size={20} aria-hidden="true" /></span><div><strong>Abono registrado</strong><span>Efectivo · Tarjeta 08</span></div><strong>$20.000</strong></div>
          <p className={styles.illustrationCaption}>Ejemplo ilustrativo · Datos ficticios</p>
        </div>
        <div className={styles.paperCopy}><p className={styles.eyebrow}>DE LA TARJETA FÍSICA A LA DIGITAL</p><h2 id="paper-title">La misma ruta.<br />Una forma más clara<br />de llevarla.</h2><p>Tu forma de vender tiene una historia. SemanControl conserva el orden de tus clientes y reúne la información de cada visita, para que puedas consultarla cuando la necesites.</p><ul className={styles.checkList}><li><Check size={18} aria-hidden="true" /> Clientes en el orden de tu recorrido.</li><li><Check size={18} aria-hidden="true" /> Saldos e historial en una sola tarjeta.</li><li><Check size={18} aria-hidden="true" /> Comprobantes de transferencia junto a cada visita.</li></ul><a href={demoUrl} target="_blank" rel="noopener noreferrer" className={styles.textLink}>Conversemos sobre tu negocio <ArrowUpRight size={18} aria-hidden="true" /><span className={styles.srOnly}> en ALS DevStudio, abre una nueva pestaña</span></a></div>
      </section>
      <section className={styles.process} id="como-funciona" aria-labelledby="process-title"><div className={styles.processInner}>
        <div className={styles.processHeading}><div><p className={styles.eyebrow}>DE LA BODEGA AL CIERRE</p><h2 id="process-title">Un recorrido completo.<br />Un solo lugar para llevarlo.</h2></div><p>Una secuencia sencilla, pensada para el trabajo de cada semana.</p></div>
        <div className={styles.steps}>{steps.map(({ icon: Icon, title: heading, text }, index) => <article key={heading} className={styles.step}><div className={styles.stepTop}><span>0{index + 1}</span><Icon size={28} strokeWidth={1.5} aria-hidden="true" /></div><h3>{heading}</h3><p>{text}</p></article>)}</div>
        <div className={styles.offlineNote}><WifiOff size={22} aria-hidden="true" /><p><strong>La señal puede fallar. El estado de la visita debe quedar claro.</strong> En una ruta abierta, conserva visitas pendientes en el teléfono y confirma su registro al sincronizar. Para ingresar o reabrir, necesitas conexión.</p></div>
      </div></section>
      <section className={styles.roles} aria-labelledby="roles-title">
        <div className={styles.sectionIntro}><p className={styles.eyebrow}>CADA PERSONA, SU VISTA</p><h2 id="roles-title">El equipo conectado.<br />La información que le corresponde a cada uno.</h2></div>
        <div className={styles.roleGrid}>
          <article><div className={styles.roleIcon}><Package size={25} aria-hidden="true" /></div><p className={styles.roleLabel}>PARA QUIEN ADMINISTRA</p><h3>La visión del negocio.</h3><p>Productos, compras, cartera, trabajadores y cierre. Revisa las transferencias y entiende las diferencias del recorrido.</p><span className={styles.roleTag}>Bodega y control</span></article>
          <article><div className={styles.roleIcon}><Route size={25} aria-hidden="true" /></div><p className={styles.roleLabel}>PARA QUIEN HACE LA RUTA</p><h3>Todo a la mano.</h3><p>Tarjetas ordenadas, direcciones, abonos y entregas. Lleva el registro de cada visita desde el celular.</p><span className={styles.roleTag}>Visitas y cobros</span></article>
          <article><div className={styles.roleIcon}><Users size={25} aria-hidden="true" /></div><p className={styles.roleLabel}>PARA TU CLIENTE</p><h3>Su cuenta, más clara.</h3><p>Una cuenta vinculada permite consultar su propio saldo, historial y comprobantes, cuando lo necesite.</p><span className={styles.roleTag}>Consulta de su tarjeta</span></article>
        </div>
      </section>
      <section className={styles.faq} id="preguntas" aria-labelledby="faq-title">
        <div className={styles.faqIntro}><p className={styles.eyebrow}>ANTES DE EMPEZAR</p><h2 id="faq-title">Resolvamos<br />tus dudas.</h2><p>Cada negocio tiene su recorrido. Te ayudamos a entender cómo encaja SemanControl en el tuyo.</p></div>
        <div className={styles.questions}>{questions.map(({ question, answer }) => <details key={question} className={styles.question}><summary>{question}<ChevronDown size={20} aria-hidden="true" /></summary><p>{answer}</p></details>)}</div>
      </section>
      <section className={styles.contact} aria-labelledby="contact-title">
        <div className={styles.contactCopy}><p className={styles.eyebrow}>EL SIGUIENTE PASO EMPIEZA CON UNA CONVERSACIÓN</p><h2 id="contact-title">Tu próximo recorrido,<br />con más claridad.</h2><p>Cuéntanos qué vendes y cómo realizas tus cobros. Veamos cómo llevar SemanControl a tu negocio.</p><DemoLink light /><span className={styles.contactNote}>Atención a través de ALS DevStudio. La puesta en marcha y el alcance se definen para cada negocio.</span></div>
        <div className={styles.contactRoute} aria-hidden="true"><svg viewBox="0 0 400 400" fill="none"><path d="M50 300H215C290 300 290 180 215 180H185C110 180 110 60 185 60H350" stroke="currentColor" strokeWidth="2" strokeDasharray="7 9" /><circle cx="50" cy="300" r="13" fill="currentColor" /><circle cx="350" cy="60" r="13" fill="currentColor" /><circle cx="215" cy="180" r="8" fill="currentColor" /></svg><div className={styles.routeDestination}><MapPin size={30} strokeWidth={1.5} /><span>Cuentas claras.<br />Camino adelante.</span></div></div>
      </section>
    </main>
    <footer className={styles.footer}><div className={styles.footerTop}><Brand /><p>Tu recorrido, tus tarjetas<br />y tus cuentas en un solo lugar.</p><a href={demoUrl} target="_blank" rel="noopener noreferrer">Conoce ALS DevStudio <ArrowUpRight size={16} aria-hidden="true" /></a></div><div className={styles.footerBottom}><span>© 2026 SemanControl</span><span>Hecho para llevar el control de cada visita.</span><a href="/login">Ingresar a mi cuenta <ArrowRight size={15} aria-hidden="true" /></a></div></footer>
  </div></InstallAppProvider>;
}
