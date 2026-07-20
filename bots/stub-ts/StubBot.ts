import { Bot, HitWallEvent, ScannedBotEvent } from "@robocode.dev/tank-royale-bot-api";

class StubBot extends Bot {
  static main() {
    new StubBot().start();
  }

  override run() {
    while (this.isRunning()) {
      this.turnRadarRight(360);
      this.forward(40);
      this.turnLeft(15);
    }
  }

  override onScannedBot(_e: ScannedBotEvent) {
    this.fire(1);
  }

  override onHitWall(_e: HitWallEvent) {
    this.back(60);
    this.turnRight(90);
  }
}

StubBot.main();
