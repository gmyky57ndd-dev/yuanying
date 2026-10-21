package com.orbace.yuanying;

import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.IBinder;
import android.provider.Settings;
import android.text.InputType;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.view.inputmethod.InputMethodManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

/** ES-048: draggable always-on-top Xiaowu bubble with a quick note input. */
public class OverlayService extends Service {
    private static final String PREFS = "yuanying_overlay";
    private WindowManager wm;
    private WindowManager.LayoutParams bubbleParams;
    private WindowManager.LayoutParams panelParams;
    private View bubble;
    private View panel;
    private EditText panelInput;
    private boolean panelOpen;
    private float downX;
    private float downY;
    private int startX;
    private int startY;
    private boolean dragging;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        if (Build.VERSION.SDK_INT >= 23 && !Settings.canDrawOverlays(this)) {
            stopSelf();
            return;
        }
        wm = (WindowManager) getSystemService(WINDOW_SERVICE);
        bubble = createBubble();
        int type = Build.VERSION.SDK_INT >= 26
            ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            : WindowManager.LayoutParams.TYPE_PHONE;
        bubbleParams = new WindowManager.LayoutParams(
            dp(56), dp(56), type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT);
        bubbleParams.gravity = Gravity.TOP | Gravity.START;
        bubbleParams.x = dp(16);
        bubbleParams.y = dp(180);
        wm.addView(bubble, bubbleParams);
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean("active", true).apply();
    }

    private View createBubble() {
        TextView view = new TextView(this);
        view.setText("元婴");
        view.setTextColor(Color.WHITE);
        view.setTextSize(12);
        view.setGravity(Gravity.CENTER);
        GradientDrawable bg = new GradientDrawable();
        bg.setShape(GradientDrawable.OVAL);
        bg.setColor(Color.parseColor("#065f46"));
        bg.setStroke(dp(1), Color.parseColor("#34d399"));
        view.setBackground(bg);
        view.setOnTouchListener((v, event) -> {
            switch (event.getAction()) {
                case MotionEvent.ACTION_DOWN:
                    downX = event.getRawX();
                    downY = event.getRawY();
                    startX = bubbleParams.x;
                    startY = bubbleParams.y;
                    dragging = false;
                    return true;
                case MotionEvent.ACTION_MOVE:
                    int dx = (int) (event.getRawX() - downX);
                    int dy = (int) (event.getRawY() - downY);
                    if (Math.abs(dx) > dp(4) || Math.abs(dy) > dp(4)) dragging = true;
                    bubbleParams.x = startX + dx;
                    bubbleParams.y = startY + dy;
                    wm.updateViewLayout(bubble, bubbleParams);
                    return true;
                case MotionEvent.ACTION_UP:
                    if (!dragging) togglePanel();
                    return true;
                default:
                    return false;
            }
        });
        return view;
    }

    private void togglePanel() {
        if (panelOpen) {
            hidePanel();
            return;
        }
        if (panel == null) panel = createPanel();
        int type = Build.VERSION.SDK_INT >= 26
            ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            : WindowManager.LayoutParams.TYPE_PHONE;
        panelParams = new WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            type,
            WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
            PixelFormat.TRANSLUCENT);
        panelParams.gravity = Gravity.BOTTOM;
        panelParams.y = dp(80);
        panelParams.softInputMode =
            WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE
                | WindowManager.LayoutParams.SOFT_INPUT_STATE_VISIBLE;
        wm.addView(panel, panelParams);
        panelOpen = true;
        if (panelInput != null) {
            panelInput.requestFocus();
            InputMethodManager imm = (InputMethodManager)
                getSystemService(Context.INPUT_METHOD_SERVICE);
            imm.showSoftInput(panelInput, InputMethodManager.SHOW_IMPLICIT);
        }
    }

    private View createPanel() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.HORIZONTAL);
        root.setPadding(dp(8), dp(8), dp(8), dp(8));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.parseColor("#0c0a09"));
        bg.setStroke(dp(1), Color.parseColor("#44403c"));
        bg.setCornerRadius(dp(14));
        root.setBackground(bg);

        panelInput = new EditText(this);
        panelInput.setHint("记一句…");
        panelInput.setTextColor(Color.WHITE);
        panelInput.setHintTextColor(Color.GRAY);
        panelInput.setInputType(
            InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        panelInput.setSingleLine(true);

        Button send = new Button(this);
        send.setText("记下");
        send.setOnClickListener(v -> {
            String text = panelInput.getText().toString().trim();
            if (text.isEmpty()) return;
            try {
                JSONObject payload = new JSONObject();
                payload.put("text", text);
                boolean ok = new ApiClient().post(
                    ApiClient.BASE_URL + "/api/note", payload);
                Toast.makeText(
                    this,
                    ok ? "已记下" : "记录失败",
                    Toast.LENGTH_SHORT
                ).show();
            } catch (Exception e) {
                Toast.makeText(this, "记录失败", Toast.LENGTH_SHORT).show();
            }
            panelInput.setText("");
            hidePanel();
        });

        Button close = new Button(this);
        close.setText("关");
        close.setOnClickListener(v -> hidePanel());

        root.addView(panelInput, new LinearLayout.LayoutParams(0, dp(44), 1f));
        root.addView(send, new LinearLayout.LayoutParams(dp(64), dp(44)));
        root.addView(close, new LinearLayout.LayoutParams(dp(48), dp(44)));
        return root;
    }

    private void hidePanel() {
        if (panel != null && panelOpen) {
            try {
                wm.removeView(panel);
            } catch (Exception ignored) {
            }
            panelOpen = false;
        }
        if (panelInput != null && panelInput.getWindowToken() != null) {
            InputMethodManager imm = (InputMethodManager)
                getSystemService(Context.INPUT_METHOD_SERVICE);
            imm.hideSoftInputFromWindow(panelInput.getWindowToken(), 0);
        }
    }

    @Override
    public void onDestroy() {
        hidePanel();
        if (bubble != null) {
            try {
                wm.removeView(bubble);
            } catch (Exception ignored) {
            }
        }
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean("active", false).apply();
        super.onDestroy();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
