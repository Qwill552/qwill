package com.qwill.app;

import android.content.Intent;
import android.os.Bundle;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CallPlugin.class);
        super.onCreate(savedInstanceState);

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

    private void consumeCallIntent(Intent intent) {
        if (intent == null) {
            return;
        }
        String callId = intent.getStringExtra(NativeCalls.EXTRA_CALL_ID);
        if (callId == null || callId.isEmpty()) {
            return;
        }
        boolean accepted = intent.getBooleanExtra(NativeCalls.EXTRA_ACCEPTED, false);
        intent.removeExtra(NativeCalls.EXTRA_CALL_ID);

        CallRegistry.INSTANCE.publish(new CallRegistry.Action(callId, accepted));

        if (!accepted) {
            moveTaskToBack(true);
        }
    }
}
