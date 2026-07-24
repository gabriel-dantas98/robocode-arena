import dev.robocode.tankroyale.botapi.*;
import dev.robocode.tankroyale.botapi.events.*;

/** Rammer — charge scanned bots. */
public class Rammer extends Bot {
    public static void main(String[] args) { new Rammer().start(); }
    @Override public void run() {
        while (isRunning()) { turnRadarRight(45); forward(80); }
    }
    @Override public void onScannedBot(ScannedBotEvent e) {
        turnLeft(bearingTo(e.getX(), e.getY()));
        fire(1);
        forward(120);
    }
    @Override public void onHitWall(HitWallEvent e) { back(40); turnRight(120); }
}
