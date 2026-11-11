package app.opennote.notes

import android.content.Intent
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * "Share → OpenNote" from any app (a browser, YouTube, a chat): hands the shared text or link to the web app, which
 * asks which notebook to clip it into (src/clip/SharedClipHost.tsx).
 *
 * Cold start: the share that opened the app waits in `pending` until the web app asks (getPending).
 * Already running (singleTask): the new share is sent as a "shared" event, kept until a listener takes it.
 */
@CapacitorPlugin(name = "ShareIntent")
class ShareIntentPlugin : Plugin() {
    private var pending: JSObject? = null

    override fun load() {
        pending = take(activity?.intent)
    }

    override fun handleOnNewIntent(intent: Intent) {
        super.handleOnNewIntent(intent)
        val shared = take(intent) ?: return
        pending = null
        notifyListeners("shared", shared, true)
    }

    @PluginMethod
    fun getPending(call: PluginCall) {
        val p = pending ?: JSObject()
        pending = null
        call.resolve(p)
    }

    /** Reads a text share and clears it from the intent, so turning the screen does not share it twice. */
    private fun take(intent: Intent?): JSObject? {
        if (intent?.action != Intent.ACTION_SEND) return null
        val text = intent.getStringExtra(Intent.EXTRA_TEXT)?.trim().orEmpty()
        if (text.isEmpty()) return null
        val subject = intent.getStringExtra(Intent.EXTRA_SUBJECT).orEmpty()
        intent.removeExtra(Intent.EXTRA_TEXT)
        intent.action = Intent.ACTION_MAIN
        return JSObject().put("text", text).put("subject", subject)
    }
}
