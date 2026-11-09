package jp.monoshiri.app;

import android.os.Bundle;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // The keyboard covers the web view without resizing or panning it, as on iOS: lib/keyboardLift.ts lifts the
        // sheet itself. System bar insets still reach the page (env(safe-area-inset-*)).
        ViewCompat.setOnApplyWindowInsetsListener(bridge.getWebView(), (v, insets) -> {
            WindowInsetsCompat withoutIme = new WindowInsetsCompat.Builder(insets)
                .setInsets(WindowInsetsCompat.Type.ime(), Insets.NONE)
                .setVisible(WindowInsetsCompat.Type.ime(), false)
                .build();
            return ViewCompat.onApplyWindowInsets(v, withoutIme);
        });
    }
}
