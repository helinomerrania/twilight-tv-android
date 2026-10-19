package com.twilightcafe.tvplayer;

import java.util.ArrayList;
import java.util.List;

/**
 * For tests that make many checks in one go, each with a sentence saying what it checks. Each prints "ok" or
 * "FAIL" (with what was found instead), and the test fails at the end, naming every check that failed.
 */
public abstract class Checks {

    private int passed;
    private final List<String> failed = new ArrayList<>();

    protected void check(String name, boolean ok) {
        check(name, ok, "");
    }

    protected void check(String name, boolean ok, Object found) {
        if (ok) {
            passed++;
            System.out.println("  ok   " + name);
        } else {
            failed.add(name);
            System.out.println("  FAIL " + name + "  -> " + found);
        }
    }

    /** The end of the checks: fails, naming those that failed */
    protected void allPassed() {
        System.out.println(passed + " passed, " + failed.size() + " failed");
        if (!failed.isEmpty()) {
            throw new AssertionError(failed.size() + " of " + (passed + failed.size()) + " checks failed: " + String.join(" | ", failed));
        }
    }
}
