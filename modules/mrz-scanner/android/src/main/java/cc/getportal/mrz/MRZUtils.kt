package cc.getportal.mrz

/**
 * MRZ line matching and assembly — thread-safe via @Synchronized.
 */
object MRZUtils {
    private val ALLOWED = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<".toSet()

    // TD-1 (ID cards, 3 lines × 30 chars)
    private val TD1_LINE1 = Regex("(I|C|A).[A-Z0<]{3}[A-Z0-9]{1,9}<?[0-9O]{1}[A-Z0-9<]{14,22}", RegexOption.IGNORE_CASE)
    private val TD1_LINE2 = Regex("[0-9O]{7}(M|F|<)[0-9O]{7}[A-Z0<]{3}[A-Z0-9<]{11}[0-9O]", RegexOption.IGNORE_CASE)
    private val TD1_LINE3 = Regex("([A-Z0]+<)+<([A-Z0]+<)+<+", RegexOption.IGNORE_CASE)
    private val TD1_FULL  = Regex("(I|C|A).[A-Z0<]{3}[A-Z0-9]{1,9}<?[0-9O]{1}[A-Z0-9<]{14,22}\\n[0-9O]{7}(M|F|<)[0-9O]{7}[A-Z0<]{3}[A-Z0-9<]{11}[0-9O]\\n([A-Z0]+<)+<([A-Z0]+<)+<+", RegexOption.IGNORE_CASE)

    // TD-3 (Passports, 2 lines × 44 chars)
    private val TD3_LINE1 = Regex("P.[A-Z0<]{3}([A-Z0]+<)+<([A-Z0]+<)+<+", RegexOption.IGNORE_CASE)
    private val TD3_LINE2 = Regex("[A-Z0-9]{1,9}<?[0-9O]{1}[A-Z0<]{3}[0-9]{7}(M|F|<)[0-9O]{7}[A-Z0-9<]+", RegexOption.IGNORE_CASE)
    private val TD3_FULL  = Regex("P.[A-Z0<]{3}([A-Z0]+<)+<([A-Z0]+<)+<+\\n[A-Z0-9]{1,9}<?[0-9O]{1}[A-Z0<]{3}[0-9]{7}(M|F|<)[0-9O]{7}[A-Z0-9<]+", RegexOption.IGNORE_CASE)

    private var captureFirst = ""
    private var captureSecond = ""
    private var captureThird = ""

    private fun stripped(s: String): String = s.filter { it in ALLOWED }

    private fun normalizedMRZLine(s: String, targetLength: Int): String {
        val st = stripped(s)
        return when {
            st.length == targetLength -> st
            st.length < targetLength -> st + "<".repeat(targetLength - st.length)
            else -> st.take(targetLength)
        }
    }

    @Synchronized
    fun checkMrz(candidate: String): String? {
        val clean = candidate
            .uppercase()
            .replace(" ", "<")
            .filter { it in ALLOWED }

        // TD-1 patterns
        if (TD1_LINE1.containsMatchIn(clean) && clean.length in 25..36) {
            captureFirst = normalizedMRZLine(clean, 30)
        }
        if (TD1_LINE2.containsMatchIn(clean) && clean.length in 25..36) {
            captureSecond = normalizedMRZLine(clean, 30)
        }
        if (TD1_LINE3.containsMatchIn(clean) && clean.length in 25..36) {
            captureThird = normalizedMRZLine(clean, 30)
        }

        // TD-3 patterns
        if (TD3_LINE1.containsMatchIn(clean) && clean.length in 38..50) {
            captureFirst = normalizedMRZLine(clean, 44)
        }
        if (TD3_LINE2.containsMatchIn(clean) && clean.length in 38..50) {
            captureSecond = normalizedMRZLine(clean, 44)
        }

        // Assemble TD-1
        if (captureFirst.length == 30 && captureSecond.length == 30 && captureThird.length == 30) {
            val assembled = "${stripped(captureFirst)}\n${stripped(captureSecond)}\n${stripped(captureThird)}"
                .replace(" ", "<")
            // Validate full MRZ against pattern (fix: don't return unvalidated)
            return if (TD1_FULL.containsMatchIn(assembled)) assembled else null
        }

        // Assemble TD-3
        if (captureFirst.length == 44 && captureSecond.length == 44) {
            val assembled = "${stripped(captureFirst)}\n${stripped(captureSecond)}"
                .replace(" ", "<")
            return if (TD3_FULL.containsMatchIn(assembled)) assembled else null
        }

        return null
    }

    @Synchronized
    fun resetCaptures() {
        captureFirst = ""
        captureSecond = ""
        captureThird = ""
    }
}
