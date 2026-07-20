import dev.robocode.tankroyale.botapi.*;
import dev.robocode.tankroyale.botapi.events.*;

/**
 * Minimal stub for scale tests — spin radar, move a bit, fire on scan.
 */
public class StubBot extends Bot {
    public static void main(String[] args) {
        new StubBot().start();
    }

    @Override
    public void run() {
        while (isRunning()) {
            turnRadarRight(360);
            forward(40);
            turnLeft(15);
        }
    }

    @Override
    public void onScannedBot(ScannedBotEvent e) {
        fire(1.0);
    }

    @Override
    public void onHitWall(HitWallEvent e) {
        back(60);
        turnRight(90);
    }
}
