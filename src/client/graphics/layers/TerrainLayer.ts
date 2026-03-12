import { Theme } from "../../../core/configuration/Config";
import { GameView } from "../../../core/game/GameView";
import { TransformHandler } from "../TransformHandler";
import { Layer } from "./Layer";

export class TerrainLayer implements Layer {
  private canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;
  private imageData: ImageData;
  private theme: Theme;

  constructor(
    private game: GameView,
    private transformHandler: TransformHandler,
  ) {}
  shouldTransform(): boolean {
    return true;
  }
  tick() {
    if (this.game.config().theme() !== this.theme) {
      this.redraw();
    }
  }

  init() {
    console.log("redrew terrain layer");
    this.redraw();
  }

  redraw(): void {
    this.canvas = document.createElement("canvas");
    this.canvas.width = this.game.width();
    this.canvas.height = this.game.height();

    const context = this.canvas.getContext("2d", { alpha: false });
    if (context === null) throw new Error("2d context not supported");
    this.context = context;

    this.imageData = this.context.createImageData(
      this.canvas.width,
      this.canvas.height,
    );

    this.initImageData();
    this.context.putImageData(this.imageData, 0, 0);
  }

  initImageData() {
    this.theme = this.game.config().theme();
    this.game.forEachTile((tile) => {
      const x = this.game.x(tile);
      const y = this.game.y(tile);
      const isLand = this.game.isLand(tile);
      const coastal = this.isCoastalTile(tile, isLand);
      const terrainColor = this.theme.terrainColor(this.game, tile);
      const index = y * this.game.width() + x;
      const offset = index * 4;

      const n1 = this.tileNoise(x, y, 13) - 0.5;
      const n2 = this.tileNoise(x, y, 67) - 0.5;
      const directional = ((x / this.game.width()) * 2 - 1) * 3;
      const shade = n1 * 15 + n2 * 8 + directional;

      let r = terrainColor.rgba.r;
      let g = terrainColor.rgba.g;
      let b = terrainColor.rgba.b;

      if (isLand) {
        r += shade + 2;
        g += shade + 1.5;
        b += shade * 0.8;
        if (coastal) {
          r += 9;
          g += 8;
          b += 5;
        }
        if ((x + y) % 11 === 0) {
          r += 3;
          g += 4;
        }
      } else {
        r += shade * 0.35 - 6;
        g += shade * 0.45 - 3;
        b += shade * 0.85 + 7;
        if (coastal) {
          r += 5;
          g += 7;
          b += 12;
        }
      }

      this.imageData.data[offset] = this.clampChannel(r);
      this.imageData.data[offset + 1] = this.clampChannel(g);
      this.imageData.data[offset + 2] = this.clampChannel(b);
      this.imageData.data[offset + 3] = 255;
    });
  }

  private isCoastalTile(tile: number, isLand: boolean): boolean {
    const x = this.game.x(tile);
    const y = this.game.y(tile);
    const directions = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    for (const [dx, dy] of directions) {
      const nx = x + dx;
      const ny = y + dy;
      if (
        nx < 0 ||
        ny < 0 ||
        nx >= this.game.width() ||
        ny >= this.game.height()
      ) {
        continue;
      }
      const neighbor = this.game.ref(nx, ny);
      if (this.game.isLand(neighbor) !== isLand) {
        return true;
      }
    }
    return false;
  }

  private tileNoise(x: number, y: number, seed: number): number {
    let n = x * 374761393 + y * 668265263 + seed * 69069;
    n = (n ^ (n >>> 13)) * 1274126177;
    n ^= n >>> 16;
    return (n >>> 0) / 4294967295;
  }

  private clampChannel(value: number): number {
    return Math.max(0, Math.min(255, Math.round(value)));
  }

  renderLayer(context: CanvasRenderingContext2D) {
    if (this.transformHandler.scale < 1) {
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "low";
    } else {
      context.imageSmoothingEnabled = false;
    }
    context.drawImage(
      this.canvas,
      -this.game.width() / 2,
      -this.game.height() / 2,
      this.game.width(),
      this.game.height(),
    );
  }
}
