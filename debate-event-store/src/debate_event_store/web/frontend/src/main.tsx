// reflect-metadata MUST be the first import in the entire app. tsyringe's
// @injectable() decorator needs the metadata polyfill installed before any
// class with decorators is evaluated.
import "reflect-metadata";
import { createRoot } from "react-dom/client";
import { container } from "tsyringe";
import ContainerProvider from "./tsyringe-hooks/ContainerProvider";
import { configureContainer } from "./lib/di";
import { App } from "./App";
import "./App.css";

configureContainer(container);

createRoot(document.getElementById("root")!).render(
  <ContainerProvider container={container}>
    <App />
  </ContainerProvider>,
);
