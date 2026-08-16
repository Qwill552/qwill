package com.qwill.app;

import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.widget.TextView;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

import java.lang.ref.WeakReference;

public class MainActivity extends BridgeActivity {

    private static final long CONNECTING_TIMEOUT_MS = 45_000L;

    private static WeakReference<MainActivity> current;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable connectingTimeout = this::removeConnectingOverlay;

    private View connectingOverlay;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CallPlugin.class);
        super.onCreate(savedInstanceState);

        current = new WeakReference<>(this);
        consumeCallIntent(getIntent());

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                Bridge bridge = getBridge();
                WebView webView = bridge == null ? null : bridge.getWebView();
                if (webView != null && webView.canGoBack()) {
                    webView.goBack();
                    return;
                }
                setEnabled(false);
                getOnBackPressedDispatcher().onBackPressed();
            }
        });
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        consumeCallIntent(intent);
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        handler.removeCallbacks(connectingTimeout);
        if (current != null && current.get() == this) {
            current = null;
        }
    }

    static void hideConnecting() {
        MainActivity activity = current == null ? null : current.get();
        if (activity == null) {
            return;
        }
        activity.runOnUiThread(activity::removeConnectingOverlay);
    }

    private void consumeCallIntent(Intent intent) {
        if (intent == null) {
            return;
        }
        String callId = intent.getStringExtra(NativeCalls.EXTRA_CALL_ID);
        if (callId == null || callId.isEmpty()) {
            return;
        }
        boolean accepted = intent.getBooleanExtra(NativeCalls.EXTRA_ACCEPTED, false);
        String callerName = intent.getStringExtra(NativeCalls.EXTRA_CALLER_NAME);
        intent.removeExtra(NativeCalls.EXTRA_CALL_ID);

        CallRegistry.INSTANCE.publish(new CallRegistry.Action(callId, accepted));

        if (accepted) {
            showConnectingOverlay(callerName);
        }
    }

    /** Оболочка грузит интерфейс с прода, и до первого кадра веб-экрана проходят секунды —
     *  без этого поверх WebView человек смотрел бы на загрузку списка чатов, уже ответив на звонок. */
    private void showConnectingOverlay(String callerName) {
        if (connectingOverlay != null) {
            return;
        }
        connectingOverlay = getLayoutInflater().inflate(R.layout.view_call_connecting, null);

        String name = callerName == null || callerName.trim().isEmpty()
            ? getString(R.string.call_unknown_caller)
            : callerName;
        ((TextView) connectingOverlay.findViewById(R.id.call_connecting_name)).setText(name);
        ((LetterAvatarView) connectingOverlay.findViewById(R.id.call_connecting_avatar))
            .setLetter(name.substring(0, 1).toUpperCase());

        addContentView(
            connectingOverlay,
            new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        );
        handler.postDelayed(connectingTimeout, CONNECTING_TIMEOUT_MS);
    }

    private void removeConnectingOverlay() {
        handler.removeCallbacks(connectingTimeout);
        if (connectingOverlay == null) {
            return;
        }
        ViewGroup parent = (ViewGroup) connectingOverlay.getParent();
        if (parent != null) {
            parent.removeView(connectingOverlay);
        }
        connectingOverlay = null;
    }
}
