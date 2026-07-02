package com.aplusscore.android.video

import android.content.ContentValues
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream

class VideoStorageModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "VideoStorageModule"

  @ReactMethod
  fun exportVideoToPublicMovies(
    sourcePath: String,
    relativePath: String,
    displayName: String,
    promise: Promise,
  ) {
    try {
      val sourceFile = File(sourcePath)
      if (!sourceFile.exists() || sourceFile.length() <= 0L) {
        promise.reject("VIDEO_STORAGE_SOURCE_MISSING", "source file missing or empty: $sourcePath")
        return
      }

      val safeRelativePath = relativePath
        .trim()
        .trim('/')
        .replace("..", "_")
        .ifBlank { "Aplus Score/History" }
      val safeDisplayName = displayName
        .trim()
        .replace(Regex("[^a-zA-Z0-9._-]"), "_")
        .ifBlank { "full_match.mp4" }

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        exportWithMediaStore(sourceFile, safeRelativePath, safeDisplayName, promise)
      } else {
        exportWithPublicFile(sourceFile, safeRelativePath, safeDisplayName, promise)
      }
    } catch (error: Throwable) {
      promise.reject("VIDEO_STORAGE_EXPORT_FAILED", error)
    }
  }

  private fun exportWithMediaStore(
    sourceFile: File,
    relativePath: String,
    displayName: String,
    promise: Promise,
  ) {
    val resolver = reactContext.contentResolver
    val collection = MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
    val relativeMoviesPath = "${Environment.DIRECTORY_MOVIES}/$relativePath"

    val values = ContentValues().apply {
      put(MediaStore.Video.Media.DISPLAY_NAME, displayName)
      put(MediaStore.Video.Media.MIME_TYPE, "video/mp4")
      put(MediaStore.Video.Media.RELATIVE_PATH, relativeMoviesPath)
      put(MediaStore.Video.Media.IS_PENDING, 1)
      put(MediaStore.Video.Media.SIZE, sourceFile.length())
    }

    val uri = resolver.insert(collection, values)
      ?: throw IllegalStateException("MediaStore insert returned null")

    try {
      resolver.openOutputStream(uri, "w")?.use { output ->
        FileInputStream(sourceFile).use { input ->
          input.copyTo(output, bufferSize = 1024 * 1024)
        }
      } ?: throw IllegalStateException("Cannot open MediaStore output stream")

      val doneValues = ContentValues().apply {
        put(MediaStore.Video.Media.IS_PENDING, 0)
        put(MediaStore.Video.Media.SIZE, sourceFile.length())
      }
      resolver.update(uri, doneValues, null, null)

      val result = Arguments.createMap().apply {
        putBoolean("success", true)
        putString("uri", uri.toString())
        putString("relativePath", relativeMoviesPath)
        putString("displayName", displayName)
        putDouble("size", sourceFile.length().toDouble())
      }
      promise.resolve(result)
    } catch (error: Throwable) {
      try {
        resolver.delete(uri, null, null)
      } catch (_: Throwable) {}
      throw error
    }
  }

  private fun exportWithPublicFile(
    sourceFile: File,
    relativePath: String,
    displayName: String,
    promise: Promise,
  ) {
    val moviesRoot = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MOVIES)
    val targetDir = File(moviesRoot, relativePath)
    if (!targetDir.exists()) {
      targetDir.mkdirs()
    }
    val targetFile = File(targetDir, displayName)
    if (targetFile.exists()) {
      targetFile.delete()
    }

    FileInputStream(sourceFile).use { input ->
      FileOutputStream(targetFile).use { output ->
        input.copyTo(output, bufferSize = 1024 * 1024)
      }
    }

    MediaScannerConnection.scanFile(
      reactContext,
      arrayOf(targetFile.absolutePath),
      arrayOf("video/mp4"),
      null,
    )

    val result = Arguments.createMap().apply {
      putBoolean("success", true)
      putString("path", targetFile.absolutePath)
      putString("relativePath", "${Environment.DIRECTORY_MOVIES}/$relativePath")
      putString("displayName", displayName)
      putDouble("size", targetFile.length().toDouble())
    }
    promise.resolve(result)
  }
}
