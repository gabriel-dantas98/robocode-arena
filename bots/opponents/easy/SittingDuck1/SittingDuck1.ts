import { Bot } from "@robocode.dev/tank-royale-bot-api";

class SittingDuck1 extends Bot {
  static main() {
    new SittingDuck1().start();
  }
  override run() {
    while (this.isRunning()) {
      this.turnLeft(5);
    }
  }
}
SittingDuck1.main();
