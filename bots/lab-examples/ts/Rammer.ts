import { Bot, HitWallEvent, ScannedBotEvent } from "@robocode.dev/tank-royale-bot-api";

/** Rammer — ao scanear, vira e investe; fire curto no caminho. */
class Rammer extends Bot {
  static main() {
    new Rammer().start();
  }
  override run() {
    while (this.isRunning()) {
      this.turnRadarRight(45);
      this.forward(80);
    }
  }
  override onScannedBot(e: ScannedBotEvent) {
    const bearing = this.bearingTo(e.x, e.y);
    this.turnLeft(bearing);
    this.fire(1);
    this.forward(120);
  }
  override onHitWall(_e: HitWallEvent) {
    this.back(40);
    this.turnRight(120);
  }
}
Rammer.main();
