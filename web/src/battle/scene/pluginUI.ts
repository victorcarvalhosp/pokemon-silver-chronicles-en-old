// Essentials Deluxe's pbHideMoveInfo / pbHideBattleInfo / pbHideFocusPanel
// ([000] Essentials Patches/Fight Menu.rb:572-605). They hide Enhanced UI's
// Move Info / Battle Info windows (whose sprites Battle::Scene#pbInitSprites
// creates); the windows themselves (toggled with M/N in the fight/command
// menus) aren't ported. Focus Meter System isn't installed.

/** The parts of the scene these touch. */
interface PluginUIScene {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sprites: Record<string, any>;
  moveUIToggle: boolean | undefined;
  infoUIToggle: boolean | undefined;
  focusToggle: boolean | undefined;
}

export function pbHideMoveInfo(scene: PluginUIScene): void {
  if (scene.moveUIToggle === undefined) return;
  scene.moveUIToggle = false;
  if (scene.sprites.moveinfo) {
    scene.sprites.moveinfo.visible = false;
    scene.sprites.moveinfo.bitmap?.clear();
  }
}

export function pbHideBattleInfo(scene: PluginUIScene): void {
  if (scene.infoUIToggle === undefined) return;
  scene.infoUIToggle = false;
  for (const key of ["infobitmap", "infotext", "infoselect"]) {
    if (scene.sprites[key]) scene.sprites[key].visible = false;
  }
  scene.sprites.infobitmap?.bitmap?.clear();
  scene.sprites.infotext?.bitmap?.clear();
}

export function pbHideFocusPanel(scene: PluginUIScene): void {
  if (scene.focusToggle === undefined) return;
  scene.focusToggle = false;
  if (scene.sprites.panel) scene.sprites.panel.visible = false;
  if (scene.sprites.focus) scene.sprites.focus.visible = false;
}
