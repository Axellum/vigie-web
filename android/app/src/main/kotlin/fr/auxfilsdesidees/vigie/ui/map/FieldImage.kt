package fr.auxfilsdesidees.vigie.ui.map

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ColorSpace
import android.os.Build
import fr.auxfilsdesidees.vigie.data.FieldLevel

/** The pixels of an image of the forecast wind, as they are in the file: numbers, not colours (no premultiplying, no colour management). */
object FieldImage {
  fun pixels(bytes: ByteArray, level: FieldLevel): IntArray {
    val options =
      BitmapFactory.Options().apply {
        inPreferredConfig = Bitmap.Config.ARGB_8888
        inPremultiplied = false
        inScaled = false
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) inPreferredColorSpace = ColorSpace.get(ColorSpace.Named.SRGB)
      }
    val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options) ?: error("the image of ${level.id.id} is not a PNG")
    try {
      require(bitmap.width == level.width && bitmap.height == level.height) { "the image of ${level.id.id} is not ${level.width} x ${level.height}" }
      val out = IntArray(bitmap.width * bitmap.height)
      bitmap.getPixels(out, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height)
      return out
    } finally {
      bitmap.recycle()
    }
  }
}
