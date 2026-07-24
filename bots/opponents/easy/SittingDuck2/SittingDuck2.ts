import { Bot } from "@robocode.dev/tank-royale-bot-api";

class SittingDuck2 extends Bot {
  static main() {
    new SittingDuck2().start();
  }
  override run() {
    while (this.isRunning()) {
      this.turnLeft(5);
    }
  }
}
SittingDuck2.main();
