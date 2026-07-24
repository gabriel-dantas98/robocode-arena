import { Bot, HitWallEvent, ScannedBotEvent } from "@robocode.dev/tank-royale-bot-api";

/** Tracker — mira o canhão no alvo scaneado (gunBearingTo) e dispara. */
class Tracker extends Bot {
  static main() {
    new Tracker().start();
  }
  override run() {
    while (this.isRunning()) {
      this.turnRadarRight(360);
      this.forward(40);
      this.turnLeft(15);
    }
  }
  override onScannedBot(e: ScannedBotEvent) {
    this.turnGunLeft(this.gunBearingTo(e.x, e.y));
    this.fire(2.5);
  }
  override onHitWall(_e: HitWallEvent) {
    this.back(70);
    this.turnRight(90);
  }
}
Tracker.main();
