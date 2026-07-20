package arena.engine

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ArrayNode
import com.fasterxml.jackson.databind.node.ObjectNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import dev.robocode.tankroyale.runner.BattleResults
import dev.robocode.tankroyale.runner.BattleRunner
import dev.robocode.tankroyale.runner.BattleSetup
import dev.robocode.tankroyale.runner.BotEntry
import io.ktor.http.*
import io.ktor.serialization.jackson.*
import io.ktor.server.application.*
import io.ktor.server.engine.*
import io.ktor.server.netty.*
import io.ktor.server.plugins.contentnegotiation.*
import io.ktor.server.plugins.cors.routing.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import io.ktor.server.websocket.*
import io.ktor.websocket.*
import kotlinx.coroutines.*
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import java.time.Duration
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicReference
import kotlin.io.path.Path

data class StartBattleRequest(
    val botPaths: List<String>,
    val rounds: Int = 3,
    val arenaWidth: Int? = null,
    val arenaHeight: Int? = null,
    val turnTimeoutMicros: Int? = null,
)

enum class BattleStatus { BOOTING, RUNNING, ENDED, FAILED, STOPPED }

data class BattleSnapshot(
    val id: String,
    val status: BattleStatus,
    val bootConnected: Int = 0,
    val bootExpected: Int = 0,
    val bootElapsedMs: Long = 0,
    val turnNumber: Int = 0,
    val roundNumber: Int = 0,
    val botsAlive: Int = 0,
    val results: List<Map<String, Any?>>? = null,
    val error: String? = null,
    val metrics: Map<String, Any?> = emptyMap(),
)

class BattleSession(
    val id: String,
    val mapper: ObjectMapper,
) {
    private val snapshot = AtomicReference(BattleSnapshot(id = id, status = BattleStatus.BOOTING))
    private val events = MutableSharedFlow<ObjectNode>(
        replay = 16,
        extraBufferCapacity = 64,
        onBufferOverflow = BufferOverflow.DROP_OLDEST,
    )

    fun snapshot(): BattleSnapshot = snapshot.get()

    fun update(transform: (BattleSnapshot) -> BattleSnapshot) {
        while (true) {
            val cur = snapshot.get()
            if (snapshot.compareAndSet(cur, transform(cur))) break
        }
    }

    fun emitSync(type: String, payload: ObjectNode.() -> Unit = {}) {
        try {
            val node = mapper.createObjectNode()
            node.put("type", type)
            node.put("battleId", id)
            node.put("ts", System.currentTimeMillis())
            node.apply(payload)
            events.tryEmit(node)
        } catch (_: Throwable) {
            // never kill battle thread because of WS fanout
        }
    }

    fun flow() = events.asSharedFlow()
}

class BattleService(
    private val mapper: ObjectMapper = jacksonObjectMapper(),
) {
    private val sessions = ConcurrentHashMap<String, BattleSession>()
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    // Single-thread queue: BattleRunner rejects concurrent battles ("already in progress")
    private val executor = Executors.newSingleThreadExecutor { r ->
        Thread(r, "battle-queue").apply { isDaemon = true }
    }
    private val runnerLock = Any()
    @Volatile private var runner: BattleRunner? = null

    private fun runner(): BattleRunner {
        synchronized(runnerLock) {
            if (runner == null) {
                runner = BattleRunner.create {
                    embeddedServer()
                    botConnectTimeout(Duration.ofSeconds(180))
                }
            }
            return runner!!
        }
    }

    fun get(id: String): BattleSession? = sessions[id]

    fun start(req: StartBattleRequest): BattleSession {
        require(req.botPaths.size >= 2) { "Need at least 2 bots" }
        val id = UUID.randomUUID().toString().take(8)
        val session = BattleSession(id, mapper)
        sessions[id] = session

        executor.execute {
            val wallStart = System.currentTimeMillis()
            var bootMs = 0L
            try {
                session.update { it.copy(status = BattleStatus.BOOTING, bootExpected = req.botPaths.size) }
                session.emitSync("boot_started") { put("expected", req.botPaths.size) }

                val bots = req.botPaths.map { BotEntry.of(Path(it)) }
                val side = arenaSide(req.botPaths.size, req.arenaWidth, req.arenaHeight)
                val setup = BattleSetup.custom {
                    numberOfRounds = req.rounds
                    arenaWidth = side
                    arenaHeight = side
                    minNumberOfParticipants = 2
                    if (req.turnTimeoutMicros != null) {
                        turnTimeoutMicros = req.turnTimeoutMicros
                    }
                }

                val r = runner()
                r.startBattleAsync(setup, bots).use { handle ->
                    val owner = Any()
                    handle.onBootProgress.on(owner) { progress ->
                        session.update {
                            it.copy(
                                bootConnected = progress.totalConnected,
                                bootExpected = progress.totalExpected,
                                bootElapsedMs = progress.elapsedMs,
                            )
                        }
                        if (progress.totalConnected >= progress.totalExpected && bootMs == 0L) {
                            bootMs = progress.elapsedMs
                        }
                        session.emitSync("boot_progress") {
                            put("connected", progress.totalConnected)
                            put("expected", progress.totalExpected)
                            put("elapsedMs", progress.elapsedMs)
                        }
                    }

                    handle.onGameStarted.on(owner) { _ ->
                        if (bootMs == 0L) {
                            bootMs = session.snapshot().bootElapsedMs
                        }
                        session.update { it.copy(status = BattleStatus.RUNNING) }
                        session.emitSync("game_started")
                    }

                    handle.onTickEvent.on(owner) { tick ->
                        try {
                            val turn = tick.turnNumber
                            val alive = tick.botStates.size
                            session.update {
                                it.copy(status = BattleStatus.RUNNING, turnNumber = turn, botsAlive = alive)
                            }
                            // sample ticks for UI — every 3rd turn keeps WS/CPU sane at scale
                            if (turn % 3 == 0 || alive <= 2) {
                                val botsNode = mapper.createArrayNode()
                                for (b in tick.botStates) {
                                    val o = botsNode.addObject()
                                    o.put("id", b.id)
                                    o.put("x", b.x)
                                    o.put("y", b.y)
                                    o.put("direction", b.direction)
                                    o.put("energy", b.energy)
                                    o.put("speed", b.speed)
                                }
                                session.emitSync("tick") {
                                    put("turn", turn)
                                    put("round", tick.roundNumber)
                                    set<ArrayNode>("bots", botsNode)
                                }
                            }
                        } catch (_: Throwable) {
                        }
                    }

                    handle.onRoundEnded.on(owner) { round ->
                        session.update { it.copy(roundNumber = round.roundNumber) }
                        session.emitSync("round_ended") {
                            put("round", round.roundNumber)
                            put("turn", round.turnNumber)
                        }
                    }

                    val results = handle.awaitResults()
                    val wallMs = System.currentTimeMillis() - wallStart
                    val mapped = mapResults(results)
                    session.update {
                        it.copy(
                            status = BattleStatus.ENDED,
                            results = mapped,
                            metrics = mapOf(
                                "bootMs" to bootMs,
                                "wallMs" to wallMs,
                                "botCount" to req.botPaths.size,
                                "rounds" to req.rounds,
                                "arena" to side,
                            ),
                        )
                    }
                    session.emitSync("game_ended") {
                        set<ArrayNode>("results", mapper.valueToTree(mapped))
                        put("bootMs", bootMs)
                        put("wallMs", wallMs)
                    }
                }
            } catch (t: Throwable) {
                t.printStackTrace()
                session.update {
                    it.copy(status = BattleStatus.FAILED, error = t.message ?: t::class.java.simpleName)
                }
                session.emitSync("error") {
                    put("message", t.message ?: t::class.java.simpleName)
                }
            }
        }

        return session
    }

    fun stop(id: String): Boolean {
        val session = sessions[id] ?: return false
        session.update { it.copy(status = BattleStatus.STOPPED) }
        session.emitSync("stopped")
        return true
    }

    private fun arenaSide(n: Int, w: Int?, h: Int?): Int {
        if (w != null && h != null) return maxOf(w, h)
        return when {
            n <= 3 -> 800
            n <= 10 -> 1000
            n <= 40 -> 1400
            n <= 100 -> 2000
            n <= 200 -> 2800
            else -> 3600
        }
    }

    private fun mapResults(results: BattleResults): List<Map<String, Any?>> =
        results.results.map { bot ->
            mapOf(
                "rank" to bot.rank,
                "name" to bot.name,
                "version" to bot.version,
                "totalScore" to bot.totalScore,
                "survival" to bot.survival,
                "bulletDamage" to bot.bulletDamage,
                "ramDamage" to bot.ramDamage,
                "firstPlaces" to bot.firstPlaces,
            )
        }

    fun close() {
        scope.cancel()
        executor.shutdownNow()
        synchronized(runnerLock) {
            try { runner?.close() } catch (_: Throwable) {}
            runner = null
        }
    }
}

fun main() {
    Thread.setDefaultUncaughtExceptionHandler { t, e ->
        System.err.println("Uncaught in ${t.name}: ${e.message}")
        e.printStackTrace()
    }

    val port = System.getenv("ENGINE_PORT")?.toIntOrNull() ?: 7601
    val service = BattleService()

    Runtime.getRuntime().addShutdownHook(Thread {
        println("Shutting down battle service…")
        service.close()
    })

    embeddedServer(Netty, port = port, host = "0.0.0.0") {
        install(ContentNegotiation) { jackson() }
        install(CORS) {
            anyHost()
            allowHeader(HttpHeaders.ContentType)
            allowMethod(HttpMethod.Options)
            allowMethod(HttpMethod.Get)
            allowMethod(HttpMethod.Post)
        }
        install(WebSockets) {
            pingPeriod = Duration.ofSeconds(15)
            timeout = Duration.ofSeconds(30)
        }

        routing {
            get("/health") {
                call.respond(mapOf("ok" to true, "service" to "robocode-arena-engine"))
            }

            post("/battles") {
                try {
                    val req = call.receive<StartBattleRequest>()
                    val session = service.start(req)
                    call.respond(mapOf("id" to session.id, "status" to session.snapshot().status.name))
                } catch (t: Throwable) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to (t.message ?: "bad request")))
                }
            }

            get("/battles/{id}") {
                val id = call.parameters["id"]!!
                val session = service.get(id)
                    ?: return@get call.respond(HttpStatusCode.NotFound, mapOf("error" to "not found"))
                call.respond(session.snapshot())
            }

            post("/battles/{id}/stop") {
                val id = call.parameters["id"]!!
                if (!service.stop(id)) {
                    call.respond(HttpStatusCode.NotFound, mapOf("error" to "not found"))
                } else {
                    call.respond(mapOf("ok" to true))
                }
            }

            webSocket("/battles/{id}/ws") {
                val id = call.parameters["id"]!!
                val session = service.get(id)
                if (session == null) {
                    close(CloseReason(CloseReason.Codes.CANNOT_ACCEPT, "not found"))
                    return@webSocket
                }
                val mapper = jacksonObjectMapper()
                send(
                    Frame.Text(
                        mapper.writeValueAsString(
                            mapper.createObjectNode().apply {
                                put("type", "snapshot")
                                set<ObjectNode>("data", mapper.valueToTree(session.snapshot()))
                            },
                        ),
                    ),
                )
                session.flow().collect { event ->
                    send(Frame.Text(mapper.writeValueAsString(event)))
                }
            }
        }
    }.start(wait = true)
}
