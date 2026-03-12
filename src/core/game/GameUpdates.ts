import { AllPlayersStats, ClientID, Winner } from "../Schemas";
import {
  EmojiMessage,
  GameUpdates,
  Gold,
  MessageType,
  NameViewData,
  PlayerID,
  PlayerType,
  Team,
  Tick,
  TrainType,
  UnitType,
} from "./Game";
import { TileRef } from "./GameMap";

export interface GameUpdateViewData {
  tick: number;
  updates: GameUpdates;
  /**
   * Packed tile updates as `[tileRef, state]` uint32 pairs.
   *
   * `tileRef` is a `TileRef` (fits in uint32), and `state` is the packed per-tile
   * state (`uint16`) stored in a `uint32` lane.
   */
  packedTileUpdates: Uint32Array;
  /**
   * Optional packed motion plan records.
   *
   * When present, this buffer is expected to be transferred worker -> main
   * (similar to `packedTileUpdates`) to avoid structured-clone copies.
   */
  packedMotionPlans?: Uint32Array;
  playerNameViewData: Record<string, NameViewData>;
  tickExecutionDuration?: number;
  pendingTurns?: number;
}

export interface ErrorUpdate {
  errMsg: string;
  stack?: string;
}

export enum GameUpdateType {
  // Tile updates are delivered via `packedTileUpdates` on the outer GameUpdateViewData.
  Tile,
  Unit,
  Player,
  DisplayEvent,
  DisplayChatEvent,
  AllianceRequest,
  AllianceRequestReply,
  BrokeAlliance,
  AllianceExpired,
  AllianceExtension,
  TargetPlayer,
  Emoji,
  Win,
  Hash,
  UnitIncoming,
  BonusEvent,
  RailroadDestructionEvent,
  RailroadConstructionEvent,
  RailroadSnapEvent,
  ConquestEvent,
  EmbargoEvent,
  GamePaused,
  VaultFrontStatus,
  VaultFrontActivity,
}

export type GameUpdate =
  | UnitUpdate
  | PlayerUpdate
  | AllianceRequestUpdate
  | AllianceRequestReplyUpdate
  | BrokeAllianceUpdate
  | AllianceExpiredUpdate
  | DisplayMessageUpdate
  | DisplayChatMessageUpdate
  | TargetPlayerUpdate
  | EmojiUpdate
  | WinUpdate
  | HashUpdate
  | UnitIncomingUpdate
  | AllianceExtensionUpdate
  | BonusEventUpdate
  | RailroadConstructionUpdate
  | RailroadDestructionUpdate
  | RailroadSnapUpdate
  | ConquestUpdate
  | EmbargoUpdate
  | GamePausedUpdate
  | VaultFrontStatusUpdate
  | VaultFrontActivityUpdate;

export interface BonusEventUpdate {
  type: GameUpdateType.BonusEvent;
  player: PlayerID;
  tile: TileRef;
  gold: number;
  troops: number;
}

export interface RailroadConstructionUpdate {
  type: GameUpdateType.RailroadConstructionEvent;
  id: number;
  tiles: TileRef[];
}

export interface RailroadDestructionUpdate {
  type: GameUpdateType.RailroadDestructionEvent;
  id: number;
}

export interface RailroadSnapUpdate {
  type: GameUpdateType.RailroadSnapEvent;
  originalId: number;
  newId1: number;
  newId2: number;
  tiles1: TileRef[];
  tiles2: TileRef[];
}

export interface ConquestUpdate {
  type: GameUpdateType.ConquestEvent;
  conquerorId: PlayerID;
  conqueredId: PlayerID;
  gold: Gold;
}

export interface UnitUpdate {
  type: GameUpdateType.Unit;
  unitType: UnitType;
  troops: number;
  id: number;
  ownerID: number;
  lastOwnerID?: number;
  // TODO: make these tilerefs
  pos: TileRef;
  lastPos: TileRef;
  isActive: boolean;
  reachedTarget: boolean;
  retreating: boolean;
  targetable: boolean;
  markedForDeletion: number | false;
  targetUnitId?: number; // Only for trade ships
  targetTile?: TileRef; // Only for nukes
  health?: number;
  underConstruction?: boolean;
  missileTimerQueue: number[];
  level: number;
  hasTrainStation: boolean;
  trainType?: TrainType; // Only for trains
  loaded?: boolean; // Only for trains
}

export interface AttackUpdate {
  attackerID: number;
  targetID: number;
  troops: number;
  id: string;
  retreating: boolean;
}

export interface PlayerUpdate {
  type: GameUpdateType.Player;
  nameViewData?: NameViewData;
  clientID: ClientID | null;
  name: string;
  displayName: string;
  id: PlayerID;
  team?: Team;
  smallID: number;
  playerType: PlayerType;
  isAlive: boolean;
  isDisconnected: boolean;
  tilesOwned: number;
  gold: Gold;
  goldTroopFocus: number;
  troops: number;
  allies: number[];
  embargoes: Set<PlayerID>;
  isTraitor: boolean;
  traitorRemainingTicks?: number;
  targets: number[];
  outgoingEmojis: EmojiMessage[];
  outgoingAttacks: AttackUpdate[];
  incomingAttacks: AttackUpdate[];
  outgoingAllianceRequests: PlayerID[];
  alliances: AllianceView[];
  hasSpawned: boolean;
  betrayals: number;
  lastDeleteUnitTick: Tick;
  isLobbyCreator: boolean;
}

export interface AllianceView {
  id: number;
  other: PlayerID;
  createdAt: Tick;
  expiresAt: Tick;
  hasExtensionRequest: boolean;
}

export interface AllianceRequestUpdate {
  type: GameUpdateType.AllianceRequest;
  requestorID: number;
  recipientID: number;
  createdAt: Tick;
}

export interface AllianceRequestReplyUpdate {
  type: GameUpdateType.AllianceRequestReply;
  request: AllianceRequestUpdate;
  accepted: boolean;
}

export interface BrokeAllianceUpdate {
  type: GameUpdateType.BrokeAlliance;
  traitorID: number;
  betrayedID: number;
  allianceID: number;
}

export interface AllianceExpiredUpdate {
  type: GameUpdateType.AllianceExpired;
  player1ID: number;
  player2ID: number;
}

export interface AllianceExtensionUpdate {
  type: GameUpdateType.AllianceExtension;
  playerID: number;
  allianceID: number;
}

export interface TargetPlayerUpdate {
  type: GameUpdateType.TargetPlayer;
  playerID: number;
  targetID: number;
}

export interface EmojiUpdate {
  type: GameUpdateType.Emoji;
  emoji: EmojiMessage;
}

export interface DisplayMessageUpdate {
  type: GameUpdateType.DisplayEvent;
  message: string;
  messageType: MessageType;
  goldAmount?: bigint;
  playerID: number | null;
  params?: Record<string, string | number>;
}

export type DisplayChatMessageUpdate = {
  type: GameUpdateType.DisplayChatEvent;
  key: string;
  category: string;
  target: string | undefined;
  playerID: number | null;
  isFrom: boolean;
  recipient: string;
};

export interface WinUpdate {
  type: GameUpdateType.Win;
  allPlayersStats: AllPlayersStats;
  winner: Winner;
}

export interface HashUpdate {
  type: GameUpdateType.Hash;
  tick: Tick;
  hash: number;
}

export interface UnitIncomingUpdate {
  type: GameUpdateType.UnitIncoming;
  unitID: number;
  message: string;
  messageType: MessageType;
  playerID: number;
}

export interface EmbargoUpdate {
  type: GameUpdateType.EmbargoEvent;
  event: "start" | "stop";
  playerID: number;
  embargoedID: number;
}

export interface GamePausedUpdate {
  type: GameUpdateType.GamePaused;
  paused: boolean;
}

export interface VaultFrontSiteState {
  id: number;
  tile: TileRef;
  controllerID: number | null;
  controlTicks: number;
  cooldownTicks: number;
  passiveOwnerID: number | null;
  nextPassiveIncomeTick: Tick;
  reducedRewardNextCapture: boolean;
  projectedGoldReward: number;
  projectedTroopsReward: number;
  projectedRewardMultiplier: number;
  projectedRewardScale: number;
  projectedStrengthMultiplier: number;
  projectedPhaseMultiplier: number;
  projectedRiskMultiplier: number;
  projectedDistance: number;
  projectedRisk: number;
  rewardMath: string;
}

export interface VaultFrontReroutePreview {
  command:
    | "reroute_city"
    | "reroute_port"
    | "reroute_factory"
    | "reroute_silo"
    | "reroute_safest";
  destinationTile: TileRef;
  etaSeconds: number;
  routeRisk: number;
  routeDistance: number;
  rewardMultiplier: number;
  rewardScale: number;
  strengthMultiplier: number;
  phaseMultiplier: number;
  riskMultiplier: number;
  goldReward: number;
  troopsReward: number;
  rewardMath: string;
  deltaGold: number;
  deltaTroops: number;
  deltaEtaSeconds: number;
  deltaRisk: number;
}

export interface VaultFrontConvoyState {
  id: number;
  ownerID: number;
  sourceTile: TileRef;
  destinationTile: TileRef;
  ticksRemaining: number;
  totalTicks: number;
  escortShield: number;
  goldReward: number;
  troopsReward: number;
  rewardMultiplier: number;
  rewardScale: number;
  strengthMultiplier: number;
  phaseMultiplier: number;
  riskMultiplier: number;
  routeRisk: number;
  routeDistance: number;
  rewardMath: string;
  reroutePreviews?: VaultFrontReroutePreview[];
}

export interface VaultFrontBeaconState {
  playerID: number;
  charge: number;
  cooldownUntilTick: Tick;
  maskedUntilTick: Tick;
  jamBreakerCooldownUntilTick: Tick;
  escortUntilTick: Tick;
  anchorTile?: TileRef;
  factoryCount: number;
}

export interface VaultFrontStatusUpdate {
  type: GameUpdateType.VaultFrontStatus;
  weeklyMutator:
    | "none"
    | "lane_fog"
    | "accelerated_cooldowns"
    | "double_passive";
  captureTicksRequired: number;
  cooldownTicksTotal: number;
  passiveGoldPerMinute?: number;
  jamBreakerGoldCost?: number;
  escortDurationTicks?: number;
  sites: VaultFrontSiteState[];
  convoys: VaultFrontConvoyState[];
  beacons: VaultFrontBeaconState[];
}

export interface VaultFrontActivityUpdate {
  type: GameUpdateType.VaultFrontActivity;
  activity:
    | "vault_captured"
    | "vault_passive_income"
    | "convoy_launched"
    | "convoy_rerouted"
    | "convoy_escorted"
    | "convoy_intercepted"
    | "convoy_delivered"
    | "beacon_pulse"
    | "jam_breaker"
    | "comeback_surge";
  tile: TileRef;
  sourcePlayerID: number | null;
  targetPlayerID: number | null;
  label: string;
  durationTicks: number;
}
