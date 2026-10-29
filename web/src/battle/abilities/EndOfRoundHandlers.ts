// Port of Data/Scripts/011_Battle/006_Other battle code/008_Battle_AbilityEffects.rb (lines 2249-2543): the
// EndOfRoundWeather, EndOfRoundHealing, EndOfRoundEffect and EndOfRoundGainItem handlers.
// Every trigger here is async (the handlers show messages and change HP/stats).

import { _INTL, type Id } from "../../data/gameData/gameData";
import { Item } from "../../data/gameData/item";
import { Settings } from "../../data/gameData/settings";
import { Stat } from "../../data/gameData/stat";
import type { Battle } from "../battle/Battle";
import { Scene } from "../BattleSceneInterface";
import type { Battler } from "../battler/Battler";
import { AbilityEffects } from "../other/AbilityEffects";
import { PBEffects } from "../other/PBEffects";

//===============================================================================
// EndOfRoundWeather handlers
//===============================================================================

AbilityEffects.EndOfRoundWeather.add("DRYSKIN", async (_ability: Id, weather: Id, battler: Battler, battle: Battle) => {
  switch (weather) {
    case "Sun":
    case "HarshSun":
      await battle.pbShowAbilitySplash(battler);
      await battle.scene.pbDamageAnimation(battler);
      await battler.pbReduceHP(Math.floor(battler.totalhp / 8), false);
      await battle.pbDisplay(_INTL("{1} was hurt by the sunlight!", battler.pbThis()));
      await battle.pbHideAbilitySplash(battler);
      await battler.pbItemHPHealCheck();
      break;
    case "Rain":
    case "HeavyRain":
      if (!battler.canHeal()) return;
      await battle.pbShowAbilitySplash(battler);
      await battler.pbRecoverHP(Math.floor(battler.totalhp / 8));
      if (Scene.USE_ABILITY_SPLASH) {
        await battle.pbDisplay(_INTL("{1}'s HP was restored.", battler.pbThis()));
      } else {
        await battle.pbDisplay(_INTL("{1}'s {2} restored its HP.", battler.pbThis(), battler.abilityName()));
      }
      await battle.pbHideAbilitySplash(battler);
      break;
  }
});

AbilityEffects.EndOfRoundWeather.add("ICEBODY", async (_ability: Id, weather: Id, battler: Battler, battle: Battle) => {
  if (weather !== "Hail") return;
  if (!battler.canHeal()) return;
  await battle.pbShowAbilitySplash(battler);
  await battler.pbRecoverHP(Math.floor(battler.totalhp / 16));
  if (Scene.USE_ABILITY_SPLASH) {
    await battle.pbDisplay(_INTL("{1}'s HP was restored.", battler.pbThis()));
  } else {
    await battle.pbDisplay(_INTL("{1}'s {2} restored its HP.", battler.pbThis(), battler.abilityName()));
  }
  await battle.pbHideAbilitySplash(battler);
});

AbilityEffects.EndOfRoundWeather.add("ICEFACE", async (_ability: Id, weather: Id, battler: Battler, battle: Battle) => {
  if (weather !== "Hail") return;
  if (!battler.canRestoreIceFace || battler.form !== 1) return;
  await battle.pbShowAbilitySplash(battler);
  if (!Scene.USE_ABILITY_SPLASH) {
    await battle.pbDisplay(_INTL("{1}'s {2} activated!", battler.pbThis(), battler.abilityName()));
  }
  await battler.pbChangeForm(0, _INTL("{1} transformed!", battler.pbThis()));
  await battle.pbHideAbilitySplash(battler);
});

AbilityEffects.EndOfRoundWeather.add("RAINDISH", async (_ability: Id, weather: Id, battler: Battler, battle: Battle) => {
  if (!["Rain", "HeavyRain"].includes(weather)) return;
  if (!battler.canHeal()) return;
  await battle.pbShowAbilitySplash(battler);
  await battler.pbRecoverHP(Math.floor(battler.totalhp / 16));
  if (Scene.USE_ABILITY_SPLASH) {
    await battle.pbDisplay(_INTL("{1}'s HP was restored.", battler.pbThis()));
  } else {
    await battle.pbDisplay(_INTL("{1}'s {2} restored its HP.", battler.pbThis(), battler.abilityName()));
  }
  await battle.pbHideAbilitySplash(battler);
});

AbilityEffects.EndOfRoundWeather.add("SOLARPOWER", async (_ability: Id, weather: Id, battler: Battler, battle: Battle) => {
  if (!["Sun", "HarshSun"].includes(weather)) return;
  await battle.pbShowAbilitySplash(battler);
  await battle.scene.pbDamageAnimation(battler);
  await battler.pbReduceHP(Math.floor(battler.totalhp / 8), false);
  await battle.pbDisplay(_INTL("{1} was hurt by the sunlight!", battler.pbThis()));
  await battle.pbHideAbilitySplash(battler);
  await battler.pbItemHPHealCheck();
});

//===============================================================================
// EndOfRoundHealing handlers
//===============================================================================

AbilityEffects.EndOfRoundHealing.add("HEALER", async (_ability: Id, battler: Battler, battle: Battle) => {
  if (!(battle.pbRandom(100) < 30)) return;
  for (const b of battler.allAllies()) {
    if (b.status === "NONE") continue;
    await battle.pbShowAbilitySplash(battler);
    const oldStatus = b.status;
    await b.pbCureStatus(Scene.USE_ABILITY_SPLASH);
    if (!Scene.USE_ABILITY_SPLASH) {
      switch (oldStatus) {
        case "SLEEP":
          await battle.pbDisplay(_INTL("{1}'s {2} woke its partner up!", battler.pbThis(), battler.abilityName()));
          break;
        case "POISON":
          await battle.pbDisplay(_INTL("{1}'s {2} cured its partner's poison!", battler.pbThis(), battler.abilityName()));
          break;
        case "BURN":
          await battle.pbDisplay(_INTL("{1}'s {2} healed its partner's burn!", battler.pbThis(), battler.abilityName()));
          break;
        case "PARALYSIS":
          await battle.pbDisplay(_INTL("{1}'s {2} cured its partner's paralysis!", battler.pbThis(), battler.abilityName()));
          break;
        case "FROZEN":
          await battle.pbDisplay(_INTL("{1}'s {2} defrosted its partner!", battler.pbThis(), battler.abilityName()));
          break;
      }
    }
    await battle.pbHideAbilitySplash(battler);
  }
});

/** The Hydration/Shed Skin message when there's no ability splash (Ruby repeats this case in both). */
async function curedOwnStatusMessage(battle: Battle, battler: Battler, oldStatus: Id): Promise<void> {
  switch (oldStatus) {
    case "SLEEP":
      await battle.pbDisplay(_INTL("{1}'s {2} woke it up!", battler.pbThis(), battler.abilityName()));
      break;
    case "POISON":
      await battle.pbDisplay(_INTL("{1}'s {2} cured its poison!", battler.pbThis(), battler.abilityName()));
      break;
    case "BURN":
      await battle.pbDisplay(_INTL("{1}'s {2} healed its burn!", battler.pbThis(), battler.abilityName()));
      break;
    case "PARALYSIS":
      await battle.pbDisplay(_INTL("{1}'s {2} cured its paralysis!", battler.pbThis(), battler.abilityName()));
      break;
    case "FROZEN":
      await battle.pbDisplay(_INTL("{1}'s {2} defrosted it!", battler.pbThis(), battler.abilityName()));
      break;
  }
}

AbilityEffects.EndOfRoundHealing.add("HYDRATION", async (_ability: Id, battler: Battler, battle: Battle) => {
  if (battler.status === "NONE") return;
  if (!["Rain", "HeavyRain"].includes(battler.effectiveWeather())) return;
  await battle.pbShowAbilitySplash(battler);
  const oldStatus = battler.status;
  await battler.pbCureStatus(Scene.USE_ABILITY_SPLASH);
  if (!Scene.USE_ABILITY_SPLASH) await curedOwnStatusMessage(battle, battler, oldStatus);
  await battle.pbHideAbilitySplash(battler);
});

AbilityEffects.EndOfRoundHealing.add("SHEDSKIN", async (_ability: Id, battler: Battler, battle: Battle) => {
  if (battler.status === "NONE") return;
  if (!(battle.pbRandom(100) < 30)) return;
  await battle.pbShowAbilitySplash(battler);
  const oldStatus = battler.status;
  await battler.pbCureStatus(Scene.USE_ABILITY_SPLASH);
  if (!Scene.USE_ABILITY_SPLASH) await curedOwnStatusMessage(battle, battler, oldStatus);
  await battle.pbHideAbilitySplash(battler);
});

//===============================================================================
// EndOfRoundEffect handlers
//===============================================================================

AbilityEffects.EndOfRoundEffect.add("BADDREAMS", async (_ability: Id, battler: Battler, battle: Battle) => {
  for (const b of battle.allOtherSideBattlers(battler.index)) {
    if (!b.near(battler) || !b.asleep()) continue;
    await battle.pbShowAbilitySplash(battler);
    // Deliberate fix (008_Battle_AbilityEffects.rb:2421-2422 never hides the
    // splash when the target's Magic Guard stops the damage).
    if (!await b.takesIndirectDamageAsync(Scene.USE_ABILITY_SPLASH)) {
      await battle.pbHideAbilitySplash(battler);
      continue;
    }
    await b.pbTakeEffectDamage(Math.floor(b.totalhp / 8), true, async (_hpLost: number) => {
      if (Scene.USE_ABILITY_SPLASH) {
        await battle.pbDisplay(_INTL("{1} is tormented!", b.pbThis()));
      } else {
        await battle.pbDisplay(_INTL("{1} is tormented by {2}'s {3}!",
          b.pbThis(), battler.pbThis(true), battler.abilityName()));
      }
      await battle.pbHideAbilitySplash(battler);
    });
  }
});

AbilityEffects.EndOfRoundEffect.add("MOODY", async (_ability: Id, battler: Battler, battle: Battle) => {
  const randomUp: Id[] = [];
  let randomDown: Id[] = [];
  if (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 8) {
    for (const s of Stat.eachMainBattle()) {
      if (await battler.pbCanRaiseStatStage(s.id, battler)) randomUp.push(s.id);
      if (await battler.pbCanLowerStatStage(s.id, battler)) randomDown.push(s.id);
    }
  } else {
    for (const s of Stat.eachBattle()) {
      if (await battler.pbCanRaiseStatStage(s.id, battler)) randomUp.push(s.id);
      if (await battler.pbCanLowerStatStage(s.id, battler)) randomDown.push(s.id);
    }
  }
  if (randomUp.length === 0 && randomDown.length === 0) return;
  await battle.pbShowAbilitySplash(battler);
  if (randomUp.length > 0) {
    const r = battle.pbRandom(randomUp.length);
    await battler.pbRaiseStatStageByAbility(randomUp[r]!, 2, battler, false);
    randomDown = randomDown.filter((s) => s !== randomUp[r]); // randomDown.delete(randomUp[r])
  }
  if (randomDown.length > 0) {
    const r = battle.pbRandom(randomDown.length);
    await battler.pbLowerStatStageByAbility(randomDown[r]!, 1, battler, false);
  }
  await battle.pbHideAbilitySplash(battler);
  if (randomDown.length > 0) await battler.pbItemStatRestoreCheck();
  await battler.pbItemOnStatDropped();
});

AbilityEffects.EndOfRoundEffect.add("SPEEDBOOST", async (_ability: Id, battler: Battler, battle: Battle) => {
  // A Pokémon's turnCount is 0 if it became active after the beginning of a
  // round
  if (battler.turnCount > 0 && battle.choices[battler.index]![0] !== "Run" &&
      await battler.pbCanRaiseStatStage("SPEED", battler)) {
    await battler.pbRaiseStatStageByAbility("SPEED", 1, battler);
  }
});

//===============================================================================
// EndOfRoundGainItem handlers
//===============================================================================

AbilityEffects.EndOfRoundGainItem.add("BALLFETCH", async (_ability: Id, battler: Battler, battle: Battle) => {
  if (battler.item) return;
  if (battle.firstPokeBall == null) return;
  await battle.pbShowAbilitySplash(battler);
  battler.item = battle.firstPokeBall;
  if (!battler.initialItem()) battler.setInitialItem(battler.item);
  battle.firstPokeBall = null;
  await battle.pbDisplay(_INTL("{1} retrieved the thrown {2}!", battler.pbThis(), battler.itemName()));
  await battle.pbHideAbilitySplash(battler);
  await battler.pbHeldItemTriggerCheck();
});

AbilityEffects.EndOfRoundGainItem.add("HARVEST", async (_ability: Id, battler: Battler, battle: Battle) => {
  if (battler.item) return;
  if (!battler.recycleItem() || !Item.get(battler.recycleItem()!).isBerry()) return;
  if (!["Sun", "HarshSun"].includes(battler.effectiveWeather())) {
    if (!(battle.pbRandom(100) < 50)) return;
  }
  await battle.pbShowAbilitySplash(battler);
  battler.item = battler.recycleItem();
  battler.setRecycleItem(null);
  if (!battler.initialItem()) battler.setInitialItem(battler.item);
  await battle.pbDisplay(_INTL("{1} harvested one {2}!", battler.pbThis(), battler.itemName()));
  await battle.pbHideAbilitySplash(battler);
  await battler.pbHeldItemTriggerCheck();
});

AbilityEffects.EndOfRoundGainItem.add("PICKUP", async (_ability: Id, battler: Battler, battle: Battle) => {
  if (battler.item) return;
  let foundItem: Id | null = null;
  let fromBattler: Battler | null = null;
  let use = 0;
  for (const b of battle.allBattlers()) {
    if (b.index === battler.index) continue;
    if (b.effects[PBEffects.PickupUse] <= use) continue;
    foundItem = b.effects[PBEffects.PickupItem];
    fromBattler = b;
    use = b.effects[PBEffects.PickupUse];
  }
  if (!foundItem || !fromBattler) return;
  await battle.pbShowAbilitySplash(battler);
  battler.item = foundItem;
  fromBattler.effects[PBEffects.PickupItem] = null;
  fromBattler.effects[PBEffects.PickupUse] = 0;
  if (fromBattler.recycleItem() === foundItem) fromBattler.setRecycleItem(null);
  if (battle.wildBattle() && !battler.initialItem() && fromBattler.initialItem() === foundItem) {
    battler.setInitialItem(foundItem);
    fromBattler.setInitialItem(null);
  }
  await battle.pbDisplay(_INTL("{1} found one {2}!", battler.pbThis(), battler.itemName()));
  await battle.pbHideAbilitySplash(battler);
  await battler.pbHeldItemTriggerCheck();
});
