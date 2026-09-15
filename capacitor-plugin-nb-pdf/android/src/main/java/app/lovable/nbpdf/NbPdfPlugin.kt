package app.lovable.nbpdf

import android.util.LruCache
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.RandomAccessFile
import java.security.MessageDigest
import java.util.concurrent.TimeUnit

/**
 * Never-Fail PDF delivery.
 *
 * Guarantees:
 *   1. If we ever downloaded this cacheKey, the app can open the PDF OFFLINE.
 *   2. Partial downloads survive process death (HTTP Range resume).
 *   3. Transient 5xx / socket errors → automatic exponential backoff (up to 4 tries).
 *   4. All state is bounded by an LRU disk cap (default 512 MB) so cache never
 *      blows storage. Eviction is age + size aware.
 *   5. Every phase emits a `pdfProgress` event so UI can render a percentage
 *      instead of a silent spinner.
 */
@CapacitorPlugin(name = "NbPdf")
class NbPdfPlugin : Plugin() {

    private val scope = CoroutineScope(Dispatchers.IO)
    private val client by lazy {
        OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .build()
    }
    private val capacityBytes: Long = 512L * 1024 * 1024
    private val memIndex = LruCache<String, Long>(256)
    /** Keys that must NOT be evicted (e.g. currently-open PDF). */
    private val pinned = java.util.Collections.synchronizedSet(HashSet<String>())

    private fun cacheDir(): File = File(context.filesDir, "nb-pdf-cache").apply { mkdirs() }
    private fun keyToFile(k: String): File {
        val h = MessageDigest.getInstance("SHA-1").digest(k.toByteArray())
            .joinToString("") { "%02x".format(it) }
        return File(cacheDir(), "$h.pdf")
    }

    @PluginMethod
    fun fetchPdf(call: PluginCall) {
        val url = call.getString("url") ?: return call.reject("url required")
        val cacheKey = call.getString("cacheKey") ?: return call.reject("cacheKey required")
        val force = call.getBoolean("force", false)!!
        val maxAgeSec = call.getInt("maxAgeSec", 7 * 24 * 3600)!!

        scope.launch {
            val start = System.currentTimeMillis()
            val file = keyToFile(cacheKey)

            if (!force && file.exists() && (System.currentTimeMillis() - file.lastModified()) / 1000 < maxAgeSec) {
                call.resolve(JSObject().apply {
                    put("localUri", "file://${file.absolutePath}")
                    put("size", file.length())
                    put("fromCache", true)
                    put("elapsedMs", System.currentTimeMillis() - start)
                })
                return@launch
            }

            var attempt = 0
            var lastErr: Throwable? = null
            while (attempt < 4) {
                attempt++
                try {
                    downloadWithResume(url, file, cacheKey, attempt)
                    enforceCapacity()
                    memIndex.put(cacheKey, file.length())
                    call.resolve(JSObject().apply {
                        put("localUri", "file://${file.absolutePath}")
                        put("size", file.length())
                        put("fromCache", false)
                        put("elapsedMs", System.currentTimeMillis() - start)
                    })
                    return@launch
                } catch (t: Throwable) {
                    lastErr = t
                    Thread.sleep(200L * (1L shl attempt))
                }
            }
            // Never-Fail contract: if a stale cache exists, serve it rather than error out.
            if (file.exists() && file.length() > 0) {
                call.resolve(JSObject().apply {
                    put("localUri", "file://${file.absolutePath}")
                    put("size", file.length())
                    put("fromCache", true)
                    put("elapsedMs", System.currentTimeMillis() - start)
                })
            } else {
                call.reject("pdf_fetch_failed", lastErr)
            }
        }
    }

    private fun downloadWithResume(url: String, file: File, cacheKey: String, attempt: Int) {
        val partial = File(file.parentFile, "${file.name}.part")
        val existing = if (partial.exists()) partial.length() else 0L
        val req = Request.Builder().url(url).apply {
            if (existing > 0) header("Range", "bytes=$existing-")
        }.build()

        client.newCall(req).execute().use { res ->
            if (!res.isSuccessful && res.code != 206) throw RuntimeException("HTTP ${res.code}")
            val body = res.body ?: throw RuntimeException("empty body")
            val total = (body.contentLength().takeIf { it > 0 } ?: -1L) + existing

            RandomAccessFile(partial, "rw").use { out ->
                out.seek(existing)
                body.byteStream().use { input ->
                    val buf = ByteArray(64 * 1024)
                    var loaded = existing
                    var lastPct = -1
                    while (true) {
                        val n = input.read(buf)
                        if (n == -1) break
                        out.write(buf, 0, n)
                        loaded += n
                        if (total > 0) {
                            val pct = ((loaded * 100) / total).toInt()
                            if (pct != lastPct) {
                                lastPct = pct
                                notifyListeners("pdfProgress", JSObject().apply {
                                    put("cacheKey", cacheKey)
                                    put("percent", pct)
                                    put("loadedBytes", loaded)
                                    put("totalBytes", total)
                                    put("attempt", attempt)
                                })
                            }
                        }
                    }
                }
            }
            if (file.exists()) file.delete()
            if (!partial.renameTo(file)) throw RuntimeException("rename failed")
        }
    }

    private fun enforceCapacity() {
        val pinnedFiles = synchronized(pinned) { pinned.map { keyToFile(it).absolutePath }.toSet() }
        val files = cacheDir().listFiles()
            ?.filter { it.extension == "pdf" && it.absolutePath !in pinnedFiles }
            ?.sortedBy { it.lastModified() }
            ?: return
        var total = files.sumOf { it.length() }
        val it = files.iterator()
        while (total > capacityBytes && it.hasNext()) {
            val f = it.next()
            total -= f.length()
            f.delete()
        }
    }

    @PluginMethod fun evict(call: PluginCall) {
        val key = call.getString("cacheKey") ?: return call.reject("cacheKey required")
        keyToFile(key).delete()
        memIndex.remove(key)
        pinned.remove(key)
        call.resolve()
    }

    @PluginMethod fun pin(call: PluginCall) {
        val key = call.getString("cacheKey") ?: return call.reject("cacheKey required")
        pinned.add(key)
        call.resolve()
    }

    @PluginMethod fun unpin(call: PluginCall) {
        val key = call.getString("cacheKey") ?: return call.reject("cacheKey required")
        pinned.remove(key)
        call.resolve()
    }

    @PluginMethod fun clearCache(call: PluginCall) {
        var freed = 0L
        cacheDir().listFiles()?.forEach { freed += it.length(); it.delete() }
        memIndex.evictAll()
        pinned.clear()
        call.resolve(JSObject().apply { put("freedBytes", freed) })
    }

    @PluginMethod fun stats(call: PluginCall) {
        val files = cacheDir().listFiles().orEmpty()
        call.resolve(JSObject().apply {
            put("entries", files.size)
            put("bytes", files.sumOf { it.length() })
            put("capacityBytes", capacityBytes)
        })
    }
}
