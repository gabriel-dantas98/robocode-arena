import { Bot } from "@robocode.dev/tank-royale-bot-api";

class SittingDuck3 extends Bot {
  static main() {
    new SittingDuck3().start();
  }
  override run() {
    while (this.isRunning()) {
      this.turnLeft(5);
    }
  }
}
SittingDuck3.main();
