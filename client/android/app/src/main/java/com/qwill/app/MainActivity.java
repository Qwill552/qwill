package com.qwill.app;

import android.app.DownloadManager;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.URLUtil;
import android.webkit.WebView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.BackEventCompat;
import androidx.activity.OnBackPressedCallback;
import androidx.annotation.NonNull;

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
        registerPlugin(AppInfoPlugin.class);
        registerPlugin(ApkUpdatePlugin.class);
        registerPlugin(FileDownloadPlugin.class);
        registerPlugin(KeyboardInsetsPlugin.class);
        registerPlugin(BackGesturePlugin.class);
        registerPlugin(DeepLinkPlugin.class);
        super.onCreate(savedInstanceState);

        current = new WeakReference<>(this);
        consumeCallIntent(getIntent());
        consumeLinkIntent(getIntent());
        acceptDownloads();

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackStarted(@NonNull BackEventCompat event) {
                BackGestureRegistry.INSTANCE.release();
                BackGestureRegistry.INSTANCE.publish("start", event);
            }

            @Override
            public void handleOnBackProgressed(@NonNull BackEventCompat event) {
                BackGestureRegistry.INSTANCE.publish("progress", event);
            }

            @Override
            public void handleOnBackCancelled() {
                BackGestureRegistry.INSTANCE.release();
                BackGestureRegistry.INSTANCE.publish("cancel");
            }

            @Override
            public void handleOnBackPressed() {
                BackGestureRegistry.INSTANCE.publish("invoke");
                if (BackGestureRegistry.INSTANCE.release()) {
                    return;
                }
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
    public void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        consumeCallIntent(intent);
        consumeLinkIntent(intent);
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

    private void acceptDownloads() {
        Bridge bridge = getBridge();
        WebView webView = bridge == null ? null : bridge.getWebView();
        if (webView == null) {
            return;
        }
        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) ->
            enqueueDownload(url, userAgent, contentDisposition, mimeType));
    }

    private void enqueueDownload(String url, String userAgent, String contentDisposition, String mimeType) {
        DownloadManager manager = getSystemService(DownloadManager.class);
        if (manager == null) {
            return;
        }

        String fileName = downloadFileName(url, contentDisposition, mimeType);
        DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
        request.setTitle(fileName);
        request.setMimeType(mimeType);
        request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
        if (userAgent != null) {
            request.addRequestHeader("User-Agent", userAgent);
        }
        String cookie = CookieManager.getInstance().getCookie(url);
        if (cookie != null) {
            request.addRequestHeader("Cookie", cookie);
        }

        try {
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);
        } catch (IllegalStateException unavailable) {
            request.setDestinationInExternalFilesDir(this, Environment.DIRECTORY_DOWNLOADS, fileName);
        }

        try {
            manager.enqueue(request);
            Toast.makeText(this, getString(R.string.download_started, fileName), Toast.LENGTH_SHORT).show();
        } catch (RuntimeException error) {
            Toast.makeText(this, R.string.download_failed, Toast.LENGTH_SHORT).show();
        }
    }

    private String downloadFileName(String url, String contentDisposition, String mimeType) {
        String named = null;
        try {
            named = Uri.parse(url).getQueryParameter("name");
        } catch (UnsupportedOperationException opaque) {
            named = null;
        }
        if (named == null || named.trim().isEmpty()) {
            return URLUtil.guessFileName(url, contentDisposition, mimeType);
        }
        return named.trim().replaceAll("[\\\\/:*?\"<>|\\u0000-\\u001f]", "_");
    }

    private void consumeLinkIntent(Intent intent) {
        if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction())) {
            return;
        }
        Uri data = intent.getData();
        String path = data == null ? null : data.getPath();
        if (path == null || path.isEmpty()) {
            return;
        }
        intent.setData(null);

        String query = data.getQuery();
        DeepLinkRegistry.INSTANCE.publish(query == null || query.isEmpty() ? path : path + "?" + query);
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
