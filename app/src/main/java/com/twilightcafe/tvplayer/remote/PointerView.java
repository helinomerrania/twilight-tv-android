package com.twilightcafe.tvplayer.remote;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.view.View;

/** The pointer shown during quality setup: a white arrow with a dark edge, its tip at (tip, tip). */
final class PointerView extends View {

    private final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint edge = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path arrow = new Path();
    final float tip;

    PointerView(Context c, float size) {
        super(c);
        fill.setColor(0xFFFFFFFF);
        edge.setColor(0xFF0B1030);
        edge.setStyle(Paint.Style.STROKE);
        edge.setStrokeWidth(Math.max(2f, size / 12f));
        tip = edge.getStrokeWidth();
        arrow.moveTo(0, 0);
        arrow.lineTo(0, size);
        arrow.lineTo(size * 0.27f, size * 0.75f);
        arrow.lineTo(size * 0.46f, size * 1.15f);
        arrow.lineTo(size * 0.62f, size * 1.08f);
        arrow.lineTo(size * 0.44f, size * 0.69f);
        arrow.lineTo(size * 0.78f, size * 0.69f);
        arrow.close();
    }

    private final Runnable unpress = () -> {
        fill.setColor(0xFFFFFFFF);
        invalidate();
    };

    // A click: gold for a moment
    void pressed() {
        fill.setColor(0xFFFFCF8A);
        invalidate();
        removeCallbacks(unpress);
        postDelayed(unpress, 250);
    }

    @Override
    protected void onDraw(Canvas c) {
        c.translate(tip, tip);
        c.drawPath(arrow, fill);
        c.drawPath(arrow, edge);
    }
}
