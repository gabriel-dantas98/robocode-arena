import dev.robocode.tankroyale.botapi.*;
import dev.robocode.tankroyale.botapi.events.*;

/** Lab starter — move, scan, fire. Edit & Deploy. */
public class LabBot extends Bot {
    public static void main(String[] args) {
        new LabBot().start();
    }

    @Override
    public void run() {
        while (isRunning()) {
            turnRadarRight(360);
            forward(50);
            turnLeft(20);
        }
    }

    @Override
    public void onScannedBot(ScannedBotEvent e) {
        fire(1.5);
    }

    @Override
    public void onHitWall(HitWallEvent e) {
        back(60);
        turnRight(90);
    }
}
