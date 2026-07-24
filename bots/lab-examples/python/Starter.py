from robocode_tank_royale.bot_api import Bot, BotInfo
from robocode_tank_royale.bot_api.events import ScannedBotEvent, HitWallEvent


class Starter(Bot):
    """Starter — scan, move, fire."""

    def __init__(self) -> None:
        super().__init__(BotInfo.from_file("Starter.json"))

    def run(self) -> None:
        while self.running:
            self.turn_radar_right(360)
            self.forward(50)
            self.turn_left(20)

    def on_scanned_bot(self, e: ScannedBotEvent) -> None:
        self.fire(1.5)

    def on_hit_wall(self, e: HitWallEvent) -> None:
        self.back(60)
        self.turn_right(90)


if __name__ == "__main__":
    Starter().start()
