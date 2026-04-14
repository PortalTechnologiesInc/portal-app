package cc.getportal.mrz

/**
 * Stabilises recognised strings over multiple frames.
 */
class StringTracker {
    private var frameIndex: Long = 0
    private val seenStrings = mutableMapOf<String, Pair<Long, Long>>()  // lastSeen, count
    private var bestCount: Long = 0
    private var bestString: String = ""

    fun logFrame(strings: List<String>) {
        for (s in strings) {
            val obs = seenStrings[s]
            if (obs == null) {
                seenStrings[s] = Pair(frameIndex, 0L)
            } else {
                seenStrings[s] = Pair(frameIndex, obs.second + 1)
            }
        }

        val obsolete = mutableListOf<String>()
        for ((key, obs) in seenStrings) {
            if (obs.first < frameIndex - 30) {
                obsolete.add(key)
            }
            if (!obsolete.contains(key) && obs.second > bestCount) {
                bestCount = obs.second
                bestString = key
            }
        }

        for (key in obsolete) {
            seenStrings.remove(key)
        }
        frameIndex++
    }

    fun getStableString(): String? {
        return if (bestCount >= 5) bestString else null
    }

    fun reset(string: String) {
        seenStrings.remove(string)
        bestCount = 0
        bestString = ""
    }
}
