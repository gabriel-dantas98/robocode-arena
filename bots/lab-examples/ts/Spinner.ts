import { Bot, HitWallEvent, ScannedBotEvent } from "@robocode.dev/tank-royale-bot-api";

/** Spinner — gira no lugar, radar sempre ligado, atira em tudo que aparecer. */
class Spinner extends Bot {
  static main() {
    new Spinner().start();
  }
  override run() {
    while (this.isRunning()) {
      this.turnRight(30);
      this.turnGunRight(30);
      this.turnRadarRight(45);
    }
  }
  override onScannedBot(_e: ScannedBotEvent) {
    this.fire(2);
  }
  override onHitWall(_e: HitWallEvent) {
    this.back(30);
    this.turnLeft(90);
  }
}
Spinner.main();
