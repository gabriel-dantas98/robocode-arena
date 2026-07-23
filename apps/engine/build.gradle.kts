plugins {
    kotlin("jvm") version "2.2.0"
    application
}

group = "arena"
version = "0.1.0"

repositories {
    mavenCentral()
}

dependencies {
    implementation("dev.robocode.tankroyale:robocode-tankroyale-runner:1.0.2")
    implementation("io.ktor:ktor-server-core:2.3.13")
    implementation("io.ktor:ktor-server-netty:2.3.13")
    implementation("io.ktor:ktor-server-websockets:2.3.13")
    implementation("io.ktor:ktor-server-content-negotiation:2.3.13")
    implementation("io.ktor:ktor-serialization-jackson:2.3.13")
    implementation("io.ktor:ktor-server-cors:2.3.13")
    implementation("com.fasterxml.jackson.module:jackson-module-kotlin:2.17.2")
    implementation("org.slf4j:slf4j-simple:2.0.16")
}

application {
    mainClass.set("arena.engine.MainKt")
}

kotlin {
    jvmToolchain(21)
}

tasks.named<JavaExec>("run") {
    jvmArgs = listOf("-Xmx768m", "-XX:+UseG1GC")
}
