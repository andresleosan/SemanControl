import { Google_Sans, Manrope } from "next/font/google";
import { ArrowLeft, ArrowUpRight, ClipboardCheck, CreditCard, LockKeyhole, Route, ShieldCheck } from "lucide-react";
import { GoogleSignInButton } from "./sign-in-button";
import styles from "./login.module.css";

const manrope = Manrope({ subsets: ["latin"], display: "swap" });
const googleSans = Google_Sans({ subsets: ["latin"], weight: "500", display: "swap", variable: "--font-google-sans", adjustFontFallback: false });

function JourneyIllustration() {
  return (
    <div className={styles.journey} aria-hidden="true">
      <svg className={styles.journeyPath} viewBox="0 0 360 220" fill="none">
        <path d="M48 29H256C310 29 331 56 304 91L287 113C272 132 244 140 213 140H113C74 140 54 162 67 186L78 205" stroke="currentColor" strokeWidth="2" strokeDasharray="5 7" strokeLinecap="round" />
        <circle cx="48" cy="29" r="5" fill="currentColor" />
        <circle cx="78" cy="205" r="5" fill="currentColor" />
      </svg>
      <div className={`${styles.journeyStop} ${styles.cards}`}>
        <span className={styles.stopIcon}><CreditCard size={20} /></span>
        <div><strong>Tarjetas en orden</strong><span>Cada cliente y su saldo</span></div>
      </div>
      <div className={`${styles.journeyStop} ${styles.visits}`}>
        <span className={styles.stopIcon}><Route size={20} /></span>
        <div><strong>Visitas registradas</strong><span>Abonos y entregas al día</span></div>
      </div>
      <div className={`${styles.journeyStop} ${styles.closing}`}>
        <span className={styles.stopIcon}><ClipboardCheck size={20} /></span>
        <div><strong>Un cierre claro</strong><span>Cuentas conciliadas</span></div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className={`${manrope.className} ${googleSans.variable} ${styles.page}`}>
      <header className={styles.header}>
        <a href="/" className={styles.brand} aria-label="SemanControl, inicio">
          <img src="/pwa-icon.svg" width={38} height={38} alt="" />
          <span>SemanControl<span className={styles.brandDot}>.</span></span>
        </a>
        <a href="/" className={styles.backLink}><ArrowLeft size={17} aria-hidden="true" />Volver al inicio</a>
      </header>

      <main className={styles.main}>
        <div className={styles.shell}>
          <aside className={styles.story} aria-labelledby="journey-title">
            <p className={styles.storyEyebrow}><span />TU NEGOCIO, EN ORDEN</p>
            <h2 id="journey-title">Tu recorrido,<br />con las cuentas <span>claras.</span></h2>
            <p className={styles.storyDescription}>De la primera visita al último abono. Todo lo que necesitas para seguir el día con confianza.</p>
            <JourneyIllustration />
          </aside>

          <section className={styles.access} aria-labelledby="login-title">
            <div className={styles.accessInner}>
              <p className={styles.accessEyebrow}><LockKeyhole size={14} aria-hidden="true" />ACCESO SEGURO</p>
              <h1 id="login-title">Ingresa a tu cuenta</h1>
              <p className={styles.description}>Qué bueno tenerte de vuelta. Continúa con Google para entrar a SemanControl.</p>
              <div className={styles.signIn}><GoogleSignInButton /></div>
              <div className={styles.accountNotice}>
                <ShieldCheck size={20} aria-hidden="true" />
                <p>Usa la cuenta autorizada por el administrador o vinculada a tu tarjeta.</p>
              </div>
              <div className={styles.help}>
                <p>¿Necesitas acceso?</p>
                <span>Contacta al administrador de tu negocio para que vincule tu cuenta de Google.</span>
              </div>
            </div>
          </section>
        </div>
      </main>

      <footer className={styles.footer}>
        <span>SemanControl · Tu operación, en orden.</span>
        <a href="https://www.alsdevstudio.com/" target="_blank" rel="noopener noreferrer">Desarrollado por ALS DevStudio<ArrowUpRight size={13} aria-hidden="true" /><span className={styles.srOnly}> (abre una nueva pestaña)</span></a>
      </footer>
    </div>
  );
}
