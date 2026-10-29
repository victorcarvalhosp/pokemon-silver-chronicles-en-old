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
    // Subtractive sprites (blend_type 2) and the weather's screen tone sample
    // what's already drawn, which Pixi's WebGL renderer only allows with a back buffer.
    useBackBuffer: true,
  });
  host.appendChild(app.canvas);
  const fit = () => {
    // The current size: Graphics.resizeScreen (the editors) can change it.
    const w = app.canvas.width, h = app.canvas.height;
    const scale = Math.max(1, Math.floor(Math.min(innerWidth / w, innerHeight / h)));
    app.canvas.style.width = `${w * scale}px`;
    app.canvas.style.height = `${h * scale}px`;
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
