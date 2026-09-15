import Capacitor
import Foundation

@objc(NbPdfPlugin)
public class NbPdfPlugin: CAPPlugin {

    private lazy var cacheDir: URL = {
        let base = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("nb-pdf-cache", isDirectory: true)
        try? FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        return base
    }()
    private let capacityBytes: Int64 = 512 * 1024 * 1024
    /** Keys pinned against LRU eviction (e.g. currently on-screen). */
    private var pinned = Set<String>()
    private let pinnedLock = NSLock()

    private func fileFor(_ key: String) -> URL {
        let hash = key.data(using: .utf8)!.base64EncodedString()
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "+", with: "-")
        return cacheDir.appendingPathComponent("\(hash).pdf")
    }

    @objc func fetchPdf(_ call: CAPPluginCall) {
        guard let urlStr = call.getString("url"),
              let url = URL(string: urlStr),
              let cacheKey = call.getString("cacheKey")
        else { return call.reject("url + cacheKey required") }

        let force = call.getBool("force") ?? false
        let maxAgeSec = call.getInt("maxAgeSec") ?? (7 * 24 * 3600)
        let start = Date()
        let dest = fileFor(cacheKey)

        // Cache hit
        if !force,
           FileManager.default.fileExists(atPath: dest.path),
           let attr = try? FileManager.default.attributesOfItem(atPath: dest.path),
           let mtime = attr[.modificationDate] as? Date,
           Date().timeIntervalSince(mtime) < Double(maxAgeSec) {
            call.resolve([
                "localUri": dest.absoluteString,
                "size": (attr[.size] as? Int64) ?? 0,
                "fromCache": true,
                "elapsedMs": Int(Date().timeIntervalSince(start) * 1000)
            ])
            return
        }

        // Retry loop with exponential backoff.
        downloadWithRetry(url: url, dest: dest, cacheKey: cacheKey, attempt: 1) { [weak self] result in
            switch result {
            case .success:
                self?.enforceCapacity()
                let size = (try? FileManager.default.attributesOfItem(atPath: dest.path)[.size] as? Int64) ?? 0
                call.resolve([
                    "localUri": dest.absoluteString,
                    "size": size ?? 0,
                    "fromCache": false,
                    "elapsedMs": Int(Date().timeIntervalSince(start) * 1000)
                ])
            case .failure(let err):
                // Never-Fail: stale cache fallback
                if FileManager.default.fileExists(atPath: dest.path) {
                    call.resolve([
                        "localUri": dest.absoluteString,
                        "fromCache": true,
                        "elapsedMs": Int(Date().timeIntervalSince(start) * 1000)
                    ])
                } else {
                    call.reject("pdf_fetch_failed", nil, err)
                }
            }
        }
    }

    private func downloadWithRetry(url: URL, dest: URL, cacheKey: String, attempt: Int,
                                   completion: @escaping (Result<Void, Error>) -> Void) {
        var req = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 60)
        // Resume support
        let partial = dest.appendingPathExtension("part")
        if let size = (try? FileManager.default.attributesOfItem(atPath: partial.path))?[.size] as? Int64, size > 0 {
            req.setValue("bytes=\(size)-", forHTTPHeaderField: "Range")
        }

        let task = URLSession.shared.downloadTask(with: req) { [weak self] tmp, res, err in
            guard let self = self else { return }
            if let err = err {
                if attempt < 4 {
                    let delay = Double(200 * (1 << attempt)) / 1000.0
                    DispatchQueue.global().asyncAfter(deadline: .now() + delay) {
                        self.downloadWithRetry(url: url, dest: dest, cacheKey: cacheKey,
                                               attempt: attempt + 1, completion: completion)
                    }
                    return
                }
                completion(.failure(err))
                return
            }
            guard let tmp = tmp else { completion(.failure(NSError(domain: "NbPdf", code: -1))); return }
            try? FileManager.default.removeItem(at: dest)
            do {
                try FileManager.default.moveItem(at: tmp, to: dest)
                self.notifyListeners("pdfProgress", data: [
                    "cacheKey": cacheKey, "percent": 100, "attempt": attempt
                ])
                completion(.success(()))
            } catch {
                completion(.failure(error))
            }
        }
        task.resume()
    }

    private func enforceCapacity() {
        guard let items = try? FileManager.default.contentsOfDirectory(at: cacheDir,
              includingPropertiesForKeys: [.contentModificationDateKey, .fileSizeKey]) else { return }
        pinnedLock.lock()
        let pinnedPaths = Set(pinned.map { fileFor($0).path })
        pinnedLock.unlock()
        let evictable = items.filter { !pinnedPaths.contains($0.path) }
        let sorted = evictable.sorted {
            let a = (try? $0.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
            let b = (try? $1.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
            return a < b
        }
        var total: Int64 = sorted.reduce(0) { $0 + (Int64((try? $1.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0)) }
        for f in sorted where total > capacityBytes {
            let s = Int64((try? f.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0)
            try? FileManager.default.removeItem(at: f)
            total -= s
        }
    }

    @objc func evict(_ call: CAPPluginCall) {
        guard let key = call.getString("cacheKey") else { return call.reject("cacheKey required") }
        try? FileManager.default.removeItem(at: fileFor(key))
        pinnedLock.lock(); pinned.remove(key); pinnedLock.unlock()
        call.resolve()
    }

    @objc func pin(_ call: CAPPluginCall) {
        guard let key = call.getString("cacheKey") else { return call.reject("cacheKey required") }
        pinnedLock.lock(); pinned.insert(key); pinnedLock.unlock()
        call.resolve()
    }

    @objc func unpin(_ call: CAPPluginCall) {
        guard let key = call.getString("cacheKey") else { return call.reject("cacheKey required") }
        pinnedLock.lock(); pinned.remove(key); pinnedLock.unlock()
        call.resolve()
    }

    @objc func clearCache(_ call: CAPPluginCall) {
        var freed: Int64 = 0
        if let items = try? FileManager.default.contentsOfDirectory(at: cacheDir, includingPropertiesForKeys: [.fileSizeKey]) {
            for f in items {
                freed += Int64((try? f.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0)
                try? FileManager.default.removeItem(at: f)
            }
        }
        pinnedLock.lock(); pinned.removeAll(); pinnedLock.unlock()
        call.resolve(["freedBytes": freed])
    }

    @objc func stats(_ call: CAPPluginCall) {
        let items = (try? FileManager.default.contentsOfDirectory(at: cacheDir, includingPropertiesForKeys: [.fileSizeKey])) ?? []
        let bytes = items.reduce(Int64(0)) { $0 + Int64((try? $1.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0) }
        call.resolve(["entries": items.count, "bytes": bytes, "capacityBytes": capacityBytes])
    }
}
