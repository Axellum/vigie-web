package fr.auxfilsdesidees.vigie.widget

import android.content.Context
import android.graphics.Bitmap
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Canvas
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.graphics.drawscope.CanvasDrawScope
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection
import fr.auxfilsdesidees.vigie.ui.Sky
import fr.auxfilsdesidees.vigie.ui.theme.VigieColors
import fr.auxfilsdesidees.vigie.ui.weatherIcon
import fr.auxfilsdesidees.vigie.ui.windArrow
import kotlin.math.roundToInt

/**
 * The pictures of a widget that a home screen cannot draw itself: the weather icons and the wind arrow, drawn by the
 * app's own drawing code (the same shapes as the Accueil and the frise) into small bitmaps at the screen's density.
 */
object WidgetArt {
  fun sky(context: Context, sky: Sky, sizeDp: Float): Bitmap = draw(context, sizeDp, sizeDp) { weatherIcon(sky, size.width / 2, size.height / 2, size.width) }

  /** The arrow points where the wind goes, as on the site's widget and the Tab5. */
  fun arrow(context: Context, fromDeg: Double, sizeDp: Float): Bitmap =
    draw(context, sizeDp, sizeDp) { windArrow(size.width / 2, size.height / 2, size.width * 0.9f, fromDeg, VigieColors.Wind) }

  private fun draw(context: Context, widthDp: Float, heightDp: Float, block: DrawScope.() -> Unit): Bitmap {
    val density = context.resources.displayMetrics.density
    val w = (widthDp * density).roundToInt().coerceAtLeast(1)
    val h = (heightDp * density).roundToInt().coerceAtLeast(1)
    val image = ImageBitmap(w, h)
    CanvasDrawScope().draw(Density(density), LayoutDirection.Ltr, Canvas(image), Size(w.toFloat(), h.toFloat())) { block() }
    return image.asAndroidBitmap()
  }
}
