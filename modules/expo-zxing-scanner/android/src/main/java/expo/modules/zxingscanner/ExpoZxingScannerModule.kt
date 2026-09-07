package expo.modules.zxingscanner

import android.graphics.BitmapFactory
import android.net.Uri
import com.google.zxing.BarcodeFormat
import com.google.zxing.BinaryBitmap
import com.google.zxing.DecodeHintType
import com.google.zxing.MultiFormatReader
import com.google.zxing.RGBLuminanceSource
import com.google.zxing.ReaderException
import com.google.zxing.common.HybridBinarizer
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.FileInputStream
import java.io.InputStream

class ExpoZxingScannerModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoZxingScanner")

    AsyncFunction("scanImageAsync") { uri: String ->
      decodeImage(uri)
    }
  }

  private fun decodeImage(uriString: String): String? {
    val bitmap = openImageStream(uriString)?.use(BitmapFactory::decodeStream) ?: return null
    val reader = MultiFormatReader().apply {
      setHints(
        mapOf(
          DecodeHintType.POSSIBLE_FORMATS to listOf(BarcodeFormat.EAN_13),
          DecodeHintType.TRY_HARDER to true,
        )
      )
    }

    return try {
      val width = bitmap.width
      val height = bitmap.height
      val pixels = IntArray(width * height)
      bitmap.getPixels(pixels, 0, width, 0, 0, width, height)
      val source = RGBLuminanceSource(width, height, pixels)
      val binaryBitmap = BinaryBitmap(HybridBinarizer(source))
      reader.decodeWithState(binaryBitmap).text
    } catch (_: ReaderException) {
      null
    } finally {
      reader.reset()
      bitmap.recycle()
    }
  }

  private fun openImageStream(uriString: String): InputStream? {
    val context = appContext.reactContext
      ?: throw IllegalStateException("React context is unavailable")
    val uri = Uri.parse(uriString)

    return when (uri.scheme) {
      "content" -> context.contentResolver.openInputStream(uri)
      "file" -> uri.path?.let(::FileInputStream)
      null -> FileInputStream(uriString)
      else -> context.contentResolver.openInputStream(uri)
    }
  }
}
