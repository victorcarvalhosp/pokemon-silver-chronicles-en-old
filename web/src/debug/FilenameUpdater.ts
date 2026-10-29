// Port of 020_Debug/003_Debug menus/008_Debug_FilenameUpdater.rb: the Debug
// menu's "Rename Outdated Files" (berry tree charsets gain an underscore, and
// map events that use them are updated). No plugin overrides it.
// Files are renamed through DevFiles.move, which only works under web/data/
// and PBS/: renaming Graphics/Characters/ files is refused, which is reported
// on the console (like Ruby's Console would report an error) and skipped.
// Maps are saved as web/data/maps/MapNNN.json.

import { Graphics } from "../rgss/Graphics";
import { _INTL } from "../ui/messageConfig";
import { Console, echo, echoln } from "./DebugConsole";
import { CompilerMapData } from "./DebugMenuExtraCode";
import { DevFiles } from "./devFiles";

/** Dir.glob pattern ("*", "?") -> RegExp for one file name. */
function globToRegExp(glob: string): RegExp {
  const src = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]");
  return new RegExp(`^${src}$`);
}

/** nil_or_empty?(string) */
function nilOrEmpty(s: string | null | undefined): boolean {
  return s === null || s === undefined || s === "";
}

const BERRY_TREE_SOIL = ["berrytreewet", "berrytreedamp", "berrytreedry", "berrytreeplanted"];

export const FilenameUpdater = {
  /** The files directly in `directory` matching any of `formats` (Dir.chdir + Dir.glob). */
  async readDirectoryFiles(directory: string, formats: string[]): Promise<string[]> {
    const files: string[] = [];
    const all = (await DevFiles.list(directory)).filter((f) => !f.includes("/"));
    for (const format of formats) {
      const re = globToRegExp(format);
      for (const f of all) if (re.test(f)) files.push(f);
    }
    return files;
  },

  async renameBerryPlantCharsets(): Promise<boolean> {
    const srcDir = "Graphics/Characters/";
    // FileTest.directory?(src_dir): DevFiles.list returns [] for a missing folder.
    if ((await DevFiles.list(srcDir)).length === 0) return false;
    Console.echoLi(_INTL("Renaming berry tree charsets..."));
    let ret = false;
    // generates a list of all graphic files
    const files = await FilenameUpdater.readDirectoryFiles(srcDir, ["berrytree*.png"]);
    // starts automatic renaming
    for (const file of files) {
      if (/^berrytree_/.test(file)) continue;
      if (BERRY_TREE_SOIL.includes(file.split(".")[0]!)) continue;
      const newFile = file.replaceAll("berrytree", "berrytree_");
      try {
        await DevFiles.move(srcDir + file, srcDir + newFile);
        ret = true;
      } catch (e) {
        Console.echoError(_INTL("Couldn't rename {1} to {2}: {3}", srcDir + file, srcDir + newFile,
          (e as Error)?.message ?? String(e)));
      }
    }
    Console.echoDone(true);
    return ret;
  },

  async updateBerryTreeEventCharsets(): Promise<string[]> {
    const ret: string[] = [];
    const mapData = new CompilerMapData();
    let t = Math.floor(Date.now() / 1000);
    await Graphics.update();
    Console.echoLi(_INTL("Checking {1} maps for used berry tree charsets...", mapData.mapinfos.size));
    let idx = 0;
    for (const id of [...mapData.mapinfos.keys()].sort((a, b) => a - b)) {
      if (idx % 20 === 0) echo(".");
      idx += 1;
      if (idx % 250 === 0) await Graphics.update();
      const map = await mapData.getMap(id);
      if (!map || !mapData.mapinfos.get(id)) continue;
      let changed = false;
      for (const event of map.events) {
        if (Math.floor(Date.now() / 1000) - t >= 5) {
          await Graphics.update();
          t = Math.floor(Date.now() / 1000);
        }
        for (const page of event.pages) {
          if (nilOrEmpty(page.graphic.characterName)) continue;
          const charName = page.graphic.characterName;
          if (!/^berrytree[^_]+/.test(charName)) continue;
          if (BERRY_TREE_SOIL.includes(charName.split(".")[0]!)) continue;
          const newFile = page.graphic.characterName.replaceAll("berrytree", "berrytree_");
          page.graphic.characterName = newFile;
          changed = true;
        }
      }
      if (!changed) continue;
      await mapData.saveMap(id);
      ret.push(_INTL("Map {1}: '{2}' was modified and saved.", id, mapData.mapinfos.get(id)!.name));
    }
    Console.echoDone(true);
    return ret;
  },

  async renameFiles(): Promise<void> {
    Console.echoH1("Updating file names and locations");
    let changeRecord: string[] = [];
    // Add underscore to berry plant charsets
    if (await FilenameUpdater.renameBerryPlantCharsets()) {
      Console.echoWarn(_INTL("Berry plant charset files were renamed."));
    }
    changeRecord = changeRecord.concat(await FilenameUpdater.updateBerryTreeEventCharsets());
    // Warn if any map data has been changed
    if (changeRecord.length > 0) {
      for (const msg of changeRecord) Console.echoWarn(msg);
      Console.echoWarn(_INTL("RMXP data was altered. Close RMXP now to ensure changes are applied."));
    }
    echoln("");
    Console.echoH2("Finished updating file names and locations", { text: "green" });
  },
};
