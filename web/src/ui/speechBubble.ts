// Port of Plugins/Carmaniac's Speech Bubble/Carmaniac's Speech Bubble.rb.
//
// pbCallBub(type, eventId) marks the NEXT message as said by that event:
//   type 1: floating bubble sized to the text, placed above the event
//   type 2: full-width "frlgtextskin" box at the top or bottom of the screen
//           plus a wedge (Graphics/Pictures/Arrow1..4, zoomed 2x) from the
//           event to the box. The box goes to the top when the player faces
//           up (or position 1 forces it), or when the event is low on screen.
// The plugin loads after Map Zoom, so its pbCreateMessageWindow,
// pbDisposeMessageWindow and pbRepositionMessageWindow are the ones the game
// uses; it also patches Window_AdvancedTextPokemon#text= (consumes the
// bubble state when the message text is set).

import { type CharacterLike, G } from "../game/globals";
import { Sprite, Viewport } from "../rgss/display";
import { Graphics } from "../rgss/Graphics";
import { MessageConfig, pbBottomLeftLines } from "./messageConfig";
import { RPGCache } from "./rpgCache";
import { Window_AdvancedTextPokemon } from "./windows/SpriteWindowText";

/** Hooks for systems not ported yet (Following Pokémon EX's Followers.get). */
export const SpeechBubbleHooks = {
  getFollower: (_name: string | null): CharacterLike | null => null,
};

/** get_speechbubble_character: the talking character (event or follower). */
export function getSpeechbubbleCharacter(): CharacterLike | null {
  const gt = G.gameTemp;
  if (gt.speechbubbleFollowerEvent) return gt.speechbubbleFollowerEvent;
  if (gt.speechbubbleTalking !== null) return G.gameMap?.events.get(gt.speechbubbleTalking) ?? null;
  return null;
}

//-------------------------------------------------------------------------------
// class Window_AdvancedTextPokemon; def text=(value)
//-------------------------------------------------------------------------------
Object.defineProperty(Window_AdvancedTextPokemon.prototype, "text", {
  configurable: true,
  get(this: Window_AdvancedTextPokemon): string {
    return this._text;
  },
  set(this: Window_AdvancedTextPokemon, value: string) {
    const gt = G.gameTemp;
    if (value != null && value !== "" && gt.speechbubbleBubble > 0) {
      if (gt.speechbubbleBubble === 1) {
        gt.speechbubbleBubble = 0;
        this.resizeToFit2(value, 400, 100);
        const char = getSpeechbubbleCharacter();
        if (char) {
          // (Ruby sets @x/@y directly, without refreshing the frame sprites.)
          this._x = char.screenX();
          this._y = char.screenY() - (32 + this._height);
          if (this._y > Graphics.height - this._height - 2) {
            this._y = Graphics.height - this._height;
          } else if (this._y < 2) {
            this._y = 2;
          }
          if (this._x > Graphics.width - this._width - 2) {
            this._x = char.screenX() - this._width;
          } else if (this._x < 2) {
            this._x = 2;
          }
        }
      } else {
        gt.speechbubbleBubble = 0;
      }
    }
    this.setText(value);
  },
});

/** Viewports the plugin replaces without disposing; disposed with the message window. */
const strayViewports: Viewport[] = [];

function replaceBubbleViewport(vp: Viewport): void {
  const old = G.gameTemp.speechbubbleVp;
  // The Ruby plugin overwrites the reference and the old viewport (which may
  // hold the arrow) lives on; keep it alive until the window is disposed.
  if (old instanceof Viewport && !old.isDisposed()) strayViewports.push(old);
  G.gameTemp.speechbubbleVp = vp;
}

export function pbRepositionMessageWindow(msgwindow: Window_AdvancedTextPokemon, linecount = 2): void {
  const gt = G.gameTemp;
  msgwindow.height = 32 * linecount + msgwindow.borderY;
  msgwindow.y = Graphics.height - msgwindow.height;
  const sys = G.gameSystem;
  if (gt && gt.inBattle && !(G.scene && "updateBasic" in G.scene)) {
    msgwindow.y = 0;
  } else if (sys) {
    switch (sys.messagePosition) {
      case 0: // up
        msgwindow.y = 0;
        break;
      case 1: // middle
        msgwindow.y = Math.floor(Graphics.height / 2) - Math.floor(msgwindow.height / 2);
        break;
      case 2:
        if (gt.speechbubbleBubble === 1) {
          msgwindow.setSkin("Graphics/windowskins/frlgtextskin");
          msgwindow.height = 100;
          msgwindow.width = 400;
        } else if (gt.speechbubbleBubble === 2) {
          msgwindow.setSkin("Graphics/windowskins/frlgtextskin");
          msgwindow.height = 102;
          msgwindow.width = Graphics.width;
          if ((G.gamePlayer?.direction === 8 && gt.speechbubblePosition === 0) || gt.speechbubblePosition === 1) {
            replaceBubbleViewport(new Viewport(0, 0, Graphics.width, 280));
            msgwindow.y = 6;
          } else {
            replaceBubbleViewport(new Viewport(0, 6 + msgwindow.height, Graphics.width, 280));
            msgwindow.y = Graphics.height - msgwindow.height - 6;
            if (gt.speechbubbleOutofrange === true) msgwindow.y = 6;
          }
        } else {
          msgwindow.height = 102;
          msgwindow.y = Graphics.height - msgwindow.height - 6;
        }
        break;
    }
  }
  if (sys && sys.messageFrame !== 0) msgwindow.opacity = 0;
}

export function pbCreateMessageWindow(viewport: Viewport | null = null, skin: string | null = null): Window_AdvancedTextPokemon {
  const gt = G.gameTemp;
  let arrow: Sprite | null = null;
  const char = getSpeechbubbleCharacter();
  const loadArrow = (name: string) => RPGCache.loadBitmap("Graphics/Pictures/", name);
  if (gt.speechbubbleBubble === 2 && char) { // Message window set to floating bubble.
    if ((gt.speechbubblePosition === 0 && G.gamePlayer?.direction === 8) || gt.speechbubblePosition === 1) {
      // Player facing up, message window top.
      const vp = new Viewport(0, 104, Graphics.width, 280);
      replaceBubbleViewport(vp);
      vp.z = 999999;
      arrow = new Sprite(vp);
      arrow.x = char.screenX() - Graphics.width;
      arrow.y = char.screenY() - Graphics.height - 136;
      arrow.z = 999999;
      arrow.setBitmap(loadArrow("Arrow4"));
      arrow.zoomX = 2;
      arrow.zoomY = 2;
      if (arrow.x < -230) {
        arrow.x = char.screenX();
        arrow.setBitmap(loadArrow("Arrow3"));
      }
    } else {
      // Player facing left, down, right, message window bottom.
      const vp = new Viewport(0, 0, Graphics.width, 280);
      replaceBubbleViewport(vp);
      vp.z = 999999;
      arrow = new Sprite(vp);
      arrow.x = char.screenX();
      arrow.y = char.screenY();
      arrow.z = 999999;
      arrow.setBitmap(loadArrow("Arrow1"));
      if (arrow.y >= Graphics.height - 120) { // Change arrow direction.
        gt.speechbubbleOutofrange = true;
        vp.rect.y += 104;
        arrow.x = char.screenX() - Graphics.width;
        arrow.setBitmap(loadArrow("Arrow4"));
        arrow.y = char.screenY() - Graphics.height - 136;
        if (arrow.x < -250) {
          arrow.x = char.screenX();
          arrow.setBitmap(loadArrow("Arrow3"));
        }
        if (arrow.x >= 256) {
          arrow.x -= 15;
          arrow.setBitmap(loadArrow("Arrow3"));
        }
      } else {
        gt.speechbubbleOutofrange = false;
      }
      arrow.zoomX = 2;
      arrow.zoomY = 2;
    }
  }
  gt.speechbubbleArrow = arrow;
  const msgwindow = new Window_AdvancedTextPokemon("");
  if (!viewport) msgwindow.z = 99999;
  else msgwindow.viewport = viewport;
  msgwindow.visible = true;
  msgwindow.letterbyletter = true;
  msgwindow.backOpacity = MessageConfig.WINDOW_OPACITY;
  pbBottomLeftLines(msgwindow, 2);
  gt.messageWindowShowing = true;
  msgwindow.setSkin(skin ?? MessageConfig.pbGetSpeechFrame());
  return msgwindow;
}

export function pbDisposeMessageWindow(msgwindow: Window_AdvancedTextPokemon): void {
  const gt = G.gameTemp;
  gt.messageWindowShowing = false;
  msgwindow.dispose();
  gt.speechbubbleArrow?.dispose();
  gt.speechbubbleVp?.dispose();
  for (const vp of strayViewports.splice(0)) vp.dispose();
}

/**
 * pbCallBub(status, value, position): the next message is a speech bubble
 * from character `value` (an event id; -1 the player; 0 "this event", which
 * needs the interpreter's getCharacter). position 0 is default behavior,
 * 1 is force top, 2 is force bottom.
 */
export function pbCallBub(
  status = 0, value = 0, position = 0,
  getCharacter: (id: number) => CharacterLike | null = (id) => (id === -1 ? G.gamePlayer : G.gameMap?.events.get(id) ?? null),
): void {
  const gt = G.gameTemp;
  gt.speechbubbleFollowerEvent = null;
  const char = getCharacter(value);
  if (!char) throw new Error(`pbCallBub: no character ${value}`); // Ruby raises NoMethodError on nil.id
  gt.speechbubbleTalking = char.id;
  gt.speechbubbleBubble = status;
  gt.speechbubblePosition = position;
}

/** followerName can be a string (follower name) or null (first follower). */
export function pbCallBubFollower(status = 0, followerName: string | null = null, position = 0): void {
  const gt = G.gameTemp;
  gt.speechbubbleTalking = null;
  gt.speechbubbleFollowerEvent = SpeechBubbleHooks.getFollower(followerName);
  gt.speechbubbleBubble = status;
  gt.speechbubblePosition = position;
}
