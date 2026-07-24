import dev.robocode.tankroyale.botapi.*;
import dev.robocode.tankroyale.botapi.events.*;

/** Tracker — aim gun at scanned bot. */
public class Tracker extends Bot {
    public static void main(String[] args) { new Tracker().start(); }
    @Override public void run() {
        while (isRunning()) { turnRadarRight(360); forward(40); turnLeft(15); }
    }
    @Override public void onScannedBot(ScannedBotEvent e) {
        turnGunLeft(gunBearingTo(e.getX(), e.getY()));
        fire(2.5);
    }
    @Override public void onHitWall(HitWallEvent e) { back(70); turnRight(90); }
}
