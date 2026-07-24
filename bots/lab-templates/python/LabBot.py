from robocode_tankroyale_botapi import Bot, BotInfo
from robocode_tankroyale_botapi.events import ScannedBotEvent, HitWallEvent


class LabBot(Bot):
    """Lab starter — move, scan, fire. Edit & Deploy."""

    def __init__(self) -> None:
        super().__init__(BotInfo.from_file("LabBot.json"))

    def run(self) -> None:
        while self.is_running:
            self.turn_radar_right(360)
            self.forward(50)
            self.turn_left(20)

    def on_scanned_bot(self, e: ScannedBotEvent) -> None:
        self.fire(1.5)

    def on_hit_wall(self, e: HitWallEvent) -> None:
        self.back(60)
        self.turn_right(90)


if __name__ == "__main__":
    LabBot().start()
