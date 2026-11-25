// SPDX-License-Identifier: AGPL-3.0-only
package org.quayloom.android;

import java.net.URI;

/** Select a real same-workspace history entry, never a native menu signal or blank document. */
final class BackHistory {
    private BackHistory() {}
    static int previousOffset(Endpoint endpoint, int currentIndex, String[] urls) {
        if (endpoint == null || urls == null || currentIndex <= 0 || currentIndex >= urls.length) return 0;
        String reserved = endpoint.path + "/__quayloom_android";
        for (int i = currentIndex - 1; i >= 0; i--) {
            String url = urls[i];
            if (url == null || !endpoint.allows(url)) continue;
            try {
                String path = new URI(url).getPath();
                if (path != null && (path.equals(reserved) || path.startsWith(reserved + "/"))) continue;
                return i - currentIndex;
            } catch (Exception ignored) { /* Reject malformed history, never navigate around the URL policy. */ }
        }
        return 0;
    }
}
