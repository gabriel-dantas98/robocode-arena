from robocode_tank_royale.bot_api import Bot, BotInfo
from robocode_tank_royale.bot_api.events import ScannedBotEvent, HitWallEvent


class Spinner(Bot):
    """Spinner — spin and fire."""

    def __init__(self) -> None:
        super().__init__(BotInfo.from_file("Spinner.json"))

    def run(self) -> None:
        while self.running:
            self.turn_right(30)
            self.turn_gun_right(30)
            self.turn_radar_right(45)

    def on_scanned_bot(self, e: ScannedBotEvent) -> None:
        self.fire(2)

    def on_hit_wall(self, e: HitWallEvent) -> None:
        self.back(30)
        self.turn_left(90)


if __name__ == "__main__":
    Spinner().start()
