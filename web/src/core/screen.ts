import { Application, TextureStyle } from "pixi.js";

export const SCREEN_WIDTH = 512;
export const SCREEN_HEIGHT = 384;

/** Creates the 512x384 renderer and keeps it scaled by whole numbers. */
export async function createScreen(host: HTMLElement): Promise<Application> {
  TextureStyle.defaultOptions.scaleMode = "nearest";
  const app = new Application();
  await app.init({
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    background: "#000000",
    antialias: false,
    resolution: 1,
    autoStart: false,
    preference: "webgl",
  });
  host.appendChild(app.canvas);
  const fit = () => {
    const scale = Math.max(1, Math.floor(Math.min(innerWidth / SCREEN_WIDTH, innerHeight / SCREEN_HEIGHT)));
    app.canvas.style.width = `${SCREEN_WIDTH * scale}px`;
    app.canvas.style.height = `${SCREEN_HEIGHT * scale}px`;
  };
  addEventListener("resize", fit);
  fit();
  addEventListener("keydown", (e) => {
    if (e.key === "F4" || (e.key === "Enter" && e.altKey)) {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void host.requestFullscreen();
    }
  });
  return app;
}
