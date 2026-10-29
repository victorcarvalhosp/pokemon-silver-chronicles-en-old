// `pnpm dev:stable`: the dev server on :5318 without hot reload or file
// watching, so a running game isn't reloaded while files change under it.
import { mergeConfig } from "vite";
import base from "./vite.config";

export default mergeConfig(base, { server: { hmr: false, port: 5318, strictPort: true, watch: null } });
