package com.twilightcafe.tvplayer;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.os.Process;

/**
 * Starts the app again from scratch, so Firefox's engine starts again too and reads its start-up
 * settings (the video format). The engine can only start once in an app's life, so the app's
 * process has to end. This screen runs in a process of its own: it ends the app's, opens the app
 * again and ends itself. Nothing shows: it's see-through and gone at once.
 */
public class Restart extends Activity {

    /** Called by the app itself, while it's on screen. */
    static void now(Activity from) {
        Intent i = new Intent(from, Restart.class);
        i.putExtra("pid", Process.myPid());
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        from.startActivity(i);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        int pid = getIntent().getIntExtra("pid", -1);
        if (pid > 0 && pid != Process.myPid()) Process.killProcess(pid);
        Intent start = new Intent(this, MainActivity.class);
        start.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        startActivity(start);
        finish();
        Runtime.getRuntime().exit(0);
    }
}
