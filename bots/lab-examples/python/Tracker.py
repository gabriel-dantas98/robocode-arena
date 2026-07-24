from robocode_tank_royale.bot_api import Bot, BotInfo
from robocode_tank_royale.bot_api.events import ScannedBotEvent, HitWallEvent


class Tracker(Bot):
    """Tracker — aim gun at scanned bot."""

    def __init__(self) -> None:
        super().__init__(BotInfo.from_file("Tracker.json"))

    def run(self) -> None:
        while self.running:
            self.turn_radar_right(360)
            self.forward(40)
            self.turn_left(15)

    def on_scanned_bot(self, e: ScannedBotEvent) -> None:
        self.turn_gun_left(self.gun_bearing_to(e.x, e.y))
        self.fire(2.5)

    def on_hit_wall(self, e: HitWallEvent) -> None:
        self.back(70)
        self.turn_right(90)


if __name__ == "__main__":
    Tracker().start()
