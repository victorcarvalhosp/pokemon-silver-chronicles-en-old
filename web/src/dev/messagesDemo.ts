// Dev page for the window/message system (web/dev-messages.html).
// Draws Map003 (the player's house) with its events and plays real dialogue
// from Map003 / Map051: speech bubbles with \f faces, the intro's centred
// transparent text, choices, number input, command window and text codes.
//
//   Enter/Space/C = USE   Esc/X = BACK   arrows move cursors
//   ?step=N starts at step N, ?speed=0|1|2 sets the text speed option

import { createScreen } from "../core/screen";
import { loadMap, loadSystem, loadTileset } from "../data/loader";
import { Data } from "../data/store";
import { GameSystem } from "../game/GameSystem";
import { type CharacterLike, G } from "../game/globals";
import { TilemapRenderer } from "../map/TilemapRenderer";
import { Bitmap } from "../rgss/Bitmap";
import { Sprite, Viewport } from "../rgss/display";
import { Graphics, initGraphics, runGame } from "../rgss/Graphics";
import { Input } from "../rgss/Input";
import { Rect } from "../rgss/types";
import { unlockAudio } from "../rgss/Audio";
import { initMessageSystem } from "../ui/messageConfig";
import {
  ChooseNumberParams, pbCallBub, pbConfirmMessage, pbMessage, pbMessageChooseNumber, pbShowCommands,
} from "../ui/messages";

const hud = document.getElementById("hud")!;
const params = new URLSearchParams(location.search);
addEventListener("keydown", () => void unlockAudio(), { once: true });

const app = await createScreen(document.getElementById("screen")!);
initGraphics(app);
Data.system = await loadSystem();
G.gameSystem = new GameSystem();
G.player = { name: "Gold", gender: 0, money: 3000 };
G.pokemonSystem.textspeed = Number(params.get("speed") ?? 1);
await initMessageSystem();

//-------------------------------------------------------------------------------
// Map003 backdrop with its event sprites
//-------------------------------------------------------------------------------
const map = await loadMap(3);
const tileset = await loadTileset(map.tilesetId);
const mapViewport = new Viewport(0, 0, 512, 384);
const tilemap = new TilemapRenderer(mapViewport.node);
await tilemap.prepare(tileset);
const displayX = Math.min(Math.max(12 * 32 + 16 - 256, 0), map.width * 32 - 512);
const displayY = Math.min(Math.max(8 * 32 + 16 - 192, 0), map.height * 32 - 384);

class DemoCharacter implements CharacterLike {
  sprite: Sprite;
  constructor(public id: number, public x: number, public y: number, public direction: number, bitmap: Bitmap | null) {
    this.sprite = new Sprite(mapViewport);
    if (bitmap) {
      this.sprite.setBitmap(bitmap);
      const cw = bitmap.width / 4;
      const ch = bitmap.height / 4;
      this.sprite.srcRect = new Rect(0, (direction / 2 - 1) * ch, cw, ch);
      this.sprite.ox = cw / 2;
      this.sprite.oy = ch;
    }
    this.sprite.x = this.screenX();
    this.sprite.y = this.screenY();
    this.sprite.z = this.screenZ();
  }
  face(direction: number): void {
    this.direction = direction;
    const r = this.sprite.srcRect;
    r.y = (direction / 2 - 1) * r.height;
  }
  screenX(): number { return this.x * 32 + 16 - displayX; }
  screenY(): number { return this.y * 32 + 32 - displayY; }
  screenZ(): number { return this.screenY(); }
}

const events = new Map<number, CharacterLike>();
for (const ev of map.events) {
  const g = ev.pages[0]?.graphic;
  const bmp = g?.characterName ? await Bitmap.load(`Graphics/Characters/${g.characterName}`) : null;
  events.set(ev.id, new DemoCharacter(ev.id, ev.x, ev.y, g?.direction ?? 2, bmp));
}
const player = new DemoCharacter(0, 11, 8, 8, await Bitmap.load("Graphics/Characters/0_base_ethan"));
G.gameMap = { mapId: 3, events };
G.gamePlayer = player;
const mapSource = {
  mapId: 3, width: map.width, height: map.height, tileset, displayX, displayY,
  tile: (x: number, y: number, z: number) => map.layers[z]?.[y]?.[x] ?? 0,
};
G.scene = {
  async miniupdate() {
    tilemap.update(Graphics.deltaS);
    tilemap.draw([mapSource], 0);
  },
};
tilemap.draw([mapSource], 0);

//-------------------------------------------------------------------------------
// The script
//-------------------------------------------------------------------------------
const MOM = 4, DAD = 5, AIPOM = 1;

async function withPicture(name: string, body: () => Promise<void>): Promise<void> {
  const pic = new Sprite();
  pic.setBitmap(await Bitmap.load(`Graphics/Pictures/${name}`));
  pic.z = 1000;
  try {
    await body();
  } finally {
    pic.dispose();
  }
}

const steps: [string, () => Promise<unknown>][] = [
  ["Mom, bubble below (player faces up -> box at top)", async () => {
    player.face(8);
    pbCallBub(2, MOM);
    await pbMessage("\\f[facemom]\\rHi \\PN!\\nYou're finally awake.");
  }],
  ["Mom, player facing right -> box at bottom", async () => {
    player.face(6);
    pbCallBub(2, MOM);
    await pbMessage("\\f[facemom]\\rYou know where the lab is, right?\\nIt's right next door to us.");
  }],
  ["Mom, long text (word wrap + scrolling)", async () => {
    pbCallBub(2, MOM);
    await pbMessage("\\f[facemom]\\rPokémon are your friends.\\nWhen you work as a team, you can accomplish anything!\\nNow, go on!");
  }],
  ["Dad (\\b blue)", async () => {
    pbCallBub(2, DAD);
    await pbMessage("\\f[facedad]\\bWhen I was a kid I wanted to be a Pokémon Trainer too.\\nBut it was complicated back in the day...");
  }],
  ["Aipom, no face", async () => {
    pbCallBub(2, AIPOM);
    await pbMessage("Aipom: Ai-pom!");
  }],
  ["Floating bubble (pbCallBub type 1)", async () => {
    pbCallBub(1, MOM);
    await pbMessage("\\rFloating bubble above Mom.");
  }],
  ["Plain message + inline choices (Map051)", async () => {
    const choice = await pbMessage(
      "Before we go any further, I'd like to tell you a few things you should know about this world!",
      ["Controls", "Adventure", "No info needed"], 3);
    await pbMessage(`You picked choice ${choice}.\\1`);
    await pbMessage("\\bWell then, without further ado...");
  }],
  ["Intro text: middle position, transparent frame, <ac>, \\l[n]", async () => {
    await withPicture("helpadventurebg", async () => {
      G.gameSystem.messagePosition = 1;
      G.gameSystem.messageFrame = 1;
      try {
        await pbMessage("<ac>\\c[0]\\l[3]You are about to enter a world\\nwhere you will embark on a grand\\nadventure of your very own.");
        await pbMessage("<ac>\\c[0]\\l[5]Speak to people and check things\\n wherever you go, be it in towns,\\nroads or caves.\\n Gather information and hints from\\n every possible source.");
        await pbMessage("<ac>\\c[0]\\l[7]At times, you will be challenged\\n by others to a battle.\\n At other times, wild creatures\\nmay stand in your way.\\n\\n By overcoming such hurdles,\\nyou will gain great power.");
      } finally {
        G.gameSystem.messagePosition = 2;
        G.gameSystem.messageFrame = 0;
      }
    });
  }],
  ["Text codes: colours, waits, pause, bold, \\v[], gold window", async () => {
    G.gameVariables.set(1, 42);
    await pbMessage("Colours: \\c[1]blue\\c[0], \\c[2]red\\c[0], \\c[3]green\\c[0]. Variable 1 is \\v[1].\\nWaits\\.\\.\\. a second\\| and <b>bold</b> <i>italic</i> <u>under</u>.\\1");
    await pbMessage("Instant text with \\\\ts[]:\\ts[] the whole line appears at once.\\nThen a manual pause\\!and the rest.");
    await pbMessage("\\gYou have money! The gold window shows \\PM.");
  }],
  ["pbConfirmMessage", async () => {
    const yes = await pbConfirmMessage("Do you want to continue the demo?");
    await pbMessage(yes ? "You said yes." : "You said no.");
  }],
  ["pbMessageChooseNumber", async () => {
    const p = new ChooseNumberParams();
    p.setRange(1, 99);
    p.setDefaultValue(5);
    const n = await pbMessageChooseNumber("How many Poké Balls?", p);
    await pbMessage(`You chose ${n}.`);
  }],
  ["Standalone pbShowCommands (no message)", async () => {
    const c = await pbShowCommands(null, ["Pokédex", "Pokémon", "Bag", "Gold", "Save", "Options", "Exit"], -1);
    await pbMessage(`Command result: ${c}.`);
  }],
];

let current = Math.max(0, Math.min(steps.length - 1, Number(params.get("step") ?? 0)));
function showHud(): void {
  hud.textContent = `Step ${current}/${steps.length - 1}: ${steps[current]![0]}\nEnter/Space = USE, Esc/X = BACK, arrows = cursor`;
}

runGame(async () => {
  for (;;) {
    showHud();
    await steps[current]![1]();
    current = (current + 1) % steps.length;
    // a short pause between steps
    for (let i = 0; i < 20; i++) {
      await Graphics.update();
      Input.update();
      await G.scene!.miniupdate!();
    }
  }
}, (e) => {
  console.error(e);
  hud.textContent = String(e instanceof Error ? e.stack : e);
});

Object.assign(window, { __demo: { G, Graphics } });
