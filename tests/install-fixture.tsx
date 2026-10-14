import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import InstallAppButton, { InstallAppProvider } from "../src/components/marketing/install-app";

function InstallFixture() {
  useEffect(() => { document.documentElement.dataset.installFixtureReady = "true"; }, []);
  return (
    <InstallAppProvider>
      <header><InstallAppButton variant="header" /></header>
      <main><h1>Instalación de SemanControl</h1><InstallAppButton variant="hero" /></main>
    </InstallAppProvider>
  );
}

createRoot(document.getElementById("root")!).render(<InstallFixture />);
