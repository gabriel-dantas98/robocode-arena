import { Bot, HitWallEvent, ScannedBotEvent } from "@robocode.dev/tank-royale-bot-api";

/** Starter — scan, move, fire. Baseline pra editar. */
class Starter extends Bot {
  static main() {
    new Starter().start();
  }
  override run() {
    while (this.isRunning()) {
      this.turnRadarRight(360);
      this.forward(50);
      this.turnLeft(20);
    }
  }
  override onScannedBot(_e: ScannedBotEvent) {
    this.fire(1.5);
  }
  override onHitWall(_e: HitWallEvent) {
    this.back(60);
    this.turnRight(90);
  }
}
Starter.main();
