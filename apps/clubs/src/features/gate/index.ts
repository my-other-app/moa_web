export { GateConsole } from "./components/gate-console";
export { outcomeCard, walkupCard } from "./lib/outcome-copy";
export { scanResultSchema, gateContextSchema, type ScanResult, type GateContext } from "./schemas";
export { startScanner, cameraProblem, type Scanner, type Facing } from "./lib/scanner";
export { useGateStoreOrders, useGateHandOver, useGateCatalog } from "./queries";
export { type GateStoreOrder, type GateCatalog } from "./schemas";
export {
  CameraWell,
  DOOR_FIELD,
  DOOR_LABEL,
  DoorBanner,
  DoorCount,
  DoorIconButton,
  DoorProgress,
  DoorSpinner,
  TONE_ICON,
  TONE_LINE,
  TONE_SOFT,
  TONE_SOLID,
  TONE_TEXT,
  TouchChoice,
  type DoorTone,
} from "./components/door-kit";
