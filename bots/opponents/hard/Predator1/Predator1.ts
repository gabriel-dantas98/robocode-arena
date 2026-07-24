import { Bot, HitWallEvent, ScannedBotEvent } from "@robocode.dev/tank-royale-bot-api";

class Predator1 extends Bot {
  static main() {
    new Predator1().start();
  }

  override run() {
    while (this.isRunning()) {
      this.turnRadarRight(45);
      this.forward(80);
      this.turnRight(25 + Math.random() * 40);
    }
  }
  override onScannedBot(e: ScannedBotEvent) {
    this.turnGunRight(this.gunBearingTo(e.x, e.y));
    this.fire(2.5);
    this.turnRight(this.bearingTo(e.x, e.y));
  }
  override onHitWall(_e: HitWallEvent) {
    this.back(80);
    this.turnRight(120);
  }

}
Predator1.main();
