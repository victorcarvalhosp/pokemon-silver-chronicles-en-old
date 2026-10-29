// The ability handlers (Battle::AbilityEffects::X.add/.copy calls), in Ruby's
// load order: core Essentials' 008_Battle_AbilityEffects.rb (split by section),
// then the plugins that add or replace handlers, in plugin load order
// (Data/PluginScripts.rxdata). Later registrations replace earlier ones, and
// .copy copies whatever handler is registered at that point, as in Ruby.
// The registries and trigger functions are in ../other/AbilityEffects.ts.

// Data/Scripts/011_Battle/006_Other battle code/008_Battle_AbilityEffects.rb
import "./StatAndStatusHandlers";
import "./MoveAndDamageHandlers";
import "./HitAndEndOfMoveHandlers";
import "./EndOfRoundHandlers";
import "./SwitchingHandlers";
// Plugins
import "./Hotfixes";
import "./Gen9_AbilityHandlers";
import "./Gen9_NewAbilityHandlers";
import "./DeluxeAndZUD";
