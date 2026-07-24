from robocode_tank_royale.bot_api import Bot, BotInfo
from robocode_tank_royale.bot_api.events import ScannedBotEvent, HitWallEvent


class Rammer(Bot):
    """Rammer — charge scanned bots."""

    def __init__(self) -> None:
        super().__init__(BotInfo.from_file("Rammer.json"))

    def run(self) -> None:
        while self.running:
            self.turn_radar_right(45)
            self.forward(80)

    def on_scanned_bot(self, e: ScannedBotEvent) -> None:
        self.turn_left(self.bearing_to(e.x, e.y))
        self.fire(1)
        self.forward(120)

    def on_hit_wall(self, e: HitWallEvent) -> None:
        self.back(40)
        self.turn_right(120)


if __name__ == "__main__":
    Rammer().start()
