from robocode_tank_royale.bot_api import Bot, BotInfo
from robocode_tank_royale.bot_api.events import ScannedBotEvent, HitWallEvent


class Walls(Bot):
    """Walls — hug the walls."""

    def __init__(self) -> None:
        super().__init__(BotInfo.from_file("Walls.json"))

    def run(self) -> None:
        while self.running:
            self.turn_radar_right(90)
            self.forward(150)

    def on_scanned_bot(self, e: ScannedBotEvent) -> None:
        self.fire(1.5)

    def on_hit_wall(self, e: HitWallEvent) -> None:
        self.back(20)
        self.turn_right(90)
        self.forward(100)


if __name__ == "__main__":
    Walls().start()
