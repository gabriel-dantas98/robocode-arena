import { Bot, HitWallEvent, ScannedBotEvent } from "@robocode.dev/tank-royale-bot-api";

/** Walls — corre pela borda; ao bater, segue a parede; fire ao scanear. */
class Walls extends Bot {
  static main() {
    new Walls().start();
  }
  override run() {
    while (this.isRunning()) {
      this.turnRadarRight(90);
      this.forward(150);
    }
  }
  override onScannedBot(_e: ScannedBotEvent) {
    this.fire(1.5);
  }
  override onHitWall(_e: HitWallEvent) {
    this.back(20);
    this.turnRight(90);
    this.forward(100);
  }
}
Walls.main();
