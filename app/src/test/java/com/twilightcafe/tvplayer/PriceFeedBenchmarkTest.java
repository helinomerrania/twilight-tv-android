package com.twilightcafe.tvplayer;

import org.junit.Test;

import java.lang.reflect.Method;

public class PriceFeedBenchmarkTest {

    @Test
    public void benchmarkTimeMethod() throws Exception {
        Method timeMethod = PriceFeed.class.getDeclaredMethod("time", String.class);
        timeMethod.setAccessible(true);

        String[] dates = {
            "2026-10-12T05:37:01.655Z",
            "2026-10-12T05:37:01Z",
            "2023-01-01T12:00:00.000Z",
            "invalid-date"
        };

        // Warmup
        for (int i = 0; i < 10000; i++) {
            for (String date : dates) {
                timeMethod.invoke(null, date);
            }
        }

        int iterations = 100000;
        long startTime = System.nanoTime();

        for (int i = 0; i < iterations; i++) {
            for (String date : dates) {
                timeMethod.invoke(null, date);
            }
        }

        long endTime = System.nanoTime();
        long durationMs = (endTime - startTime) / 1_000_000;

        System.out.println("Benchmark completed.");
        System.out.println("Total time for " + (iterations * dates.length) + " parses: " + durationMs + " ms");
        System.out.println("Average time per parse: " + (durationMs * 1.0 / (iterations * dates.length)) + " ms");
    }
}
