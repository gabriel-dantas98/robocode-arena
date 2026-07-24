import dev.robocode.tankroyale.botapi.*;
import dev.robocode.tankroyale.botapi.events.*;

/** Walls — hug the walls. */
public class Walls extends Bot {
    public static void main(String[] args) { new Walls().start(); }
    @Override public void run() {
        while (isRunning()) { turnRadarRight(90); forward(150); }
    }
    @Override public void onScannedBot(ScannedBotEvent e) { fire(1.5); }
    @Override public void onHitWall(HitWallEvent e) { back(20); turnRight(90); forward(100); }
}
