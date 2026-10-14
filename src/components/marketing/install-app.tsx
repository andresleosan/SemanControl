"use client";

import { Download, ExternalLink, Smartphone, X } from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import styles from "./install-app.module.css";

type InstallChoice = { outcome: "accepted" | "dismissed"; platform: string };
type InstallPromptEvent = Event & {
  prompt: () => Promise<InstallChoice | void>;
  userChoice: Promise<InstallChoice>;
};

type InstallContextValue = {
  installed: boolean;
  prompting: boolean;
  install: (trigger: HTMLButtonElement) => void;
};

const InstallContext = createContext<InstallContextValue | null>(null);

/** One listener and one fallback dialog serve every install button on the landing. */
export function InstallAppProvider({ children }: { children: ReactNode }) {
  const [installed, setInstalled] = useState(false);
  const [prompting, setPrompting] = useState(false);
  const [notice, setNotice] = useState("");
  const deferredPrompt = useRef<InstallPromptEvent | null>(null);
  const promptInFlight = useRef(false);
  const installationConfirmed = useRef(false);
  const mounted = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    mounted.current = true;
    const standalone = window.matchMedia("(display-mode: standalone)");
    const isStandalone = () => standalone.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const updateDisplayMode = () => setInstalled(installationConfirmed.current || isStandalone());
    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      if (!deferredPrompt.current) deferredPrompt.current = event as InstallPromptEvent;
    };
    const onInstalled = () => {
      deferredPrompt.current = null;
      installationConfirmed.current = true;
      promptInFlight.current = false;
      setPrompting(false);
      setInstalled(true);
      dialog.current?.close();
    };

    updateDisplayMode();
    standalone.addEventListener("change", updateDisplayMode);
    window.addEventListener("beforeinstallprompt", onInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      mounted.current = false;
      standalone.removeEventListener("change", updateDisplayMode);
      window.removeEventListener("beforeinstallprompt", onInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function showHelp(message = "") {
    setNotice(message);
    if (!dialog.current?.open) dialog.current?.showModal();
    closeButton.current?.focus();
  }

  function install(button: HTMLButtonElement) {
    if (promptInFlight.current) return;
    trigger.current = button;
    const event = deferredPrompt.current;
    if (!event) {
      showHelp();
      return;
    }

    // A captured browser prompt is single-use and must run in this click gesture.
    deferredPrompt.current = null;
    promptInFlight.current = true;
    setPrompting(true);
    try {
      const result = event.prompt();
      void Promise.resolve(result)
        .then(() => event.userChoice)
        // An accepted prompt is not proof of installation; appinstalled confirms it.
        .catch(() => {
          if (mounted.current && !installationConfirmed.current) showHelp("El navegador no pudo abrir la instalación. Puedes seguir estos pasos.");
        })
        .finally(() => {
          promptInFlight.current = false;
          if (mounted.current) setPrompting(false);
        });
    } catch {
      promptInFlight.current = false;
      setPrompting(false);
      showHelp("El navegador no pudo abrir la instalación. Puedes seguir estos pasos.");
    }
  }

  return (
    <InstallContext.Provider value={{ installed, prompting, install }}>
      {children}
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClose={() => trigger.current?.focus()}
      >
        <div className={styles.dialogHeader}>
          <span className={styles.dialogIcon}><Smartphone size={23} aria-hidden="true" /></span>
          <button ref={closeButton} type="button" className={styles.close} onClick={() => dialog.current?.close()} aria-label="Cerrar instrucciones de instalación"><X size={21} aria-hidden="true" /></button>
        </div>
        <h2 id={titleId} className={styles.title}>SemanControl en tu celular</h2>
        <p id={descriptionId} className={styles.intro}>Instálala desde tu navegador para abrirla con un icono en la pantalla de inicio.</p>
        {notice && <p className={styles.notice} role="status">{notice}</p>}
        <ol className={styles.instructions}>
          <li><strong>Android · Chrome</strong><span>Abre el menú de tres puntos: «Instalar y crear acceso directo» → «Instalar». En algunas versiones aparece «Instalar app» o «Añadir a pantalla de inicio».</span></li>
          <li><strong>iPhone · Safari</strong><span>Pulsa Compartir y después «Añadir a pantalla de inicio». Activa «Abrir como app web» si aparece y toca «Añadir».</span></li>
          <li><strong>Computador · Chrome o Edge</strong><span>Busca el icono de instalación en la barra de direcciones o la opción para instalar en el menú del navegador.</span></li>
        </ol>
        <p className={styles.note}>Usa una ventana normal, fuera de incógnito. Si no aparece la opción, abre este sitio en Chrome o Safari; también puedes seguir usándolo en el navegador.</p>
        <a href="/login" className={styles.continue}>Entrar a SemanControl <ExternalLink size={16} aria-hidden="true" /></a>
      </dialog>
    </InstallContext.Provider>
  );
}

export default function InstallAppButton({ variant = "hero", className = "" }: { variant?: "header" | "hero"; className?: string }) {
  const context = useContext(InstallContext);
  if (!context) throw new Error("InstallAppButton requiere InstallAppProvider.");
  const buttonClass = `${styles.button} ${variant === "header" ? styles.header : styles.hero} ${className}`;

  if (context.installed) {
    return <a href="/login" className={buttonClass}><Smartphone size={18} aria-hidden="true" /><span>Abrir app</span></a>;
  }

  return (
    <button type="button" className={buttonClass} onClick={(event) => context.install(event.currentTarget)} disabled={context.prompting} aria-busy={context.prompting} aria-haspopup="dialog">
      <Download size={18} aria-hidden="true" /><span>Instalar app</span>
    </button>
  );
}
