// Port of the scenes in Plugins/Social Links/003_SocialUI.rb:
// Window_Social_Menu, SocialMediaMenu_Scene / SocialMediaMenuScreen (the list
// of links) and SocialMedia_Scene / SocialMediaScreen (a link's profile, with
// the phone call button PHONE_INTEGRATION adds), plus pbSocialMedia /
// pbSocialMediaDirect, which open them. The helpers events call are in
// ./functions.ts.
//
// The Instant Messages plugin isn't in this game (PluginManager.installed?
// is false), so the profile's message button and SPECIAL: Message never show.
// Missing profile pictures (most of 002_Configuration.rb's) raise
// Errno::ENOENT in Ruby; the port's pbDrawImagePositions/IconSprite draw
// nothing for them (see docs/original-game-bugs.md).

import { _INTL } from "../../core/intl";
import { pbPlayDecisionSE } from "../../game/GameSystem";
import { Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { Color, Rect } from "../../rgss/types";
import { AnimatedBitmap } from "../../ui/AnimatedBitmap";
import { drawFormattedTextEx, pbCopyBitmap, pbDrawImagePositions, pbDrawTextPositions, type ImagePosition, type TextPosition } from "../../ui/drawText";
import { pbFadeInAndShow, pbFadeOutAndHide, pbFadeOutIn } from "../../ui/fades";
import { MessageConfig, pbDisposeSpriteHash, pbDoEnsureBitmap, pbSetSystemFont, pbUpdateSpriteHash } from "../../ui/messageConfig";
import { pbShowCommands } from "../../ui/messages";
import { pbPlayCloseMenuSE } from "../../ui/options/options";
import { pbCallTrainer } from "../../ui/pokegear/phone";
import { pbResolveBitmap, preloadBitmaps } from "../../ui/rpgCache";
import { asHash, type Sprites } from "../../ui/scenes/frames";
import { PictureOrigin, PokemonSprite, preloadSpeciesSprite } from "../../ui/sprites/pokemonSprite";
import { BitmapSprite, IconSprite } from "../../ui/SpriteWrapper";
import { Window_AdvancedTextPokemon, Window_DrawableCommand } from "../../ui/windows/SpriteWindowText";
import type { Id } from "../../data/gameData/gameData";
import type { SocialLinkProfile } from "./data";
import { pbPlayerSocialLinksSaved } from "./player";
import { pbRunTextThroughReplacement, pbSortSocialLinks, type LinkEntry } from "./sceneLogic";
import { SocialLinkSettings } from "./settings";

const UI = "Graphics/UI/Social Links/";
/** PluginManager.installed?("Instant Messages", "1.1") */
const INSTANT_MESSAGES_INSTALLED = false;

/** A Ruby NoMethodError (what calling a scene method that doesn't exist raises). */
function noMethodError(message: string): never {
  const e = new Error(message);
  e.name = "NoMethodError";
  throw e;
}

const profilePicture = (image: string) => `${UI}Profile Pictures/${image}`;

//===============================================================================
// Opening the scenes
//===============================================================================
/** Opens your list of active social links (pbSocialMedia / pbSocialLinks). */
export async function pbSocialMedia(): Promise<void> {
  await pbFadeOutIn(async () => {
    const scene = new SocialMediaMenu_Scene();
    const screen = new SocialMediaMenuScreen(scene);
    await screen.pbStartScreen();
  });
}

/** Directly opens a social media profile (pbSocialMediaDirect / pbSocialLinkDirect). */
export async function pbSocialMediaDirect(profileId: Id, oldScene: SocialMediaMenu_Scene | null = null): Promise<void> {
  if (SocialLinkSettings.DISABLE_SOCIAL_MEDIA_PROFILE) {
    console.warn("DISABLE_SOCIAL_MEDIA_PROFILE is set to true, so viewing profiles is disabled. Opening the list view, instead.");
    await pbSocialMedia();
    return;
  }
  await pbFadeOutIn(async () => {
    const scene = new SocialMedia_Scene(profileId, oldScene);
    const screen = new SocialMediaScreen(scene);
    await screen.pbStartScreen();
  });
}

//===============================================================================
// Menu scene
//===============================================================================
export class Window_Social_Menu extends Window_DrawableCommand {
  declare private _links: LinkEntry[];

  constructor(x: number, y: number, width: number, height: number, viewport: Viewport | null) {
    super(x, y, width, height, viewport);
    this._links ??= [];
    this._rowHeight = 64;
    this.windowskin = null;
    // (Essentials::VERSION.include?("21") is false: v20's Graphics/Pictures/selarrow)
    this._selarrow = new AnimatedBitmap("Graphics/Pictures/selarrow");
  }

  get links(): LinkEntry[] { return this._links; }
  set links(value: LinkEntry[]) {
    this._links = value;
    this.refresh();
  }

  get itemMax(): number { return this._itemMax; }

  override itemCount(): number {
    return this._links?.length ?? 0;
  }

  override drawItem(index: number, _count: number, rect: Rect): void {
    if (index >= this.topRow + this.pageItemMax) return;
    rect = new Rect(rect.x + 16, rect.y, rect.width - 16, rect.height);
    const link = this._links[index]![1];
    const { image, name, bond } = link;
    const base = this.baseColor;
    const shadow = this.shadowColor;
    const picWidth = 56;
    const bondLevelMax = link.bondMax;
    const replacement = SocialLinkSettings.MAXED_BOND_TEXT_REPLACEMENT;
    const bondValue = bond >= bondLevelMax && replacement && replacement !== "" ? replacement : String(bond);
    let imgX = 26;
    if (SocialLinkSettings.ALT_COLOR_BOND_ICON_AT_MAX && bond >= bondLevelMax) imgX += 26;
    const contents = this.contents!;
    let xAdj = 0;
    if (SocialLinkSettings.ALLOW_FAVORITING) {
      xAdj = 30;
      if (link.favorite) pbDrawImagePositions(contents, [[`${UI}favorite`, rect.width - 16, rect.y + 6]]);
    }
    drawFormattedTextEx(contents, rect.x + picWidth + 4, rect.y + 2 + 16, 468, name, base, shadow);
    pbDrawTextPositions(contents, [[bondValue, rect.x + rect.width - 44 - xAdj, rect.y + 2 + 16, 1, base, shadow]]);
    pbDrawImagePositions(contents, [[profilePicture(image), rect.x, rect.y + 6]]);
    pbDrawImagePositions(contents, [[`${UI}bond`, rect.x + rect.width - 36 - xAdj, rect.y + 22, imgX, 0, 26, 26]]);
  }

  override drawCursor(index: number, rect: Rect): Rect {
    if (this.index === index) pbCopyBitmap(this.contents!, this._selarrow.bitmap, rect.x, rect.y + 2 + 16);
    return new Rect(rect.x + 16, rect.y, rect.width - 16, rect.height);
  }

  override refresh(): void {
    if (this._selarrow === undefined) return; // (called from the superclass before Ruby's ivars exist)
    this._itemMax = this.itemCount();
    const dwidth = this.width - this.borderX;
    const dheight = this.height - this.borderY;
    this.contents = pbDoEnsureBitmap(this.contents, dwidth, dheight);
    this.contents.clear();
    for (let i = 0; i < this._itemMax; i++) {
      if (i < this.topItem || i > this.topItem + this.pageItemMax) continue;
      this.drawItem(i, this._itemMax, this.itemRect(i));
    }
    if (this.itemCount() > 0) this.drawCursor(this.index, this.itemRect(this.index));
  }

  override update(): void {
    super.update();
    this._uparrow.x -= 10;
    this._downarrow.x -= 10;
  }
}

export class SocialMediaMenu_Scene {
  sprites: Sprites = {};
  private viewport!: Viewport;
  private socialLinks: LinkEntry[] = [];
  private sortMethod = 0;
  private baseColor!: Color;
  private shadowColor!: Color;
  private titleColor!: Color;
  private titleShadowColor!: Color;
  private theme = "";

  itemlist(): Window_Social_Menu { return this.sprites["itemlist"] as Window_Social_Menu; }

  async pbStartScene(): Promise<void> {
    this.socialLinks = [];
    for (const [key, value] of pbPlayerSocialLinksSaved().links) this.socialLinks.push([key, value]);
    this.sortMethod = 0;
    this.sprites = {};
    this.theme = pbPlayerSocialLinksSaved().themeColor;
    await preloadBitmaps([`${UI}Themes/${this.theme}/bg_menu`, "Graphics/Pictures/selarrow", `${UI}favorite`, `${UI}bond`,
      `${UI}favorite_button`, `${UI}sort_button`, ...this.socialLinks.map(([, l]) => profilePicture(l.image))]);
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99999;
    this.baseColor = MessageConfig.DARK_TEXT_MAIN_COLOR;
    this.shadowColor = MessageConfig.DARK_TEXT_SHADOW_COLOR;
    this.titleColor = MessageConfig.LIGHT_TEXT_MAIN_COLOR;
    this.titleShadowColor = MessageConfig.LIGHT_TEXT_SHADOW_COLOR;
    const background = new IconSprite(0, 0, this.viewport);
    background.setBitmapFile(`${UI}Themes/${this.theme}/bg_menu`);
    this.sprites["background"] = background;
    const itemlist = new Window_Social_Menu(22, 28, Graphics.width - 22, Graphics.height - 28, this.viewport);
    this.sprites["itemlist"] = itemlist;
    itemlist.index = 0;
    itemlist.baseColor = this.baseColor;
    itemlist.shadowColor = this.shadowColor;
    itemlist.links = this.socialLinks;
    const overlay = new BitmapSprite(Graphics.width, Graphics.height, this.viewport);
    this.sprites["overlay"] = overlay;
    pbSetSystemFont(overlay.bitmap!);
    const textpos: TextPosition[] = [[SocialLinkSettings.SOCIAL_LINKS_LIST_TITLE, Graphics.width / 2, 6, 2, this.titleColor, this.titleShadowColor]];
    if (itemlist.itemMax === 0) {
      textpos.push([SocialLinkSettings.NO_LINKS_MESSAGE, Graphics.width / 2, Graphics.height / 2 - 12, 2, this.baseColor, this.shadowColor]);
    }
    pbDrawTextPositions(overlay.bitmap!, textpos);
    this.pbSortSocialLinks();
    if (SocialLinkSettings.ALLOW_FAVORITING && this.socialLinks.length > 0) {
      const button = new IconSprite(0, 0, this.viewport);
      button.setBitmapFile(`${UI}favorite_button`);
      button.x = Graphics.width - button.width - 4;
      button.y = 6;
      this.sprites["favorite_button"] = button;
    }
    if (SocialLinkSettings.ALLOW_SORTING && this.socialLinks.length > 1) {
      const button = new IconSprite(0, 0, this.viewport);
      button.setBitmapFile(`${UI}sort_button`);
      button.x = 4;
      button.y = 6;
      this.sprites["sort_button"] = button;
    }
    await pbFadeInAndShow(asHash(this.sprites), null, () => this.pbUpdate());
  }

  async pbScene(): Promise<void> {
    for (;;) {
      const itemlist = this.itemlist();
      const selected = itemlist.index;
      itemlist.active = true;
      await Graphics.update();
      Input.update();
      this.pbUpdate();
      if (Input.trigger(Input.BACK)) {
        pbPlayCloseMenuSE();
        break;
      } else if (Input.trigger(Input.USE) && !SocialLinkSettings.DISABLE_SOCIAL_MEDIA_PROFILE) {
        if (this.socialLinks.length === 0) {
          // pbPlayBuzzerSE
        } else {
          pbPlayDecisionSE();
          await pbSocialMediaDirect(this.socialLinks[selected]![0], this);
        }
      } else if (Input.trigger(Input.ACTION) && SocialLinkSettings.ALLOW_FAVORITING && this.socialLinks.length > 0) {
        pbPlayDecisionSE();
        this.socialLinks[selected]![1].toggleFavorite();
        this.pbSortSocialLinks();
      } else if (Input.trigger(Input.SPECIAL) && SocialLinkSettings.ALLOW_SORTING && this.socialLinks.length > 1) {
        const commands = [_INTL("Sort by Newest First"), _INTL("Sort by Lowest Bond"), _INTL("Sort by Highest Bond"), _INTL("Sort Alphabetically")];
        const ret = await pbShowCommands(null, commands, -1, this.sortMethod);
        if (ret >= 0 && ret !== this.sortMethod) {
          pbPlayDecisionSE();
          this.sortMethod = ret;
          this.pbSortSocialLinks();
        }
      }
    }
  }

  /** Sorts the list in place (the window shows the same array). */
  pbSortSocialLinks(): void {
    pbSortSocialLinks(this.socialLinks, this.sortMethod);
    this.itemlist().refresh();
  }

  pbUpdate(): void {
    pbUpdateSpriteHash(this.sprites as never);
  }

  async pbEndScene(): Promise<void> {
    await pbFadeOutAndHide(asHash(this.sprites), () => this.pbUpdate());
    pbDisposeSpriteHash(this.sprites as never);
    this.viewport.dispose();
  }
}

export class SocialMediaMenuScreen {
  constructor(private scene: SocialMediaMenu_Scene) {}

  async pbStartScreen(): Promise<void> {
    await this.scene.pbStartScene();
    await this.scene.pbScene();
    await this.scene.pbEndScene();
  }
}

//===============================================================================
// Messages scene (a link's profile)
//===============================================================================
type Coords = [number, number];

export class SocialMedia_Scene {
  private profile: SocialLinkProfile | undefined;
  private oldScene: SocialMediaMenu_Scene | null;
  private sprites: Sprites = {};
  private viewport!: Viewport;
  private theme = "";
  private showPokemon = false;
  private instantMessages = false;
  private hasPhoneContact = false;
  private imButtonPosition: Coords | null = null;

  constructor(profileId: Id, oldScene: SocialMediaMenu_Scene | null = null) {
    this.profile = pbPlayerSocialLinksSaved().links.get(profileId);
    this.oldScene = oldScene;
  }

  private s<T>(key: string): T { return this.sprites[key] as T; }

  async pbStartScene(): Promise<void> {
    const profile = this.profile;
    if (!profile) noMethodError("undefined method `favorite_pokemon' for nil:NilClass");
    this.theme = pbPlayerSocialLinksSaved().themeColor;
    this.showPokemon = profile.favoritePokemon != null && SocialLinkSettings.SHOW_FAVORITE_POKEMON;
    this.instantMessages = profile.imContactId != null && INSTANT_MESSAGES_INSTALLED;
    this.hasPhoneContact = profile.hasPhoneContact();

    let picCenter: Coords = [72, 72];
    let namePosition: Coords = [344, 46];
    if (SocialLinkSettings.PROFILE_NAME_FONT_SIZE > 27) namePosition[1] -= 4;
    let nameAlignment = 2;
    let locationPosition: Coords = [200, 96];
    let pokemonPosition: Coords = [24, 192];
    this.imButtonPosition = null;
    let statusPosition: Coords = this.showPokemon ? [224, 192] : [24, 192];
    let statusMaxWidth = this.showPokemon ? 264 : 464;
    const bondLevelMax = profile.bondMax;
    let bondIconPositions: (Coords | null)[] = [
      [22, 162],
      [52, 162],
      [82, 162],
      [112, 154],
      [138, 138],
      [154, 112],
      [162, 82],
      [162, 52],
      [162, 22],
      null,
    ];
    if (SocialLinkSettings.USE_CUSTOM_LAYOUT) {
      picCenter = SocialLinkSettings.PROFILE_PIC_CENTER_COORDS;
      namePosition = SocialLinkSettings.NAME_POSITION_COORDS;
      nameAlignment = SocialLinkSettings.NAME_ALIGNMENT;
      locationPosition = SocialLinkSettings.LOCATION_SECTION_COORDS;
      pokemonPosition = SocialLinkSettings.FAVORITE_POKEMON_COORDS;
      statusPosition = this.showPokemon ? SocialLinkSettings.STATUS_MESSAGE_COORDS : SocialLinkSettings.STATUS_MESSAGE_COORDS_NO_POKE;
      statusMaxWidth = this.showPokemon ? SocialLinkSettings.STATUS_MESSAGE_WIDTH : SocialLinkSettings.STATUS_MESSAGE_WIDTH_NO_POKE;
      bondIconPositions = SocialLinkSettings.BOND_ICON_COORDS;
      this.imButtonPosition = SocialLinkSettings.INSTANT_MESSAGES_BUTTON_COORDS;
    }
    if (profile.bondIconCoords) bondIconPositions = profile.bondIconCoords;

    // Favorite Pokemon: Array(favorite_pokemon) with gender/form/shiny defaulted
    const fav: [Id, number, number, boolean] | null = this.showPokemon ? (() => {
      const f = Array.isArray(profile.favoritePokemon) ? profile.favoritePokemon : [profile.favoritePokemon as Id] as const;
      return [f[0], (f[1] as number | null | undefined) ?? 0, (f[2] as number | null | undefined) ?? 0, (f[3] as boolean | null | undefined) ?? false];
    })() : null;
    const background = `${UI}Themes/${this.theme}/bg${this.showPokemon ? "" : "_nopoke"}`;
    const large = `${profilePicture(profile.image)}_large`;
    await Promise.all([
      preloadBitmaps([background, large, profilePicture(profile.image), `${UI}bond`, `${UI}location`, `${UI}im_button`, `${UI}phone_button`]),
      fav ? preloadSpeciesSprite(fav[0], fav[1], fav[2], fav[3]) : null,
    ]);

    this.sprites = {};
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99999;
    const bg = new IconSprite(0, 0, this.viewport);
    bg.setBitmapFile(background);
    this.sprites["background"] = bg;
    const bondoverlay = new BitmapSprite(Graphics.width, Graphics.height, this.viewport);
    const nameoverlay = new BitmapSprite(Graphics.width, Graphics.height, this.viewport);
    const locationoverlay = new BitmapSprite(Graphics.width, Graphics.height, this.viewport);
    const buttonhints = new BitmapSprite(Graphics.width, Graphics.height, this.viewport);
    Object.assign(this.sprites, { bondoverlay, nameoverlay, locationoverlay, buttonhints });

    // Profile Picture
    const pic = new IconSprite(0, 0, this.viewport);
    this.sprites["profile_picture"] = pic;
    if (SocialLinkSettings.USE_LARGE_PIC_ON_PROFILE && pbResolveBitmap(large)) {
      pic.setBitmapFile(large);
      pic.x = picCenter[0] - Math.floor(pic.width / 2);
      pic.y = picCenter[1] - Math.floor(pic.height / 2);
    } else {
      pic.setBitmapFile(profilePicture(profile.image));
      pic.x = picCenter[0] - Math.floor(pic.width / 2);
      pic.y = picCenter[1] - Math.floor(pic.height / 2);
      if (SocialLinkSettings.USE_LARGE_PIC_ON_PROFILE) {
        pic.zoomX = 2.0;
        pic.zoomY = 2.0;
        pic.x = picCenter[0] - pic.width;
        pic.y = picCenter[1] - pic.height;
      }
    }

    // Bond Scale
    const imgpos: ImagePosition[] = [];
    for (let i = 0; i < bondLevelMax; i++) {
      const pos = bondIconPositions[i];
      if (pos == null) continue;
      let imgX = profile.bond > i ? 26 : 0;
      if (SocialLinkSettings.ALT_COLOR_BOND_ICON_AT_MAX && profile.bond >= bondLevelMax) imgX += 26;
      imgpos.push([`${UI}bond`, pos[0], pos[1], imgX, 0, 26, 26]);
    }
    pbDrawImagePositions(bondoverlay.bitmap!, imgpos);

    // Name
    pbSetSystemFont(nameoverlay.bitmap!);
    if (SocialLinkSettings.PROFILE_NAME_FONT_SIZE > 0) nameoverlay.bitmap!.font.size = SocialLinkSettings.PROFILE_NAME_FONT_SIZE;
    pbDrawTextPositions(nameoverlay.bitmap!, [[profile.name, namePosition[0], namePosition[1], nameAlignment,
      MessageConfig.DARK_TEXT_MAIN_COLOR, MessageConfig.DARK_TEXT_SHADOW_COLOR]]);

    // Location
    pbSetSystemFont(locationoverlay.bitmap!);
    pbDrawTextPositions(locationoverlay.bitmap!, [[profile.currentLocation, locationPosition[0] + 36, locationPosition[1] + 14, 0,
      MessageConfig.DARK_TEXT_MAIN_COLOR, MessageConfig.DARK_TEXT_SHADOW_COLOR]]);
    pbDrawImagePositions(locationoverlay.bitmap!, [[`${UI}location`, locationPosition[0] + 2, locationPosition[1] + 8]]);

    // Favorite Pokemon
    if (fav) {
      const icon = new PokemonSprite(this.viewport);
      icon.setOffset(PictureOrigin.CENTER);
      icon.x = pokemonPosition[0] + 96;
      icon.y = pokemonPosition[1] + 96;
      icon.setSpeciesBitmap(fav[0], fav[1], fav[2], fav[3]);
      this.sprites["pokemonicon"] = icon;
    }

    // Status Message. NOTE (Ruby parity, 003_SocialUI.rb:631): Ruby's gsub!
    // rewrites the profile's own @current_status (it isn't a copy unless the
    // status is empty), so the replaced text, \v[n] values included, is what
    // the profile keeps. (It's also the GameData's init_status / pool string
    // until a new status is set; JS strings can't share that.)
    const raw = profile.rawCurrentStatus;
    const textToShow = pbRunTextThroughReplacement(profile.currentStatus);
    if (raw !== "") profile.currentStatus = textToShow;
    const statustext = new Window_AdvancedTextPokemon(textToShow);
    this.sprites["statustext"] = statustext;
    statustext.opacity = 0;
    statustext.resizeToFit(statustext.text, statusMaxWidth);
    statustext.viewport = this.viewport;
    statustext.x = statusPosition[0];
    statustext.y = statusPosition[1];
    statustext.visible = true;

    // Instant Message Button
    if (this.instantMessages) {
      const im = new IconSprite(0, 0, this.viewport);
      im.setBitmapFile(`${UI}im_button`);
      this.imButtonPosition ??= [Graphics.width - im.width - 24, 152];
      im.x = this.imButtonPosition[0];
      im.y = this.imButtonPosition[1];
      this.sprites["im_button"] = im;
    }

    // Phone Call Button
    if (this.hasPhoneContact) {
      const phone = new IconSprite(0, 0, this.viewport);
      // Try to load a phone_button graphic, or reuse im_button as fallback
      phone.setBitmapFile(pbResolveBitmap(`${UI}phone_button`) ? `${UI}phone_button` : `${UI}im_button`);
      // Position below IM button if both exist, otherwise use IM button position
      if (this.instantMessages) {
        phone.x = this.imButtonPosition![0];
        phone.y = this.imButtonPosition![1] + this.s<IconSprite>("im_button").height + 8;
      } else {
        phone.x = Graphics.width - phone.width - 24;
        phone.y = 152;
      }
      this.sprites["phone_button"] = phone;
    }

    // Button Hints
    pbSetSystemFont(buttonhints.bitmap!);
    const textpos: TextPosition[] = [];
    const hintY = Graphics.height - 32;
    if (this.hasPhoneContact) {
      const hintText = this.instantMessages ? _INTL("USE: Call") : _INTL("USE: Phone Call");
      textpos.push([hintText, 8, hintY, 0, MessageConfig.DARK_TEXT_MAIN_COLOR, MessageConfig.DARK_TEXT_SHADOW_COLOR]);
    }
    if (this.instantMessages) {
      const hintX = this.hasPhoneContact ? Graphics.width / 2 : 8;
      textpos.push([_INTL("SPECIAL: Message"), hintX, hintY, 0, MessageConfig.DARK_TEXT_MAIN_COLOR, MessageConfig.DARK_TEXT_SHADOW_COLOR]);
    }
    if (textpos.length > 0) pbDrawTextPositions(buttonhints.bitmap!, textpos);

    await pbFadeInAndShow(asHash(this.sprites));
  }

  async pbScene(): Promise<void> {
    for (;;) {
      await Graphics.update();
      Input.update();
      this.pbUpdate();
      if (Input.trigger(Input.USE)) {
        if (this.hasPhoneContact) {
          pbPlayDecisionSE();
          const contact = this.profile!.phoneContact();
          if (contact) await pbCallTrainer(contact[1], contact[2]);
        }
      } else if (this.instantMessages && Input.trigger(Input.SPECIAL)) {
        pbPlayDecisionSE();
        // pbInstantMessages([:Contact, im_contact_id]): the plugin isn't in the game.
        noMethodError("undefined method `pbInstantMessages' for main:Object");
      } else if (Input.trigger(Input.BACK)) {
        pbPlayCloseMenuSE();
        break;
      }
    }
  }

  async pbEndScene(): Promise<void> {
    await pbFadeOutAndHide(asHash(this.sprites));
    pbDisposeSpriteHash(this.sprites as never);
    this.viewport.dispose();
    if (this.oldScene && this.oldScene.sprites["itemlist"]) this.oldScene.itemlist().refresh();
  }

  pbUpdate(): void {
    pbUpdateSpriteHash(this.sprites as never);
  }
}

//===============================================================================
// Messages screen
//===============================================================================
export class SocialMediaScreen {
  constructor(readonly scene: SocialMedia_Scene) {}

  async pbStartScreen(): Promise<void> {
    await this.scene.pbStartScene();
    await this.scene.pbScene();
    await this.scene.pbEndScene();
  }

  // NOTE (Ruby parity, 003_SocialUI.rb:762-784): these forward to scene methods
  // SocialMedia_Scene doesn't have (update, pbRefresh, pbDisplay,
  // pbDisplayForcedCommands, pbDisplayConfirm, pbShowCommands), so they raise.
  // Nothing calls them.
  pbUpdate(): never { return noMethodError("undefined method `update' for #<SocialMedia_Scene>"); }
  pbRefresh(): never { return noMethodError("undefined method `pbRefresh' for #<SocialMedia_Scene>"); }
  pbDisplay(_text: string): never { return noMethodError("undefined method `pbDisplay' for #<SocialMedia_Scene>"); }
  pbDisplayForcedCommands(_text: string, _commands: string[]): never {
    return noMethodError("undefined method `pbDisplayForcedCommands' for #<SocialMedia_Scene>");
  }
  pbConfirm(_text: string): never { return noMethodError("undefined method `pbDisplayConfirm' for #<SocialMedia_Scene>"); }
  pbShowCommands(_helptext: string, _commands: string[], _index = 0): never {
    return noMethodError("undefined method `pbShowCommands' for #<SocialMedia_Scene>");
  }
}
