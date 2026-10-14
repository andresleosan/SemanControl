import { ArrowUpRight, Check, CheckCheck, MapPin, Route, WalletCards } from "lucide-react";
import styles from "./route-preview.module.css";

const exampleClients = [
  { order: "07", name: "Cliente de ejemplo A", reference: "Visita completada", balance: "$45.000", visited: true },
  { order: "08", name: "Cliente de ejemplo B", reference: "Casa de reja verde", balance: "$85.000", active: true },
  { order: "09", name: "Cliente de ejemplo C", reference: "Siguiente en el recorrido", balance: "$30.000" },
];

export default function RoutePreview() {
  return (
    <figure className={styles.preview} aria-label="Ejemplo ilustrativo de un recorrido y el registro de una visita en SemanControl">
      <div className={styles.glow} aria-hidden="true" />
      <svg className={styles.orbit} viewBox="0 0 540 540" fill="none" aria-hidden="true">
        <path d="M47 367C-6 266 66 130 195 94C321 58 476 105 493 245C509 383 432 481 302 484C166 488 120 427 139 354C157 285 249 271 311 317" stroke="currentColor" strokeWidth="1.5" strokeDasharray="5 8" />
        <circle cx="47" cy="367" r="5" fill="currentColor" />
        <circle cx="311" cy="317" r="5" fill="currentColor" />
      </svg>

      <div className={styles.board}>
        <div className={styles.boardHeader}>
          <div className={styles.boardTitle}>
            <span className={styles.routeIcon}><Route size={23} strokeWidth={1.8} aria-hidden="true" /></span>
            <div><span className={styles.eyebrow}>SEMANCONTROL</span><h2>Mi ruta</h2></div>
          </div>
          <span className={styles.day}>Viernes</span>
        </div>

        <div className={styles.stats}>
          <div><strong>12</strong><span>tarjetas</span></div>
          <div><strong>8</strong><span>visitadas</span></div>
          <div><strong>4</strong><span>por visitar</span></div>
        </div>

        <div className={styles.list}>
          {exampleClients.map((client) => (
            <div className={`${styles.client} ${client.active ? styles.active : ""}`} key={client.order}>
              <span className={styles.order}>#{client.order}</span>
              <div className={styles.clientDetails}>
                <strong>{client.name}</strong>
                <span>{client.visited && <Check size={11} aria-hidden="true" />}{client.active && <MapPin size={11} aria-hidden="true" />}{client.reference}</span>
              </div>
              <div className={styles.balance}><strong>{client.balance}</strong><span>saldo</span></div>
            </div>
          ))}
        </div>
        <div className={styles.boardFooter}><WalletCards size={14} aria-hidden="true" /><span>Una tarjeta. Toda su historia.</span><ArrowUpRight size={15} aria-hidden="true" /></div>
      </div>

      <div className={styles.receipt}>
        <div className={styles.receiptStatus}><span><CheckCheck size={18} strokeWidth={2} aria-hidden="true" /></span><strong>Visita registrada</strong></div>
        <div className={styles.receiptPayment}><span>Abono en efectivo</span><strong>$20.000</strong></div>
        <div className={styles.perforation} aria-hidden="true" />
        <div className={styles.receiptTotal}><span>Nuevo saldo</span><strong>$85.000</strong></div>
      </div>

      <figcaption className={styles.caption}>Ejemplo ilustrativo · Datos ficticios</figcaption>
    </figure>
  );
}
