import dev.robocode.tankroyale.botapi.*;
import dev.robocode.tankroyale.botapi.events.*;

/** Spinner — spin and fire. */
public class Spinner extends Bot {
    public static void main(String[] args) { new Spinner().start(); }
    @Override public void run() {
        while (isRunning()) { turnRight(30); turnGunRight(30); turnRadarRight(45); }
    }
    @Override public void onScannedBot(ScannedBotEvent e) { fire(2); }
    @Override public void onHitWall(HitWallEvent e) { back(30); turnLeft(90); }
}
