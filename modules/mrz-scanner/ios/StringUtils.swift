import Foundation

// ---------------------------------------------------------------------------
// MARK: - MRZ Capture State (thread-safe, instance-based — fixes #2, #4)
// ---------------------------------------------------------------------------

/// Holds mutable MRZ line captures. One instance per scan session.
/// Replaces the old file-level global `var`s that were NOT thread-safe.
class MRZCaptureState {
    private let lock = NSLock()

    private var captureFirst = ""
    private var captureSecond = ""
    private var captureThird = ""

    func reset() {
        lock.lock()
        defer { lock.unlock() }
        captureFirst = ""
        captureSecond = ""
        captureThird = ""
    }

    /// Attempt to match `candidate` against known MRZ line patterns,
    /// accumulate lines, and return a full MRZ string when all lines are captured.
    func checkMrz(_ candidate: String) -> String? {
        lock.lock()
        defer { lock.unlock() }

        let clean = candidate
            .uppercased()
            .replacingOccurrences(of: " ", with: "<")
            .filter { "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<".contains($0) }

        // --- Regex patterns ---

        let tdOneFirstRegex   = "(I|C|A).[A-Z0<]{3}[A-Z0-9]{1,9}<?[0-9O]{1}[A-Z0-9<]{14,22}"
        let tdOneSecondRegex  = "[0-9O]{7}(M|F|<)[0-9O]{7}[A-Z0<]{3}[A-Z0-9<]{11}[0-9O]"
        let tdOneThirdRegex   = "([A-Z0]+<)+<([A-Z0]+<)+<+"
        let tdOneMrzRegex     = "(I|C|A).[A-Z0<]{3}[A-Z0-9]{1,9}<?[0-9O]{1}[A-Z0-9<]{14,22}\\n[0-9O]{7}(M|F|<)[0-9O]{7}[A-Z0<]{3}[A-Z0-9<]{11}[0-9O]\\n([A-Z0]+<)+<([A-Z0]+<)+<+"

        let tdThreeFirstRegex = "P.[A-Z0<]{3}([A-Z0]+<)+<([A-Z0]+<)+<+"
        let tdThreeSecondRegex = "[A-Z0-9]{1,9}<?[0-9O]{1}[A-Z0<]{3}[0-9]{7}(M|F|<)[0-9O]{7}[A-Z0-9<]+"
        let tdThreeMrzRegex   = "P.[A-Z0<]{3}([A-Z0]+<)+<([A-Z0]+<)+<+\\n[A-Z0-9]{1,9}<?[0-9O]{1}[A-Z0<]{3}[0-9]{7}(M|F|<)[0-9O]{7}[A-Z0-9<]+"

        let regexOpts: String.CompareOptions = [.regularExpression, .caseInsensitive]

        // --- Line matching ---

        let tdOneFirstLine   = clean.range(of: tdOneFirstRegex, options: regexOpts)
        let tdOneSecondLine  = clean.range(of: tdOneSecondRegex, options: regexOpts)
        let tdOneThirdLine   = clean.range(of: tdOneThirdRegex, options: regexOpts)
        let tdThreeFirstLine = clean.range(of: tdThreeFirstRegex, options: regexOpts)
        let tdThreeSecondLine = clean.range(of: tdThreeSecondRegex, options: regexOpts)

        if tdOneFirstLine != nil, clean.count >= 25 && clean.count <= 36 {
            captureFirst = clean.normalizedMRZLine(to: 30)
        }
        if tdOneSecondLine != nil, clean.count >= 25 && clean.count <= 36 {
            captureSecond = clean.normalizedMRZLine(to: 30)
        }
        if tdOneThirdLine != nil, clean.count >= 25 && clean.count <= 36 {
            captureThird = clean.normalizedMRZLine(to: 30)
        }

        if tdThreeFirstLine != nil, clean.count >= 38 && clean.count <= 50 {
            captureFirst = clean.normalizedMRZLine(to: 44)
        }
        if tdThreeSecondLine != nil, clean.count >= 38 && clean.count <= 50 {
            captureSecond = clean.normalizedMRZLine(to: 44)
        }

        // --- Assemble & validate TD-1 ---

        if captureFirst.count == 30 && captureSecond.count == 30 && captureThird.count == 30 {
            let assembled = (captureFirst.stripped + "\n" + captureSecond.stripped + "\n" + captureThird.stripped)
                .replacingOccurrences(of: " ", with: "<")
            // Fix #3: actually validate the assembled MRZ
            if assembled.range(of: tdOneMrzRegex, options: regexOpts) != nil {
                return assembled
            }
            // Full regex didn't match — reject this combination
            return nil
        }

        // --- Assemble & validate TD-3 ---

        if captureFirst.count == 44 && captureSecond.count == 44 {
            let assembled = (captureFirst.stripped + "\n" + captureSecond.stripped)
                .replacingOccurrences(of: " ", with: "<")
            // Fix #3: actually validate the assembled MRZ
            if assembled.range(of: tdThreeMrzRegex, options: regexOpts) != nil {
                return assembled
            }
            return nil
        }

        return nil
    }
}

// ---------------------------------------------------------------------------
// MARK: - String extensions
// ---------------------------------------------------------------------------

extension String {
    /// Normalize to exactly `targetLength`, padding with `<` or truncating.
    func normalizedMRZLine(to targetLength: Int) -> String {
        let s = self.stripped
        if s.count == targetLength { return s }
        if s.count < targetLength {
            return s + String(repeating: "<", count: targetLength - s.count)
        }
        return String(s.prefix(targetLength))
    }

    /// Keep only valid MRZ characters.
    /// Fix #1: corrected charset — was missing 'L' due to duplicate K, and had '1' before '0'.
    var stripped: String {
        let okayChars = Set("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<")
        return self.filter { okayChars.contains($0) }
    }
}

// ---------------------------------------------------------------------------
// MARK: - StringTracker
// ---------------------------------------------------------------------------

class StringTracker {
    var frameIndex: Int64 = 0
    typealias StringObservation = (lastSeen: Int64, count: Int64)

    var seenStrings = [String: StringObservation]()
    var bestCount = Int64(0)
    var bestString = ""

    func logFrame(strings: [String]) {
        for string in strings {
            if seenStrings[string] == nil {
                seenStrings[string] = (lastSeen: Int64(0), count: Int64(-1))
            }
            seenStrings[string]?.lastSeen = frameIndex
            seenStrings[string]?.count += 1
        }

        var obsoleteStrings = [String]()
        for (string, obs) in seenStrings {
            if obs.lastSeen < frameIndex - 30 {
                obsoleteStrings.append(string)
            }

            let count = obs.count
            if !obsoleteStrings.contains(string) && count > bestCount {
                bestCount = Int64(count)
                bestString = string
            }
        }

        for string in obsoleteStrings {
            seenStrings.removeValue(forKey: string)
        }

        frameIndex += 1
    }

    func getStableString() -> String? {
        if bestCount >= 5 {
            return bestString
        }
        return nil
    }

    func reset(string: String) {
        seenStrings.removeValue(forKey: string)
        bestCount = 0
        bestString = ""
    }
}
