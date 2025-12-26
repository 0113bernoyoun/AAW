package com.berno.aaw

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication
import org.springframework.scheduling.annotation.EnableScheduling

@SpringBootApplication
@EnableScheduling
class AawApplication

fun main(args: Array<String>) {
    runApplication<AawApplication>(*args)
}
