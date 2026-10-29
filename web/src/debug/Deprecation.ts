// Port of 001_Technical/001_Debugging/005_Deprecation.rb: Deprecation.warn_method
// (a warning in the debug console) and Module#deprecated_method_alias, which
// defines an alias that warns before calling the method it aliases.

import { _INTL } from "../ui/messageConfig";
import { Console } from "./DebugConsole";
import { FalseClass, NilClass, TrueClass, validate } from "./Validation";

export const Deprecation = {
  /**
   * Sends a warning of a deprecated method into the debug console.
   * @param methodName name of the deprecated method
   * @param removalVersion version the method is removed in
   * @param alternative preferred alternative method
   */
  warnMethod(methodName: string, removalVersion: string | null = null, alternative: string | null = null): void {
    let text = _INTL('Usage of deprecated method "{1}" or its alias.', methodName);
    if (removalVersion !== null) {
      text += "\r\n" + _INTL("The method is slated to be removed in Essentials {1}.", removalVersion);
    }
    if (alternative !== null) {
      text += "\r\n" + _INTL('Use "{1}" instead.', alternative);
    }
    Console.echoWarn(text);
  },
};

/**
 * Module#deprecated_method_alias(name, aliased_method, removal_in:, class_method:):
 * defines `name` on `target` (a class, for class methods, or its prototype) as
 * an alias of `aliasedMethod` that warns in the debug console when used.
 */
export function deprecatedMethodAlias(
  target: { name?: string; prototype?: object } & object, name: string, aliasedMethod: string,
  { removalIn = null, classMethod = false }: { removalIn?: string | null; classMethod?: boolean } = {},
): void {
  validate([name, String], [aliasedMethod, String], [removalIn, [NilClass, String]], [classMethod, [TrueClass, FalseClass]]);
  const host = (classMethod ? target : (target as { prototype: object }).prototype) as Record<string, unknown>;
  const className = (target as { name?: string }).name ?? "";
  if (typeof host[aliasedMethod] !== "function") {
    const err = new Error(`${className} does not have method ${aliasedMethod} defined`);
    err.name = "ArgumentError";
    throw err;
  }
  const delimiter = classMethod ? "." : "#";
  host[name] = function (this: Record<string, (...a: unknown[]) => unknown>, ...args: unknown[]) {
    const aliasName = `${className}${delimiter}${name}`;
    const aliasedMethodName = `${className}${delimiter}${aliasedMethod}`;
    Deprecation.warnMethod(aliasName, removalIn, aliasedMethodName);
    return this[aliasedMethod]!(...args);
  };
}
