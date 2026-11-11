package app.opennote.notes;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // native Jetpack Ink layer for the stylus (NativeInkPlugin.kt); does nothing until the web app turns it on
        registerPlugin(NativeInkPlugin.class);
        // "Share -> OpenNote" from other apps: links become web clips (ShareIntentPlugin.kt)
        registerPlugin(ShareIntentPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
