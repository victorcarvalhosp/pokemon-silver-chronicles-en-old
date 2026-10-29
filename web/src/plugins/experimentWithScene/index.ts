// Experiment with Scene (Plugins/ExperimentWithScene: Math Functions.rb,
// MyUI Module.rb, MyUI_Scene.rb, Scene Camera.rb). Imported once at boot
// (game/newGame.ts). Nothing in the game opens the scene; its Ruby entry
// point `MyUIScreen.new(MyUI::Scene.new).pbStartScreen` is registered for
// event scripts anyway.

import { defineScript } from "../../game/scriptApi";
import { MyUIScene, MyUIScreen } from "./MyUIScene";
import "./SceneCamera";

defineScript("MyUI::Scene.new", () => new MyUIScene());
defineScript("MyUIScreen.new", (_c, scene) => new MyUIScreen(scene as MyUIScene));
