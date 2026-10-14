import { createRoot } from "react-dom/client";
import InventoryPage from "../../src/app/admin/inventario/page";
import ClientsPage from "../../src/app/admin/clientes/client-directory";
import ClosurePage from "../../src/app/admin/cierre/page";
import MyAccountPage from "../../src/app/mi-cuenta/page";
import RouteBoard from "../../src/app/ruta/route-board";
import RouteSummary from "../../src/app/ruta/resumen/route-summary";
import VisitView from "../../src/app/ruta/cliente/[id]/visit-view";

const url = new URL(window.location.href);
const dispatch = url.searchParams.get("dispatch_id") ?? "";
const clientId = url.pathname.startsWith("/ruta/cliente/") ? decodeURIComponent(url.pathname.slice("/ruta/cliente/".length)) : "";
const screen = url.pathname === "/admin/inventario" ? <InventoryPage />
  : url.pathname === "/admin/clientes" ? <ClientsPage initialClientId={url.searchParams.get("client_id") ?? ""} />
  : url.pathname === "/admin/cierre" ? <ClosurePage />
  : url.pathname === "/mi-cuenta" ? <MyAccountPage />
  : url.pathname === "/ruta/resumen" ? <RouteSummary initialDispatch={dispatch} />
  : clientId ? <VisitView id={clientId} dispatch={dispatch} />
  : <RouteBoard initialDispatch={dispatch} />;
createRoot(document.getElementById("root")!).render(screen);
