// Menu and save-related functions event scripts call by their Ruby names.

import { pbSaveScreen } from "../../ui/save/saveScreen";
import { defineScript } from "../scriptApi";

defineScript("pbSaveScreen", () => pbSaveScreen());
