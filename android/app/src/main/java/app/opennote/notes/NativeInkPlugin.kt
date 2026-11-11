package app.opennote.notes

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.os.Build
import android.os.SystemClock
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.ink.authoring.InProgressStrokeId
import androidx.ink.authoring.InProgressStrokesFinishedListener
import androidx.ink.authoring.InProgressStrokesView
import androidx.ink.brush.Brush
import androidx.ink.brush.StockBrushes
import androidx.ink.strokes.Stroke
import androidx.ink.strokes.StrokeInput
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Native active stroke for a stylus, with Jetpack Ink 1.0.0 (the handwriting-engine report's Android path).
 *
 * A transparent overlay sits above the WebView. Only a stylus touching a writing page (a "target" the web
 * app reports) is drawn here, natively and front-buffered, so the line keeps up with the nib. Everything
 * else (fingers, hover, mouse, stylus on toolbars) falls through to the WebView untouched.
 *
 * Native palm gate: while the pen is down, hovering or just lifted, finger contacts on a page are a
 * resting hand and are swallowed; a contact bigger than a fingertip is always a palm; Android's own
 * palm signal (FLAG_CANCELED) cancels the line.
 *
 * When the pen lifts, the finished points go to the web app ("stroke" event), which saves them through
 * its normal ink engine (undo, layers, sync). The native line stays on screen until the web page says it
 * has drawn the saved one ("release"), so there is no flicker.
 */
@CapacitorPlugin(name = "NativeInk")
class NativeInkPlugin : Plugin() {
    private var overlay: InkOverlay? = null

    override fun load() {
        activity.runOnUiThread {
            val web = bridge.webView
            val parent = web.parent as? ViewGroup ?: return@runOnUiThread
            val o = InkOverlay(context, this, web)
            parent.addView(o, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
            overlay = o
        }
    }

    /** { enabled, armed, color (ARGB int), family: "pen" | "marker" | "highlighter", targets: [{ id, left, top, width, height, size }] } (CSS px) */
    @PluginMethod
    fun configure(call: PluginCall) {
        val enabled = call.getBoolean("enabled", false) ?: false
        val armed = call.getBoolean("armed", false) ?: false
        val color = call.getInt("color", Color.BLACK) ?: Color.BLACK
        val family = call.getString("family", "pen") ?: "pen"
        val list = mutableListOf<Target>()
        val arr = call.getArray("targets") ?: JSArray()
        for (i in 0 until arr.length()) {
            val t = arr.getJSONObject(i)
            list.add(Target(t.getString("id"), t.getDouble("left").toFloat(), t.getDouble("top").toFloat(),
                t.getDouble("width").toFloat(), t.getDouble("height").toFloat(), t.optDouble("size", 4.0).toFloat()))
        }
        activity.runOnUiThread { overlay?.configure(enabled, armed, color, family, list) }
        call.resolve()
    }

    /** { keys: [int] }: the web page has drawn these strokes itself, so remove the native copies. */
    @PluginMethod
    fun release(call: PluginCall) {
        val arr = call.getArray("keys") ?: JSArray()
        val keys = (0 until arr.length()).map { arr.getInt(it) }
        activity.runOnUiThread { overlay?.release(keys) }
        call.resolve()
    }

    fun emit(event: String, data: JSObject) = notifyListeners(event, data)
}

data class Target(val id: String, val left: Float, val top: Float, val width: Float, val height: Float, val size: Float) {
    fun contains(x: Float, y: Float) = x >= left && y >= top && x <= left + width && y <= top + height
}

@SuppressLint("ViewConstructor")
class InkOverlay(context: Context, private val plugin: NativeInkPlugin, private val web: View) : FrameLayout(context) {
    private val ink = InProgressStrokesView(context)
    private var enabled = false
    private var armed = false
    private var color = Color.BLACK
    private var family = "pen"
    private var targets: List<Target> = emptyList()

    private var strokeId: InProgressStrokeId? = null
    private var strokePointer = -1
    private var strokeTarget: Target? = null
    private var swallowing = false
    private var penDown = false
    private var lastPenUp = 0L
    private var lastHover = 0L
    private var nextKey = 1
    private val pending = HashMap<Int, InProgressStrokeId>()
    private val targetOf = HashMap<InProgressStrokeId, String>()

    private val density get() = resources.displayMetrics.density

    init {
        isClickable = false
        isFocusable = false
        addView(ink, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
        ink.addFinishedStrokesListener(object : InProgressStrokesFinishedListener {
            override fun onStrokesFinished(strokes: Map<InProgressStrokeId, Stroke>) = handOff(strokes)
        })
    }

    fun configure(enabled: Boolean, armed: Boolean, color: Int, family: String, targets: List<Target>) {
        this.enabled = enabled; this.armed = armed; this.color = color; this.family = family; this.targets = targets
    }

    fun release(keys: List<Int>) {
        val ids = keys.mapNotNull { pending.remove(it) }.toSet()
        if (ids.isNotEmpty()) ink.removeFinishedStrokes(ids)
    }

    /** Overlay px → WebView CSS px (the WebView may not start at the overlay's corner). */
    private fun toCss(x: Float, y: Float): Pair<Float, Float> {
        val o = IntArray(2); val w = IntArray(2)
        getLocationOnScreen(o); web.getLocationOnScreen(w)
        return Pair((x + o[0] - w[0]) / density, (y + o[1] - w[1]) / density)
    }

    private fun targetAt(e: MotionEvent, i: Int): Target? {
        val (cx, cy) = toCss(e.getX(i), e.getY(i))
        return targets.firstOrNull { it.contains(cx, cy) }
    }

    private fun penNear(now: Long) = penDown || now - lastPenUp < PEN_GRACE_MS || now - lastHover < HOVER_GRACE_MS

    private fun brush(t: Target): Brush {
        val fam = when (family) {
            "marker" -> StockBrushes.marker()
            "highlighter" -> StockBrushes.highlighter()
            else -> StockBrushes.pressurePen()
        }
        val c = if (family == "highlighter") Color.argb(90, Color.red(color), Color.green(color), Color.blue(color)) else color
        return Brush.createWithColorIntArgb(fam, c, maxOf(1f, t.size * density), 0.1f)
    }

    override fun dispatchGenericMotionEvent(e: MotionEvent): Boolean {
        // stylus hover: remember it for the palm gate, but let the web page see it too (hover ring)
        if (e.getToolType(0) == MotionEvent.TOOL_TYPE_STYLUS && e.actionMasked == MotionEvent.ACTION_HOVER_MOVE) lastHover = SystemClock.uptimeMillis()
        return false
    }

    override fun dispatchTouchEvent(e: MotionEvent): Boolean {
        if (!enabled) return false
        val now = SystemClock.uptimeMillis()
        val i = e.actionIndex
        if (e.actionMasked == MotionEvent.ACTION_DOWN) {
            val tool = e.getToolType(i)
            if (tool == MotionEvent.TOOL_TYPE_STYLUS && armed && (e.buttonState and MotionEvent.BUTTON_STYLUS_PRIMARY) == 0) {
                val t = targetAt(e, i) ?: return false
                strokeTarget = t
                strokePointer = e.getPointerId(i)
                strokeId = ink.startStroke(e, strokePointer, brush(t))
                penDown = true
                plugin.emit("pen", JSObject().put("state", "down"))
                return true
            }
            // native palm gate: a finger or palm on a page while the pen is near, or anything palm-sized
            val palmSized = e.getTouchMajor(i) / density > PALM_CSS_PX
            if (tool != MotionEvent.TOOL_TYPE_STYLUS && (penNear(now) || palmSized) && targetAt(e, i) != null) {
                swallowing = true
                return true
            }
            return false
        }
        val id = strokeId
        if (id != null) {
            when (e.actionMasked) {
                MotionEvent.ACTION_MOVE -> ink.addToStroke(e, strokePointer, id, null)
                MotionEvent.ACTION_UP -> endStroke(e, id, cancelled = isCancelled(e))
                MotionEvent.ACTION_POINTER_UP -> if (e.getPointerId(i) == strokePointer) endStroke(e, id, cancelled = isCancelled(e))
                MotionEvent.ACTION_CANCEL -> endStroke(e, id, cancelled = true)
            }
            return true // other fingers in the same gesture are the resting hand
        }
        if (swallowing) {
            if (e.actionMasked == MotionEvent.ACTION_UP || e.actionMasked == MotionEvent.ACTION_CANCEL) swallowing = false
            return true
        }
        return false
    }

    /** Android 13+ marks a pointer it decided was a palm: never keep that line. */
    private fun isCancelled(e: MotionEvent) =
        Build.VERSION.SDK_INT >= 33 && (e.flags and MotionEvent.FLAG_CANCELED) != 0

    private fun endStroke(e: MotionEvent, id: InProgressStrokeId, cancelled: Boolean) {
        if (cancelled) ink.cancelStroke(id, e)
        else {
            strokeTarget?.let { targetOf[id] = it.id }
            ink.finishStroke(e, strokePointer, id)
        }
        strokeId = null
        strokeTarget = null
        strokePointer = -1
        penDown = false
        lastPenUp = SystemClock.uptimeMillis()
        plugin.emit("pen", JSObject().put("state", "up"))
    }

    /** Finished strokes → the web app, in WebView CSS px, as [x, y, pressure, ms, ...]. */
    private fun handOff(strokes: Map<InProgressStrokeId, Stroke>) {
        val scratch = StrokeInput()
        for ((id, stroke) in strokes) {
            val target = targetOf.remove(id) ?: continue
            val inputs = stroke.inputs
            val pts = JSArray()
            for (k in 0 until inputs.size) {
                inputs.populate(k, scratch)
                val (cx, cy) = toCss(scratch.x, scratch.y)
                val p = scratch.pressure
                pts.put(cx.toDouble()); pts.put(cy.toDouble())
                pts.put(if (p.isNaN() || p < 0f) 0.5 else p.toDouble().coerceIn(0.0, 1.0))
                pts.put(scratch.elapsedTimeMillis.toDouble())
            }
            val key = nextKey++
            pending[key] = id
            plugin.emit("stroke", JSObject().put("key", key).put("target", target).put("points", pts))
            // safety net: if the page never answers, don't leave a native line behind
            postDelayed({ release(listOf(key)) }, 4000)
        }
    }

    companion object {
        // Inklus' device-tuned values (also used by the web palm gate)
        const val PEN_GRACE_MS = 400L
        const val HOVER_GRACE_MS = 350L
        const val PALM_CSS_PX = 56f
    }
}
